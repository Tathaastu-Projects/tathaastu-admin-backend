const express = require("express");
const StoreCustomer = require("../models/StoreCustomer");
const StoreOrder = require("../models/StoreOrder");
const StoreCart = require("../models/StoreCart");
const StoreWishlist = require("../models/StoreWishlist");

const router = express.Router();

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function mapCustomer(doc, stats = {}) {
  const created = doc.createdAt ? new Date(doc.createdAt) : null;
  return {
    id: String(doc._id),
    name: doc.name || "",
    email: doc.email || "",
    mobile: doc.phone || "",
    phone: doc.phone || "",
    addresses: Array.isArray(doc.addresses) ? doc.addresses : [],
    status: doc.isActive === false ? "suspended" : "active",
    registeredDate:
      created && !Number.isNaN(created.getTime()) ? created.toISOString().slice(0, 10) : "",
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
    orderCount: Number(stats.orderCount || 0),
    totalSpent: Number(stats.totalSpent || 0),
    lastOrderAt: stats.lastOrderAt || null,
    lastOrderNumber: stats.lastOrderNumber || "",
    cartItemCount: Number(stats.cartItemCount || 0),
    wishlistCount: Number(stats.wishlistCount || 0),
  };
}

function formatAddress(addr) {
  if (!addr || typeof addr !== "object") return "";
  return [addr.line1, addr.line2, addr.city, addr.state, addr.pincode, addr.country || "India"]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function mapOrder(order) {
  const pricing = order.pricing || {};
  return {
    id: String(order._id),
    orderNumber: order.orderNumber || "",
    status: order.status || "placed",
    paymentMethod: order.paymentMethod || "",
    paymentStatus: order.paymentStatus || "pending",
    couponCode: order.couponCode || "",
    notes: order.notes || "",
    adminNote: order.adminNote || "",
    customerId: order.customerId ? String(order.customerId) : "",
    customer: order.customer || {},
    shippingAddress: order.shippingAddress || {},
    shippingAddressText: formatAddress(order.shippingAddress),
    items: Array.isArray(order.items) ? order.items : [],
    pricing: {
      subtotal: Number(pricing.subtotal || 0),
      discount: Number(pricing.discount || 0),
      shipping: Number(pricing.shipping || 0),
      total: Number(pricing.total || 0),
    },
    razorpayOrderId: order.razorpayOrderId || "",
    razorpayPaymentId: order.razorpayPaymentId || "",
    createdAt: order.createdAt || null,
    updatedAt: order.updatedAt || null,
  };
}

function ordersForCustomer(orders, customer) {
  const id = String(customer._id || "");
  const email = String(customer.email || "").trim().toLowerCase();
  const phone = digits(customer.phone);
  return orders
    .filter((order) => {
      if (id && order.customerId && String(order.customerId) === id) return true;
      const orderEmail = String(order?.customer?.email || "").trim().toLowerCase();
      const orderPhone = digits(order?.customer?.phone);
      if (email && orderEmail && orderEmail === email) return true;
      if (phone.length >= 10 && orderPhone.length >= 10) {
        return orderPhone.endsWith(phone.slice(-10)) || phone.endsWith(orderPhone.slice(-10));
      }
      return false;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

function cartQty(cart) {
  if (!cart || !Array.isArray(cart.items)) return 0;
  return cart.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

function buildStats(matchedOrders, cart, wishlistCount = 0) {
  if (!matchedOrders.length) {
    return {
      orderCount: 0,
      totalSpent: 0,
      lastOrderAt: null,
      lastOrderNumber: "",
      cartItemCount: cartQty(cart),
      wishlistCount,
    };
  }
  const paidLike = matchedOrders.filter((o) => o.status !== "cancelled");
  const totalSpent = paidLike.reduce((sum, o) => sum + Number(o?.pricing?.total || 0), 0);
  const last = matchedOrders[0];
  return {
    orderCount: matchedOrders.length,
    totalSpent,
    lastOrderAt: last?.createdAt || null,
    lastOrderNumber: last?.orderNumber || "",
    cartItemCount: cartQty(cart),
    wishlistCount,
  };
}

router.get("/", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase();
    const [customers, orders, carts, wishlists] = await Promise.all([
      StoreCustomer.find({}).sort({ createdAt: -1 }).lean(),
      StoreOrder.find({}).sort({ createdAt: -1 }).lean(),
      StoreCart.find({}).lean(),
      StoreWishlist.find({}).lean(),
    ]);

    const cartByCustomer = new Map();
    for (const cart of carts) {
      if (cart.customerId) cartByCustomer.set(String(cart.customerId), cart);
    }
    const wishlistCountByCustomer = new Map();
    for (const item of wishlists) {
      if (!item.customerId) continue;
      const key = String(item.customerId);
      wishlistCountByCustomer.set(key, (wishlistCountByCustomer.get(key) || 0) + 1);
    }

    let rows = customers.map((customer) => {
      const id = String(customer._id);
      const matched = ordersForCustomer(orders, customer);
      const cart = cartByCustomer.get(id);
      return mapCustomer(
        customer,
        buildStats(matched, cart, wishlistCountByCustomer.get(id) || 0),
      );
    });

    if (search) {
      rows = rows.filter((u) => {
        const hay = `${u.name} ${u.email} ${u.mobile} ${u.lastOrderNumber}`.toLowerCase();
        return hay.includes(search);
      });
    }

    res.json({
      success: true,
      data: rows,
      meta: {
        totalCustomers: rows.length,
        totalOrders: orders.length,
        customersWithCart: rows.filter((u) => u.cartItemCount > 0).length,
      },
    });
  } catch (error) {
    console.error("List store customers error:", error);
    res.status(500).json({ success: false, message: "Failed to load customers" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const customer = await StoreCustomer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const id = String(customer._id);
    const [orders, cart, wishlist] = await Promise.all([
      StoreOrder.find({}).sort({ createdAt: -1 }).lean(),
      StoreCart.findOne({ customerId: id }).lean(),
      StoreWishlist.find({ customerId: id }).sort({ createdAt: -1 }).lean(),
    ]);

    const matched = ordersForCustomer(orders, customer);
    const stats = buildStats(matched, cart, wishlist.length);
    const mappedOrders = matched.map(mapOrder);
    const cartItems = Array.isArray(cart?.items) ? cart.items : [];
    const cartTotal = cartItems.reduce(
      (sum, item) => sum + Number(item.unitSalePrice || 0) * Number(item.qty || 0),
      0,
    );

    res.json({
      success: true,
      data: {
        ...mapCustomer(customer, stats),
        history: {
          cart: {
            items: cartItems,
            itemCount: cartQty(cart),
            total: cartTotal,
            updatedAt: cart?.updatedAt || null,
          },
          wishlist: (wishlist || []).map((item) => ({
            id: String(item._id),
            productId: String(item.productId || ""),
            productSlug: item.productSlug || "",
            title: item.title || "",
            image: item.image || "",
            salePrice: Number(item.salePrice || 0),
            createdAt: item.createdAt || null,
          })),
          orders: mappedOrders,
          summary: {
            orderCount: stats.orderCount,
            totalSpent: stats.totalSpent,
            lastOrderAt: stats.lastOrderAt,
            deliveredCount: mappedOrders.filter((o) => o.status === "delivered").length,
            cancelledCount: mappedOrders.filter((o) => o.status === "cancelled").length,
            pendingPaymentCount: mappedOrders.filter((o) => o.paymentStatus === "pending").length,
            cartItemCount: stats.cartItemCount,
            wishlistCount: stats.wishlistCount,
          },
        },
      },
    });
  } catch (error) {
    console.error("Load store customer error:", error);
    res.status(500).json({ success: false, message: "Failed to load user" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const customer = await StoreCustomer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (req.body?.name !== undefined) customer.name = String(req.body.name || "").trim();
    if (req.body?.email !== undefined) {
      customer.email = String(req.body.email || "").trim().toLowerCase();
    }
    if (req.body?.mobile !== undefined || req.body?.phone !== undefined) {
      customer.phone = String(req.body.mobile ?? req.body.phone ?? "").trim();
    }
    if (req.body?.status === "suspended") customer.isActive = false;
    if (req.body?.status === "active") customer.isActive = true;
    if (req.body?.isActive !== undefined) customer.isActive = req.body.isActive !== false;
    await customer.save();
    res.json({ success: true, data: mapCustomer(customer) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update user" });
  }
});

router.patch("/:id/toggle-status", async (req, res) => {
  try {
    const customer = await StoreCustomer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    customer.isActive = customer.isActive === false;
    await customer.save();
    res.json({ success: true, data: mapCustomer(customer) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
});

module.exports = router;
