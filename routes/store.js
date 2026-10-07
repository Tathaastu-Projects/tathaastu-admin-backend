const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const StoreOrder = require("../models/StoreOrder");
const StoreLead = require("../models/StoreLead");
const StoreCollection = require("../models/StoreCollection");
const { storeCollectionsSeed } = require("../data/storeCollectionsSeed");
const {
  CATEGORIES,
  INTENTIONS,
  ZODIAC_SIGNS,
  SORT_OPTIONS,
  queryCatalog,
  queryFacets,
  suggestSearch,
  relatedProducts,
  buildMegaMenu,
} = require("../lib/storeCatalog");

const router = express.Router();

const ORDER_STATUSES = ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"];

async function ensureCollectionsSeeded() {
  const count = await StoreCollection.countDocuments();
  if (count === 0) {
    await StoreCollection.insertMany(storeCollectionsSeed);
  }
}

function collectionFiltersToQuery(defaultFilters = {}) {
  const q = {};
  if (defaultFilters.categories?.length) q.category = defaultFilters.categories.join(",");
  if (defaultFilters.intentions?.length) q.intention = defaultFilters.intentions.join(",");
  if (defaultFilters.onSale) q.onSale = "true";
  if (defaultFilters.featured) q.featured = "true";
  if (defaultFilters.bestSeller) q.bestSeller = "true";
  if (defaultFilters.isNewArrival) q.isNewArrival = "true";
  if (defaultFilters.minPrice != null) q.minPrice = defaultFilters.minPrice;
  if (defaultFilters.maxPrice != null) q.maxPrice = defaultFilters.maxPrice;
  return q;
}

function primaryImage(product) {
  if (!product?.images?.length) return "";
  const primary = product.images.find((img) => img.isPrimary);
  return (primary || product.images[0]).url || "";
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function generateOrderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const orderNumber = `TST-${stamp}-${suffix}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await StoreOrder.exists({ orderNumber });
    if (!exists) return orderNumber;
  }
  return `TST-${stamp}-${Date.now().toString().slice(-6)}`;
}

function resolveLinePricing(product, variant) {
  if (variant) {
    return {
      unitMrp: Number(variant.mrp) || 0,
      unitSalePrice: Number(variant.salePrice) || 0,
      sku: variant.sku || product.sku || "",
      stock: Number(variant.quantity) || 0,
      variantLabel: variant.label || "",
      variantId: variant._id,
    };
  }
  return {
    unitMrp: Number(product.mrp) || 0,
    unitSalePrice: Number(product.salePrice) || 0,
    sku: product.sku || "",
    stock: Number(product.quantity) || 0,
    variantLabel: "",
    variantId: null,
  };
}

async function decrementStock(productId, variantId, quantity) {
  if (variantId) {
    const updated = await Product.findOneAndUpdate(
      {
        _id: productId,
        status: "listed",
        variants: {
          $elemMatch: {
            _id: variantId,
            isActive: true,
            quantity: { $gte: quantity },
          },
        },
      },
      { $inc: { "variants.$[v].quantity": -quantity } },
      {
        arrayFilters: [{ "v._id": variantId, "v.quantity": { $gte: quantity } }],
        new: true,
      }
    );
    return Boolean(updated);
  }

  const updated = await Product.findOneAndUpdate(
    {
      _id: productId,
      status: "listed",
      quantity: { $gte: quantity },
      $or: [{ variants: { $size: 0 } }, { variants: { $exists: false } }],
    },
    { $inc: { quantity: -quantity } },
    { new: true }
  );
  return Boolean(updated);
}

async function restoreStock(productId, variantId, quantity) {
  if (variantId) {
    await Product.findOneAndUpdate(
      { _id: productId, "variants._id": variantId },
      { $inc: { "variants.$[v].quantity": quantity } },
      { arrayFilters: [{ "v._id": variantId }] }
    );
    return;
  }
  await Product.findByIdAndUpdate(productId, { $inc: { quantity } });
}

/**
 * GET /api/store/meta
 * Nav + filter constants for the storefront.
 */
router.get("/meta", (_req, res) => {
  res.json({
    success: true,
    data: {
      categories: CATEGORIES,
      intentions: INTENTIONS,
      zodiacSigns: ZODIAC_SIGNS,
      sortOptions: Object.keys(SORT_OPTIONS).map((value) => ({
        value,
        label: value.replace(/_/g, " "),
      })),
      filterKeys: [
        "category",
        "intention",
        "stone",
        "color",
        "shape",
        "gender",
        "material",
        "mukhi",
        "jewelryType",
        "zodiac",
        "occasion",
        "planet",
        "tags",
        "origin",
        "minPrice",
        "maxPrice",
        "minCarat",
        "maxCarat",
        "minRatti",
        "maxRatti",
        "inStock",
        "onSale",
        "featured",
        "bestSeller",
        "isNewArrival",
        "q",
        "sort",
        "page",
        "limit",
      ],
      paymentMethods: ["cod", "online"],
      currency: "INR",
      trustBadges: [
        { id: "lab", label: "Lab Certified" },
        { id: "ship", label: "Free Shipping" },
        { id: "cod", label: "Cash on Delivery" },
        { id: "secure", label: "100% Secure Payments" },
      ],
      support: {
        email: process.env.STORE_SUPPORT_EMAIL || "support@tathaastu.com",
        phone: process.env.STORE_SUPPORT_PHONE || "",
      },
    },
  });
});

/**
 * GET /api/store/menu
 * Mega-menu structure for header navigation.
 */
router.get("/menu", (_req, res) => {
  res.json({ success: true, data: buildMegaMenu() });
});

/**
 * GET /api/store/catalog
 * Full collection listing with filters + sorting + pagination.
 * Optional: includeFacets=true
 */
router.get("/catalog", async (req, res) => {
  try {
    const result = await queryCatalog(req.query);
    const payload = {
      success: true,
      data: result.items,
      pagination: result.pagination,
      priceStats: result.priceStats,
      appliedFilters: result.params,
      sortOptions: Object.keys(SORT_OPTIONS).map((value) => ({
        value,
        label: value.replace(/_/g, " "),
      })),
    };

    if (result.params.includeFacets) {
      const facets = await queryFacets(req.query);
      payload.facets = facets.facets;
    }

    res.json(payload);
  } catch (error) {
    console.error("Store catalog error:", error);
    res.status(500).json({ success: false, message: "Failed to load catalog" });
  }
});

/**
 * GET /api/store/catalog/facets
 * Sidebar facet counts for current filter context.
 */
router.get("/catalog/facets", async (req, res) => {
  try {
    const facets = await queryFacets(req.query);
    res.json({
      success: true,
      data: facets.facets,
      sortOptions: facets.sortOptions,
      appliedFilters: facets.params,
    });
  } catch (error) {
    console.error("Store facets error:", error);
    res.status(500).json({ success: false, message: "Failed to load facets" });
  }
});

/**
 * GET /api/store/search/suggest?q=
 */
router.get("/search/suggest", async (req, res) => {
  try {
    const data = await suggestSearch(req.query.q, req.query.limit);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Search suggest error:", error);
    res.status(500).json({ success: false, message: "Failed to suggest" });
  }
});

/**
 * GET /api/store/collections
 */
router.get("/collections", async (_req, res) => {
  try {
    await ensureCollectionsSeeded();
    const data = await StoreCollection.find({ isActive: true }).sort({ sortOrder: 1, title: 1 });
    res.json({ success: true, data });
  } catch (error) {
    console.error("Collections list error:", error);
    res.status(500).json({ success: false, message: "Failed to load collections" });
  }
});

/**
 * GET /api/store/collections/:slug
 * Collection SEO page + default filters + optional products (withProducts=true)
 */
router.get("/collections/:slug", async (req, res) => {
  try {
    await ensureCollectionsSeeded();
    const collection = await StoreCollection.findOne({
      slug: String(req.params.slug || "").toLowerCase(),
      isActive: true,
    });
    if (!collection) {
      return res.status(404).json({ success: false, message: "Collection not found" });
    }

    const payload = { success: true, data: { collection } };

    if (req.query.withProducts === "true") {
      const mergedQuery = {
        ...collectionFiltersToQuery(collection.defaultFilters || {}),
        ...req.query,
      };
      delete mergedQuery.withProducts;
      const catalog = await queryCatalog(mergedQuery);
      payload.data.products = catalog.items;
      payload.data.pagination = catalog.pagination;
      payload.data.priceStats = catalog.priceStats;
      payload.data.appliedFilters = catalog.params;

      if (req.query.includeFacets === "true" || req.query.facets === "true") {
        const facets = await queryFacets(mergedQuery);
        payload.data.facets = facets.facets;
        payload.data.sortOptions = facets.sortOptions;
      }
    }

    res.json(payload);
  } catch (error) {
    console.error("Collection detail error:", error);
    res.status(500).json({ success: false, message: "Failed to load collection" });
  }
});

/**
 * GET /api/store/products/:slug
 */
router.get("/products/:slug", async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, status: "listed" });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load product" });
  }
});

/**
 * GET /api/store/products/:slug/related
 */
router.get("/products/:slug/related", async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, status: "listed" });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const data = await relatedProducts(product, req.query.limit);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load related products" });
  }
});

/**
 * Admin: upsert collections seed / list
 */
router.post("/admin/collections/seed", async (_req, res) => {
  try {
    for (const item of storeCollectionsSeed) {
      await StoreCollection.findOneAndUpdate({ slug: item.slug }, item, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      });
    }
    const data = await StoreCollection.find({}).sort({ sortOrder: 1 });
    res.json({ success: true, data, message: "Collections seeded" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to seed collections" });
  }
});

router.get("/admin/collections", async (_req, res) => {
  try {
    await ensureCollectionsSeeded();
    const data = await StoreCollection.find({}).sort({ sortOrder: 1 });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load collections" });
  }
});

router.put("/admin/collections/:slug", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();
    const body = req.body || {};
    const update = {
      title: body.title,
      subtitle: body.subtitle,
      description: body.description,
      bannerImage: body.bannerImage,
      seo: body.seo,
      defaultFilters: body.defaultFilters,
      trustBadges: body.trustBadges,
      comparisonTable: body.comparisonTable,
      faqs: body.faqs,
      isActive: body.isActive !== false,
      sortOrder: Number(body.sortOrder) || 0,
    };
    Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);

    const data = await StoreCollection.findOneAndUpdate(
      { slug },
      { $set: update, $setOnInsert: { slug } },
      { upsert: true, new: true }
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update collection" });
  }
});

/**
 * POST /api/store/orders
 * Create a COD store order. Re-validates listed products, prices, and stock from DB.
 */
router.post("/orders", async (req, res) => {
  const decremented = [];

  try {
    const body = req.body || {};
    const customer = body.customer || {};
    const shippingAddress = body.shippingAddress || {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const paymentMethod = body.paymentMethod === "online" ? "online" : "cod";
    const notes = String(body.notes || "").trim();

    const name = String(customer.name || "").trim();
    const phone = String(customer.phone || "").trim();
    const email = String(customer.email || "").trim().toLowerCase();

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Customer name and phone are required" });
    }
    if (!shippingAddress.line1 || !shippingAddress.city || !shippingAddress.state || !shippingAddress.pincode) {
      return res.status(400).json({ success: false, message: "Complete shipping address is required" });
    }
    if (!rawItems.length) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }
    if (rawItems.length > 50) {
      return res.status(400).json({ success: false, message: "Too many items in cart" });
    }

    const validatedItems = [];

    for (const raw of rawItems) {
      const productId = raw.productId;
      const quantity = Math.max(1, Math.min(99, Number(raw.quantity) || 1));

      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ success: false, message: `Invalid product id: ${productId}` });
      }

      // eslint-disable-next-line no-await-in-loop
      const product = await Product.findOne({ _id: productId, status: "listed" });
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product unavailable: ${raw.title || productId}`,
        });
      }

      const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
      let variant = null;

      if (hasVariants) {
        const variantId = raw.variantId;
        if (!variantId || !mongoose.Types.ObjectId.isValid(variantId)) {
          return res.status(400).json({
            success: false,
            message: `Please select a variant for ${product.title}`,
          });
        }
        variant = product.variants.id(variantId);
        if (!variant || variant.isActive === false) {
          return res.status(400).json({
            success: false,
            message: `Selected variant unavailable for ${product.title}`,
          });
        }
      }

      const pricing = resolveLinePricing(product, variant);
      if (pricing.stock < quantity) {
        return res.status(409).json({
          success: false,
          message: `Insufficient stock for ${product.title}${pricing.variantLabel ? ` (${pricing.variantLabel})` : ""}`,
        });
      }

      // eslint-disable-next-line no-await-in-loop
      const ok = await decrementStock(product._id, pricing.variantId, quantity);
      if (!ok) {
        return res.status(409).json({
          success: false,
          message: `Could not reserve stock for ${product.title}. Please refresh and try again.`,
        });
      }

      decremented.push({
        productId: product._id,
        variantId: pricing.variantId,
        quantity,
      });

      validatedItems.push({
        productId: product._id,
        slug: product.slug,
        title: product.title,
        image: primaryImage(product),
        variantId: pricing.variantId,
        variantLabel: pricing.variantLabel,
        sku: pricing.sku,
        quantity,
        unitMrp: pricing.unitMrp,
        unitSalePrice: pricing.unitSalePrice,
        lineTotal: pricing.unitSalePrice * quantity,
      });
    }

    const subtotal = validatedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const shipping = Number(body.shippingFee) > 0 ? Number(body.shippingFee) : 0;

    let discount = 0;
    let couponCode = "";
    if (body.couponCode) {
      const { findValidCoupon, computeCouponDiscount } = require("../lib/storeCoupons");
      const result = await findValidCoupon(body.couponCode, subtotal);
      if (result.error) {
        return res.status(400).json({ success: false, message: result.error });
      }
      discount = computeCouponDiscount(result.coupon, subtotal);
      couponCode = result.coupon.code;
      await require("../models/StoreCoupon").findByIdAndUpdate(result.coupon._id, {
        $inc: { usedCount: 1 },
      });
    } else if (Number(body.discount) > 0) {
      // ignore client-supplied discounts unless coupon validated
      discount = 0;
    }

    const total = Math.max(0, subtotal - discount + shipping);

    const orderNumber = await generateOrderNumber();
    const order = await StoreOrder.create({
      orderNumber,
      customer: { name, email, phone },
      shippingAddress: {
        line1: String(shippingAddress.line1).trim(),
        line2: String(shippingAddress.line2 || "").trim(),
        city: String(shippingAddress.city).trim(),
        state: String(shippingAddress.state).trim(),
        pincode: String(shippingAddress.pincode).trim(),
        country: String(shippingAddress.country || "India").trim(),
      },
      items: validatedItems,
      pricing: { subtotal, discount, shipping, total },
      paymentMethod,
      paymentStatus: "pending",
      couponCode,
      status: "placed",
      notes,
      stockDecremented: true,
    });

    res.status(201).json({
      success: true,
      data: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        pricing: order.pricing,
        items: order.items,
        customer: order.customer,
        createdAt: order.createdAt,
      },
      message: "Order placed successfully",
    });
  } catch (error) {
    console.error("Create store order error:", error);

    for (const entry of decremented) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await restoreStock(entry.productId, entry.variantId, entry.quantity);
      } catch (restoreError) {
        console.error("Stock restore failed:", restoreError);
      }
    }

    res.status(500).json({ success: false, message: "Failed to place order" });
  }
});

/**
 * GET /api/store/orders/:orderNumber?phone=
 * Public order tracking (phone digits must match).
 */
router.get("/orders/:orderNumber", async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber || "").trim().toUpperCase();
    const phone = normalizePhone(req.query.phone);

    if (!orderNumber || phone.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Order number and a valid phone are required",
      });
    }

    const order = await StoreOrder.findOne({ orderNumber });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (normalizePhone(order.customer.phone) !== phone) {
      return res.status(403).json({ success: false, message: "Phone does not match this order" });
    }

    res.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        pricing: order.pricing,
        items: order.items,
        shippingAddress: order.shippingAddress,
        customer: {
          name: order.customer.name,
          phone: order.customer.phone,
          email: order.customer.email,
        },
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    console.error("Track store order error:", error);
    res.status(500).json({ success: false, message: "Failed to load order" });
  }
});

/**
 * GET /api/store/admin/orders
 * Admin list of store orders (for future admin UI).
 */
router.get("/admin/orders", async (req, res) => {
  try {
    const { status, q, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status && ORDER_STATUSES.includes(String(status))) {
      filter.status = status;
    }
    if (q) {
      const term = String(q).trim();
      filter.$or = [
        { orderNumber: new RegExp(term, "i") },
        { "customer.name": new RegExp(term, "i") },
        { "customer.phone": new RegExp(term, "i") },
        { "customer.email": new RegExp(term, "i") },
      ];
    }

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      StoreOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      StoreOrder.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error("Admin store orders error:", error);
    res.status(500).json({ success: false, message: "Failed to load store orders" });
  }
});

/**
 * GET /api/store/admin/orders/:id
 */
router.get("/admin/orders/:id", async (req, res) => {
  try {
    const order = await StoreOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load order" });
  }
});

/**
 * PATCH /api/store/admin/orders/:id/status
 */
router.patch("/admin/orders/:id/status", async (req, res) => {
  try {
    const status = String(req.body?.status || "");
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const order = await StoreOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const previous = order.status;

    if (status === "cancelled" && previous !== "cancelled" && order.stockDecremented) {
      for (const item of order.items) {
        // eslint-disable-next-line no-await-in-loop
        await restoreStock(item.productId, item.variantId, item.quantity);
      }
      order.stockDecremented = false;
    }

    order.status = status;
    if (req.body?.adminNote !== undefined) {
      order.adminNote = String(req.body.adminNote || "");
    }
    if (req.body?.paymentStatus) {
      const allowedPay = ["pending", "paid", "failed", "refunded"];
      if (allowedPay.includes(String(req.body.paymentStatus))) {
        order.paymentStatus = req.body.paymentStatus;
      }
    }

    await order.save();
    res.json({ success: true, data: order, message: `Order ${previous} → ${status}` });
  } catch (error) {
    console.error("Update store order status error:", error);
    res.status(500).json({ success: false, message: "Failed to update order status" });
  }
});

/**
 * POST /api/store/newsletter
 */
router.post("/newsletter", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "Valid email is required" });
    }

    const existing = await StoreLead.findOne({ type: "newsletter", email });
    if (existing) {
      return res.json({ success: true, data: existing, message: "Already subscribed" });
    }

    const lead = await StoreLead.create({
      type: "newsletter",
      email,
      source: String(req.body?.source || "store"),
    });

    res.status(201).json({ success: true, data: lead, message: "Subscribed successfully" });
  } catch (error) {
    console.error("Newsletter error:", error);
    res.status(500).json({ success: false, message: "Failed to subscribe" });
  }
});

/**
 * POST /api/store/leads/consultation
 */
router.post("/leads/consultation", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const message = String(req.body?.message || "").trim();
    const interest = String(req.body?.interest || "").trim();

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Name and phone are required" });
    }

    const lead = await StoreLead.create({
      type: "consultation",
      name,
      phone,
      email,
      message,
      interest,
      source: String(req.body?.source || "store"),
    });

    res.status(201).json({
      success: true,
      data: { id: lead._id, type: lead.type, status: lead.status },
      message: "Consultation request received",
    });
  } catch (error) {
    console.error("Consultation lead error:", error);
    res.status(500).json({ success: false, message: "Failed to submit consultation request" });
  }
});

/**
 * GET /api/store/admin/leads
 */
router.get("/admin/leads", async (req, res) => {
  try {
    const { type, status, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (type === "newsletter" || type === "consultation") filter.type = type;
    if (status === "new" || status === "contacted" || status === "closed") filter.status = status;

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      StoreLead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      StoreLead.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load leads" });
  }
});

module.exports = router;
