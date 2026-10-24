const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Types } = require("../lib/fileDb");
const StoreCustomer = require("../models/StoreCustomer");
const StoreReview = require("../models/StoreReview");
const StoreCoupon = require("../models/StoreCoupon");
const StoreWishlist = require("../models/StoreWishlist");
const StoreCart = require("../models/StoreCart");
const StoreOrder = require("../models/StoreOrder");
const Product = require("../models/Product");
const { StoreBanner, StoreBlogPost, StorePage } = require("../models/StoreCms");
const { findValidCoupon, computeCouponDiscount } = require("../lib/storeCoupons");
const { signCustomerToken, optionalStoreAuth, requireStoreAuth } = require("../middleware/storeAuth");
const { restoreStock } = require("../lib/storeStock");
const {
  uploadBannerImage,
  uploadFeaturedMedia,
  uploadTestimonialImages,
  uploadReelsMedia,
  uploadAboutMedia,
  uploadBlogMedia,
} = require("../middleware/upload");
const { execFile } = require("child_process");
const https = require("https");
const { deleteStoredFile, deleteUploadByUrl, saveLocalFile } = require("../lib/storedFiles");
const { HERO_CATEGORIES, HOME_SLIDER_KEY, categoryById } = require("../lib/heroCategories");
const { CATEGORY_TILES, TILE_SLUG, tileById } = require("../lib/categoryTiles");
const {
  ABOUT_IMAGE,
  ABOUT_WIDTH,
  ABOUT_HEIGHT,
  ABOUT_INTRO,
  ABOUT_FEATURES,
  ABOUT_SLUG,
  aboutFeatureById,
} = require("../lib/aboutSection");

const router = express.Router();

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function publicCustomer(customer) {
  return {
    id: customer._id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    addresses: customer.addresses || [],
    createdAt: customer.createdAt,
  };
}

async function refreshProductRating(productId) {
  const stats = await StoreReview.aggregate([
    { $match: { productId: String(productId), status: "approved" } },
    {
      $group: {
        _id: "$productId",
        ratingAvg: { $avg: "$rating" },
        ratingCount: { $sum: 1 },
      },
    },
  ]);
  const avg = stats[0]?.ratingAvg || 0;
  const count = stats[0]?.ratingCount || 0;
  await Product.findByIdAndUpdate(productId, {
    ratingAvg: Math.round(avg * 10) / 10,
    ratingCount: count,
  });
}

/* ------------------------ Auth ------------------------ */

router.post("/auth/register", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim();
    const password = String(req.body?.password || "");

    if (!name || !email || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password (min 6 chars) are required",
      });
    }

    const exists = await StoreCustomer.findOne({ email });
    if (exists) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    const passwordHash = await StoreCustomer.hashPassword(password);
    const customer = await StoreCustomer.create({
      name,
      email,
      phone,
      passwordHash,
      isActive: true,
      addresses: [],
    });
    const token = signCustomerToken(customer);
    res.status(201).json({ success: true, data: { customer: publicCustomer(customer), token } });
  } catch (error) {
    console.error("Store register error:", error);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const customer = await StoreCustomer.findOne({ email });
    if (
      !customer ||
      customer.isActive === false ||
      !(await customer.comparePassword(password))
    ) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    const token = signCustomerToken(customer);
    res.json({ success: true, data: { customer: publicCustomer(customer), token } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

router.get("/auth/me", requireStoreAuth, async (req, res) => {
  res.json({ success: true, data: publicCustomer(req.storeCustomer) });
});

router.put("/auth/me", requireStoreAuth, async (req, res) => {
  try {
    const customer = await StoreCustomer.findById(req.storeCustomer._id);
    if (!customer) return res.status(404).json({ success: false, message: "Not found" });
    if (req.body?.name) customer.name = String(req.body.name).trim();
    if (req.body?.phone !== undefined) customer.phone = String(req.body.phone).trim();
    if (Array.isArray(req.body?.addresses)) customer.addresses = req.body.addresses;
    await customer.save();
    res.json({ success: true, data: publicCustomer(customer) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update profile" });
  }
});

router.get("/auth/orders", requireStoreAuth, async (req, res) => {
  try {
    const email = req.storeCustomer.email;
    const phone = String(req.storeCustomer.phone || "").replace(/\D/g, "");
    const filter = {
      $or: [{ "customer.email": email }],
    };
    if (phone.length >= 10) filter.$or.push({ "customer.phone": new RegExp(`${phone}$`) });
    const orders = await StoreOrder.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load orders" });
  }
});

/* ------------------------ Reviews ------------------------ */

router.get("/products/:slug/reviews", async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const filter = { productSlug: req.params.slug, status: "approved" };
    const [items, total] = await Promise.all([
      StoreReview.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      StoreReview.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
});

router.post("/products/:slug/reviews", optionalStoreAuth, async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, status: "listed" });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const rating = Number(req.body?.rating);
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating 1-5 is required" });
    }

    const name =
      req.storeCustomer?.name ||
      String(req.body?.name || "").trim() ||
      "Customer";
    const email = req.storeCustomer?.email || String(req.body?.email || "").trim().toLowerCase();

    const review = await StoreReview.create({
      productId: product._id,
      productSlug: product.slug,
      customerId: req.storeCustomer?._id || null,
      name,
      email,
      rating,
      title: String(req.body?.title || "").trim(),
      body: String(req.body?.body || "").trim(),
      images: Array.isArray(req.body?.images) ? req.body.images.slice(0, 4) : [],
      status: "approved",
    });

    await refreshProductRating(product._id);
    res.status(201).json({ success: true, data: review, message: "Review submitted" });
  } catch (error) {
    console.error("Create review error:", error);
    res.status(500).json({ success: false, message: "Failed to submit review" });
  }
});

router.get("/admin/reviews", async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const [items, total] = await Promise.all([
      StoreReview.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      StoreReview.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: items,
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
});

router.patch("/admin/reviews/:id/status", async (req, res) => {
  try {
    const status = String(req.body?.status || "");
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }
    const review = await StoreReview.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!review) return res.status(404).json({ success: false, message: "Not found" });
    await refreshProductRating(review.productId);
    res.json({ success: true, data: review });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update review" });
  }
});

/* ------------------------ Coupons ------------------------ */

router.post("/coupons/validate", async (req, res) => {
  try {
    const subtotal = Number(req.body?.subtotal) || 0;
    const result = await findValidCoupon(req.body?.code, subtotal);
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    const discount = computeCouponDiscount(result.coupon, subtotal);
    res.json({
      success: true,
      data: {
        code: result.coupon.code,
        type: result.coupon.type,
        value: result.coupon.value,
        discount,
        description: result.coupon.description,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to validate coupon" });
  }
});

router.get("/admin/coupons", async (_req, res) => {
  try {
    const data = await StoreCoupon.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load coupons" });
  }
});

router.post("/admin/coupons", async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ success: false, message: "Code required" });
    const coupon = await StoreCoupon.create({
      code,
      description: String(req.body?.description || ""),
      type: req.body?.type === "flat" ? "flat" : "percent",
      value: Number(req.body?.value) || 0,
      minOrderAmount: Number(req.body?.minOrderAmount) || 0,
      maxDiscount: req.body?.maxDiscount != null ? Number(req.body.maxDiscount) : null,
      usageLimit: req.body?.usageLimit != null ? Number(req.body.usageLimit) : null,
      startsAt: req.body?.startsAt || null,
      endsAt: req.body?.endsAt || null,
      isActive: req.body?.isActive !== false,
      applicableCategories: Array.isArray(req.body?.applicableCategories)
        ? req.body.applicableCategories
        : [],
    });
    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "Coupon code already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to create coupon" });
  }
});

router.put("/admin/coupons/:id", async (req, res) => {
  try {
    const update = { ...req.body };
    if (update.code) update.code = String(update.code).trim().toUpperCase();
    const coupon = await StoreCoupon.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!coupon) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update coupon" });
  }
});

/* ------------------------ Wishlist ------------------------ */

function wishlistOwnerFilter(req) {
  if (req.storeCustomer?._id) return { customerId: req.storeCustomer._id };
  const guestId = String(req.headers["x-guest-id"] || req.query.guestId || "").trim();
  if (!guestId) return null;
  return { guestId };
}

router.get("/wishlist", optionalStoreAuth, async (req, res) => {
  try {
    const owner = wishlistOwnerFilter(req);
    if (!owner) {
      return res.status(400).json({
        success: false,
        message: "Login or provide X-Guest-Id header",
      });
    }
    const items = await StoreWishlist.find(owner).sort({ createdAt: -1 });
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load wishlist" });
  }
});

router.post("/wishlist", optionalStoreAuth, async (req, res) => {
  try {
    const owner = wishlistOwnerFilter(req);
    if (!owner) {
      return res.status(400).json({
        success: false,
        message: "Login or provide X-Guest-Id header",
      });
    }
    const productId = req.body?.productId;
    if (!Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Valid productId required" });
    }
    const product = await Product.findOne({ _id: productId, status: "listed" });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const payload = {
      ...owner,
      productId: product._id,
      productSlug: product.slug,
      title: product.title,
      image: product.images?.find((i) => i.isPrimary)?.url || product.images?.[0]?.url || "",
      salePrice: product.salePrice,
    };

    const item = await StoreWishlist.findOneAndUpdate(
      { ...owner, productId: product._id },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    if (error.code === 11000) {
      return res.json({ success: true, message: "Already in wishlist" });
    }
    res.status(500).json({ success: false, message: "Failed to add wishlist item" });
  }
});

router.delete("/wishlist/:productId", optionalStoreAuth, async (req, res) => {
  try {
    const owner = wishlistOwnerFilter(req);
    if (!owner) {
      return res.status(400).json({ success: false, message: "Login or provide X-Guest-Id header" });
    }
    await StoreWishlist.deleteOne({ ...owner, productId: req.params.productId });
    res.json({ success: true, message: "Removed" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to remove wishlist item" });
  }
});

/* ------------------------ Cart (synced for admin tracking) ------------------------ */

function cartOwnerFilter(req) {
  if (req.storeCustomer?._id) return { customerId: String(req.storeCustomer._id) };
  const guestId = String(req.headers["x-guest-id"] || req.query.guestId || "").trim();
  if (!guestId) return null;
  return { guestId };
}

function normalizeCartItems(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 50)
    .map((item) => ({
      productId: String(item?.productId || ""),
      slug: String(item?.slug || ""),
      title: String(item?.title || ""),
      image: String(item?.image || ""),
      variantId: item?.variantId ? String(item.variantId) : null,
      variantLabel: String(item?.variantLabel || ""),
      unitSalePrice: Number(item?.unitSalePrice) || 0,
      unitMrp: Number(item?.unitMrp) || 0,
      qty: Math.max(1, Math.min(99, Number(item?.qty) || 1)),
      maxQty: Number(item?.maxQty) || 99,
    }))
    .filter((item) => item.productId && item.title);
}

router.get("/cart", optionalStoreAuth, async (req, res) => {
  try {
    const owner = cartOwnerFilter(req);
    if (!owner) {
      return res.status(400).json({
        success: false,
        message: "Login or provide X-Guest-Id header",
      });
    }
    const cart = await StoreCart.findOne(owner).lean();
    res.json({
      success: true,
      data: {
        items: cart?.items || [],
        updatedAt: cart?.updatedAt || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load cart" });
  }
});

router.put("/cart", optionalStoreAuth, async (req, res) => {
  try {
    const owner = cartOwnerFilter(req);
    if (!owner) {
      return res.status(400).json({
        success: false,
        message: "Login or provide X-Guest-Id header",
      });
    }
    const items = normalizeCartItems(req.body?.items);
    let cart = await StoreCart.findOne(owner);
    if (cart) {
      cart.items = items;
      await cart.save();
    } else {
      cart = await StoreCart.create({ ...owner, items });
    }
    res.json({
      success: true,
      data: {
        items: cart.items || items,
        updatedAt: cart.updatedAt || null,
      },
    });
  } catch (error) {
    console.error("Save cart error:", error);
    res.status(500).json({ success: false, message: "Failed to save cart" });
  }
});

/* ------------------------ Payments (Razorpay) ------------------------ */

router.post("/payments/razorpay/create-order", async (req, res) => {
  try {
    const amountRupees = Number(req.body?.amount);
    const receipt = String(req.body?.receipt || `TST-${Date.now()}`);
    if (!amountRupees || amountRupees < 1) {
      return res.status(400).json({ success: false, message: "Valid amount required" });
    }

    const keyId = process.env.RAZORPAY_KEY_ID || "";
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    const amountPaise = Math.round(amountRupees * 100);

    if (!keyId || !keySecret) {
      // Dev fallback so storefront can be wired before keys are configured
      return res.json({
        success: true,
        data: {
          id: `order_dev_${Date.now()}`,
          amount: amountPaise,
          currency: "INR",
          receipt,
          status: "created",
          keyId: keyId || "rzp_test_dev",
          mode: "mock",
        },
        message: "Razorpay keys missing — mock order returned for development",
      });
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        payment_capture: 1,
        notes: req.body?.notes || {},
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: data?.error?.description || "Failed to create Razorpay order",
        data,
      });
    }

    res.json({
      success: true,
      data: {
        id: data.id,
        amount: data.amount,
        currency: data.currency,
        receipt: data.receipt,
        status: data.status,
        keyId,
        mode: "live",
      },
    });
  } catch (error) {
    console.error("Razorpay create error:", error);
    res.status(500).json({ success: false, message: "Payment order failed" });
  }
});

router.post("/payments/razorpay/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, storeOrderId } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing Razorpay payment fields" });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    let valid = false;

    if (!keySecret && String(razorpay_order_id).startsWith("order_dev_")) {
      valid = true;
    } else if (keySecret) {
      const expected = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      valid = expected === razorpay_signature;
    }

    if (!valid) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    if (storeOrderId && Types.ObjectId.isValid(storeOrderId)) {
      await StoreOrder.findByIdAndUpdate(storeOrderId, {
        paymentMethod: "online",
        paymentStatus: "paid",
        status: "confirmed",
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
      });
    }

    res.json({
      success: true,
      message: "Payment verified",
      data: { razorpay_order_id, razorpay_payment_id },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Payment verification failed" });
  }
});

/**
 * Cancel an unpaid online order (e.g. Razorpay modal dismissed) and restore stock.
 * POST /api/store/payments/cancel-unpaid
 */
router.post("/payments/cancel-unpaid", async (req, res) => {
  try {
    const storeOrderId = req.body?.storeOrderId;
    let order = null;

    if (storeOrderId && Types.ObjectId.isValid(storeOrderId)) {
      order = await StoreOrder.findById(storeOrderId);
    }

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.paymentMethod !== "online") {
      return res.status(400).json({
        success: false,
        message: "Only online payment orders can be cancelled this way",
      });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({ success: false, message: "Order already paid" });
    }

    if (order.status === "cancelled") {
      return res.json({
        success: true,
        message: "Order already cancelled",
        data: { orderNumber: order.orderNumber, status: order.status },
      });
    }

    if (order.paymentStatus !== "pending" || !["placed", "confirmed"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled in its current state",
      });
    }

    if (order.stockDecremented) {
      for (const item of order.items) {
        // eslint-disable-next-line no-await-in-loop
        await restoreStock(item.productId, item.variantId, item.quantity);
      }
      order.stockDecremented = false;
    }

    order.status = "cancelled";
    order.paymentStatus = "failed";
    await order.save();

    res.json({
      success: true,
      message: "Unpaid order cancelled and stock restored",
      data: { orderNumber: order.orderNumber, status: order.status },
    });
  } catch (error) {
    console.error("Cancel unpaid order error:", error);
    res.status(500).json({ success: false, message: "Failed to cancel unpaid order" });
  }
});

/* ------------------------ CMS: banners / blogs / pages ------------------------ */

router.get("/content/home", async (_req, res) => {
  const { getCached, setCached } = require("../lib/responseCache");
  const cacheKey = "store:content:home";
  const cached = getCached(cacheKey);
  if (cached) {
    res.set("X-Cache", "HIT");
    return res.status(cached.status).json(cached.body);
  }

  try {
    const Product = require("../models/Product");
    const { INTENTIONS, ZODIAC_SIGNS, CATEGORIES } = require("../lib/storeCatalog");

    const intentionMeta = {
      Peace: { color: "#7BA3A8", icon: "peace" },
      Wealth: { color: "#C6A15B", icon: "wealth" },
      Health: { color: "#6B9B7A", icon: "health" },
      Protection: { color: "#8B5E5E", icon: "protection" },
      Relationship: { color: "#C97B84", icon: "love" },
      Success: { color: "#4F6F8F", icon: "success" },
      Spirituality: { color: "#6E5A8A", icon: "spirit" },
    };

    const [
      banners,
      posts,
      listedProducts,
      faqs,
      categoryTiles,
      aboutSection,
      featuredFinds,
      screenToSpace,
      testimonials,
    ] = await Promise.all([
      StoreBanner.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }),
      StoreBlogPost.find({ status: "published" }).sort({ publishedAt: -1 }).limit(6),
      Product.find({ status: "listed" }).sort({ createdAt: -1 }).lean(),
      readHomeFaqs(),
      readCategoryTiles(),
      readAboutSection(),
      readFeaturedFinds(),
      readScreenToSpace(),
      readTestimonials(),
    ]);

    const countMap = {};
    const sampleByCategory = {};
    for (const product of listedProducts) {
      const cat = product.category || "other";
      countMap[cat] = (countMap[cat] || 0) + 1;
      if (!sampleByCategory[cat]) sampleByCategory[cat] = product;
    }

    const categoryCards = CATEGORIES.map((cat) => {
      const sample = sampleByCategory[cat];
      return {
        id: cat,
        label:
          categoryById(cat)?.label ||
          cat
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
        href: `/shop/${cat}`,
        productCount: countMap[cat] || 0,
        image:
          sample?.images?.find((i) => i.isPrimary)?.url ||
          sample?.images?.[0]?.url ||
          "",
      };
    });

    const intentionProducts = {};
    for (const intention of INTENTIONS) {
      const hit = listedProducts.find((p) =>
        Array.isArray(p.intentions) ? p.intentions.includes(intention) : false
      );
      if (hit) intentionProducts[intention] = hit;
    }

    const rashiProducts = listedProducts
      .filter((p) => /राशि|rashi/i.test(String(p.title || "")))
      .slice(0, 24);

    const latestProducts = listedProducts.slice(0, 20);
    const featured = listedProducts.filter((p) => p.isFeatured).slice(0, 16);
    const bestsellers = listedProducts.filter((p) => p.isBestSeller).slice(0, 16);
    const newArrivals = listedProducts.filter((p) => p.isNewArrival).slice(0, 16);

    const body = {
      success: true,
      data: {
        brand: {
          name: "Tathaastu",
          tagline: "Authentic Rudraksha & Gemstones",
        },
        banners,
        homeSliderManaged: true,
        categoryTiles,
        aboutSection,
        featuredFinds,
        screenToSpace,
        testimonials,
        trustBadges: [
          { id: "authentic", label: "Authentic & Certified", description: "Curated listed products" },
          { id: "ship", label: "Free Shipping", description: "On eligible orders" },
          { id: "returns", label: "Easy Returns", description: "Support within 7 days" },
          { id: "cod", label: "COD Available", description: "Pay on delivery" },
        ],
        intentions: INTENTIONS.map((name) => ({
          id: name,
          label: name === "Relationship" ? "Love" : name,
          href: `/intention/${name}`,
          color: intentionMeta[name]?.color || "#2F4F3E",
          icon: intentionMeta[name]?.icon || "spark",
        })),
        intentionProducts,
        rashiProducts,
        latestProducts,
        categories: categoryCards,
        zodiacSigns: ZODIAC_SIGNS.map((sign) => ({
          id: sign,
          label: sign,
          href: `/shop?zodiac=${encodeURIComponent(sign)}`,
        })),
        carousels: {
          featured: featured.length ? featured : latestProducts.slice(0, 16),
          bestsellers: bestsellers.length ? bestsellers : latestProducts.slice(0, 16),
          newArrivals: newArrivals.length ? newArrivals : latestProducts.slice(0, 16),
        },
        latestBlogs: posts,
        faqs,
        consultCta: {
          title: "Not sure what to buy? Talk to our experts",
          subtitle: "Get a free recommendation aligned to your intention.",
          ctaLabel: "Consult Now",
          ctaHref: "/contact",
        },
        stats: {
          listedProducts: listedProducts.length,
          categoryCounts: countMap,
        },
      },
    };

    setCached(cacheKey, body, 10000);
    res.set("X-Cache", "MISS");
    res.json(body);
  } catch (error) {
    console.error("Home content error:", error);
    res.status(500).json({ success: false, message: "Failed to load home content" });
  }
});

router.get("/banners", async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.key) filter.key = String(req.query.key);
    const data = await StoreBanner.find(filter).sort({ sortOrder: 1 });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load banners" });
  }
});

router.get("/blogs", async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
    const filter = { status: "published" };
    if (req.query.tag) filter.tags = String(req.query.tag);
    const [items, total] = await Promise.all([
      StoreBlogPost.find(filter)
        .sort({ publishedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      StoreBlogPost.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load blogs" });
  }
});

router.get("/blogs/:slug", async (req, res) => {
  try {
    const post = await StoreBlogPost.findOne({ slug: req.params.slug, status: "published" });
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load post" });
  }
});

router.get("/pages/:slug", async (req, res) => {
  try {
    const page = await StorePage.findOne({ slug: req.params.slug, isActive: true });
    if (!page) return res.status(404).json({ success: false, message: "Page not found" });
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load page" });
  }
});

router.post("/admin/banners", async (req, res) => {
  try {
    const banner = await StoreBanner.create(req.body || {});
    res.status(201).json({ success: true, data: banner });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create banner" });
  }
});

router.put("/admin/banners/:id", async (req, res) => {
  try {
    const banner = await StoreBanner.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!banner) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: banner });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update banner" });
  }
});

function removeBannerFile(imageUrl) {
  if (!imageUrl || !String(imageUrl).startsWith("/uploads/")) return;
  deleteUploadByUrl(imageUrl).catch(() => {});
}

const CATEGORY_BANNER_KEY = "category-banner";

function readBannerFields(body, file, defaultKey = HOME_SLIDER_KEY) {
  const title = String(body?.title || "").trim();
  const titleLine2 = String(body?.titleLine2 || "").trim();
  const subtitle = String(body?.subtitle || "").trim();
  const category = String(body?.category || "").trim();
  const cat = categoryById(category);
  const ctaLabel = body?.ctaLabel !== undefined ? String(body.ctaLabel).trim() : "";
  const sortOrder = Number(body?.sortOrder);
  const isActive = body?.isActive === undefined || body?.isActive === ""
    ? true
    : body.isActive === true || body.isActive === "true";
  const rawKey = body?.key ? String(body.key).trim() : defaultKey;
  const payload = {
    key: rawKey || defaultKey,
    title,
    titleLine2,
    subtitle,
    category: cat ? cat.id : (category || ""),
    ctaLabel,
    ctaHref: cat ? cat.href : (body?.ctaHref || (category ? `/shop/${category}` : "/shop")),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    isActive,
  };
  if (file) {
    payload.imageUrl = `/uploads/banners/${file.filename}`;
  } else if (body?.imageUrl !== undefined) {
    payload.imageUrl = String(body.imageUrl).trim();
  }
  return payload;
}

async function readSiteLogo() {
  const page = await StorePage.findOne({ slug: "site-logo" }).select("content").lean();
  const value = page?.content ? String(page.content).trim() : "";
  // Only backend-managed logos (/uploads/...) — never a storefront /public file
  if (value.startsWith("/uploads/")) return value;
  return "";
}

router.get("/admin/home-banners", async (_req, res) => {
  try {
    const [data, logoUrl] = await Promise.all([
      StoreBanner.find({ key: HOME_SLIDER_KEY }).sort({ sortOrder: 1, createdAt: 1 }),
      readSiteLogo(),
    ]);
    res.json({ success: true, data, categories: HERO_CATEGORIES, logoUrl });
  } catch (error) {
    console.error("List home banners error:", error);
    res.status(500).json({ success: false, message: "Failed to load banners" });
  }
});

router.put("/admin/logo", (req, res) => {
  uploadBannerImage.single("image")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Logo image is required" });
      }
      const imageUrl = `/uploads/banners/${req.file.filename}`;
      const existing = await StorePage.findOne({ slug: "site-logo" }).select("content").lean();
      if (existing?.content && existing.content !== imageUrl) removeBannerFile(existing.content);
      await StorePage.findOneAndUpdate(
        { slug: "site-logo" },
        {
          $set: { title: "Site logo", content: imageUrl, isActive: true },
          $setOnInsert: { slug: "site-logo" },
        },
        { upsert: true, new: true }
      );
      res.json({ success: true, data: { imageUrl } });
    } catch (error) {
      console.error("Update logo error:", error);
      res.status(500).json({ success: false, message: "Failed to update logo" });
    }
  });
});

router.delete("/admin/logo", async (_req, res) => {
  try {
    const existing = await StorePage.findOne({ slug: "site-logo" }).select("content").lean();
    if (existing?.content) {
      removeBannerFile(existing.content);
    }
    await StorePage.findOneAndUpdate(
      { slug: "site-logo" },
      {
        $set: { title: "Site logo", content: "", isActive: true },
        $setOnInsert: { slug: "site-logo" },
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: { imageUrl: "" }, message: "Logo removed" });
  } catch (error) {
    console.error("Delete logo error:", error);
    res.status(500).json({ success: false, message: "Failed to remove logo" });
  }
});

async function readCategoryTiles() {
  const page = await StorePage.findOne({ slug: TILE_SLUG }).select("content").lean();
  let saved = [];
  if (page?.content) {
    try {
      const parsed = JSON.parse(page.content);
      if (Array.isArray(parsed)) saved = parsed;
    } catch (_error) {
      saved = [];
    }
  }
  const byId = Object.fromEntries(saved.map((item) => [item.id, item]));
  return CATEGORY_TILES.map((tile) => {
    const custom = byId[tile.id] || {};
    let image = String(custom.image || tile.image || "");
    // Migrate legacy storefront /public paths → backend uploads
    if (image.startsWith("/categories/")) {
      image = `/uploads${image}`;
    }
    return {
      ...tile,
      label: String(custom.label || tile.label),
      image,
    };
  });
}

async function writeCategoryTiles(tiles) {
  const content = JSON.stringify(
    tiles.map((tile) => ({ id: tile.id, label: tile.label, image: tile.image }))
  );
  await StorePage.findOneAndUpdate(
    { slug: TILE_SLUG },
    {
      $set: { title: "Shop by Category", content, isActive: true },
      $setOnInsert: { slug: TILE_SLUG },
    },
    { upsert: true }
  );
}

router.get("/admin/category-tiles", async (_req, res) => {
  try {
    const data = await readCategoryTiles();
    res.json({ success: true, data });
  } catch (error) {
    console.error("List category tiles error:", error);
    res.status(500).json({ success: false, message: "Failed to load categories" });
  }
});

router.put("/admin/category-tiles/:id", (req, res) => {
  uploadBannerImage.single("image")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      const base = tileById(req.params.id);
      if (!base) {
        if (req.file) removeBannerFile(`/uploads/banners/${req.file.filename}`);
        return res.status(404).json({ success: false, message: "Category frame not found" });
      }
      const label = String(req.body?.label || "").trim();
      if (!label) {
        if (req.file) removeBannerFile(`/uploads/banners/${req.file.filename}`);
        return res.status(400).json({ success: false, message: "Name is required" });
      }
      const tiles = await readCategoryTiles();
      const current = tiles.find((tile) => tile.id === base.id);
      let image = current?.image || base.image;
      if (req.file) {
        const nextImage = `/uploads/banners/${req.file.filename}`;
        if (image !== nextImage) removeBannerFile(image);
        image = nextImage;
      }
      const next = tiles.map((tile) => (tile.id === base.id ? { ...tile, label, image } : tile));
      await writeCategoryTiles(next);
      res.json({ success: true, data: next.find((tile) => tile.id === base.id) });
    } catch (error) {
      console.error("Update category tile error:", error);
      res.status(500).json({ success: false, message: "Failed to update category" });
    }
  });
});

router.delete("/admin/category-tiles/:id/image", async (req, res) => {
  try {
    const base = tileById(req.params.id);
    if (!base) {
      return res.status(404).json({ success: false, message: "Category frame not found" });
    }
    const tiles = await readCategoryTiles();
    const current = tiles.find((tile) => tile.id === base.id);
    if (current?.image) {
      // Only delete uploaded overrides, keep seed files under /uploads/categories/
      if (current.image !== base.image && String(current.image).startsWith("/uploads/banners/")) {
        removeBannerFile(current.image);
      }
    }
    const next = tiles.map((tile) => (tile.id === base.id ? { ...tile, image: base.image || "" } : tile));
    await writeCategoryTiles(next);
    res.json({ success: true, data: next.find((tile) => tile.id === base.id), message: "Category photo reset" });
  } catch (error) {
    console.error("Delete category tile image error:", error);
    res.status(500).json({ success: false, message: "Failed to reset category photo" });
  }
});

/** About media: direct uploads only (no live/paste URLs). */
function aboutMedia(current, body, files = {}) {
  let image = String(current?.image || "");
  const removeImage = String(body?.removeImage || "") === "true" || body?.removeImage === true;
  const removeVideo = String(body?.removeVideo || "") === "true" || body?.removeVideo === true;
  const imageFile = files.image || null;
  const videoFile = files.video || null;

  if (removeImage) {
    if (image) removeBannerFile(image);
    image = "";
  } else if (imageFile) {
    const nextImage = `/uploads/about/${imageFile.filename}`;
    if (image && image !== nextImage) removeBannerFile(image);
    image = nextImage;
  } else if (/^https?:\/\//i.test(image)) {
    // Drop legacy external URLs — media must live under /uploads
    image = "";
  }

  let videoUrl = String(current?.videoUrl || "");
  let playbackUrl = String(current?.playbackUrl || "");
  if (removeVideo) {
    if (playbackUrl) removeTestimonialVideo(playbackUrl);
    if (videoUrl && videoUrl !== playbackUrl) removeBannerFile(videoUrl);
    playbackUrl = "";
    videoUrl = "";
  } else if (videoFile) {
    const nextVideo = `/uploads/about/${videoFile.filename}`;
    if (playbackUrl && playbackUrl !== nextVideo) removeTestimonialVideo(playbackUrl);
    if (videoUrl && videoUrl !== nextVideo && videoUrl !== playbackUrl) removeBannerFile(videoUrl);
    videoUrl = nextVideo;
    playbackUrl = nextVideo;
  } else if (/^https?:\/\//i.test(videoUrl) || /^https?:\/\//i.test(playbackUrl)) {
    videoUrl = "";
    playbackUrl = "";
  }

  return { image, videoUrl, playbackUrl };
}

async function readAboutSection() {
  const page = await StorePage.findOne({ slug: ABOUT_SLUG }).select("content").lean();
  let saved = {};
  if (page?.content) {
    try {
      saved = JSON.parse(page.content) || {};
    } catch (_error) {
      saved = {};
    }
  }
  const savedFeatures = Array.isArray(saved.features) ? saved.features : [];
  const byId = Object.fromEntries(savedFeatures.map((item) => [item.id, item]));
  return {
    image: String(saved.image || "").includes("/about/abhimantrit-banner") ? "" : String(saved.image || ABOUT_IMAGE),
    imageUrl: /^https?:\/\//i.test(String(saved.image || "")) ? String(saved.image) : "",
    videoUrl: String(saved.videoUrl || ""),
    playbackUrl: String(saved.playbackUrl || ""),
    intro: String(saved.intro || ABOUT_INTRO),
    width: ABOUT_WIDTH,
    height: ABOUT_HEIGHT,
    features: ABOUT_FEATURES.map((item) => {
      const custom = byId[item.id] || {};
      const image = String(custom.image || item.image || "");
      return {
        ...item,
        title: String(custom.title || item.title),
        description: String(custom.description || item.description),
        image,
        imageUrl: /^https?:\/\//i.test(image) ? image : "",
        videoUrl: String(custom.videoUrl || ""),
        playbackUrl: String(custom.playbackUrl || ""),
      };
    }),
  };
}

async function writeAboutSection(section) {
  await StorePage.findOneAndUpdate(
    { slug: ABOUT_SLUG },
    {
      $set: {
        title: "About Abhimantrit",
        content: JSON.stringify({
          image: section.image,
          videoUrl: section.videoUrl || "",
          playbackUrl: section.playbackUrl || "",
          intro: section.intro,
          features: section.features.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            image: item.image || "",
            videoUrl: item.videoUrl || "",
            playbackUrl: item.playbackUrl || "",
          })),
        }),
        isActive: true,
      },
      $setOnInsert: { slug: ABOUT_SLUG },
    },
    { upsert: true }
  );
}

router.get("/admin/about", async (_req, res) => {
  try {
    const data = await readAboutSection();
    res.json({ success: true, data });
  } catch (error) {
    console.error("Load about section error:", error);
    res.status(500).json({ success: false, message: "Failed to load about section" });
  }
});

router.delete("/admin/about/image", async (_req, res) => {
  try {
    const section = await readAboutSection();
    if (section.image) removeBannerFile(section.image);
    section.image = "";
    section.imageUrl = "";
    await writeAboutSection(section);
    res.json({ success: true, data: section, message: "Photo removed successfully" });
  } catch (error) {
    console.error("Delete about image error:", error);
    res.status(500).json({ success: false, message: "Failed to remove photo" });
  }
});

router.delete("/admin/about/video", async (_req, res) => {
  try {
    const section = await readAboutSection();
    if (section.playbackUrl) removeTestimonialVideo(section.playbackUrl);
    section.videoUrl = "";
    section.playbackUrl = "";
    await writeAboutSection(section);
    res.json({ success: true, data: section, message: "Video removed successfully" });
  } catch (error) {
    console.error("Delete about video error:", error);
    res.status(500).json({ success: false, message: "Failed to remove video" });
  }
});

router.put("/admin/about", (req, res) => {
  uploadAboutMedia.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ])(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      const intro = String(req.body?.intro || "").trim();
      const imageFile = req.files?.image?.[0] || null;
      const videoFile = req.files?.video?.[0] || null;
      if (!intro) {
        if (imageFile) removeBannerFile(`/uploads/about/${imageFile.filename}`);
        if (videoFile) removeBannerFile(`/uploads/about/${videoFile.filename}`);
        return res.status(400).json({ success: false, message: "Intro text is required" });
      }
      const section = await readAboutSection();
      const media = aboutMedia(section, req.body, { image: imageFile, video: videoFile });
      section.image = media.image && !String(media.image).includes("/about/abhimantrit-banner") ? media.image : "";
      section.videoUrl = media.videoUrl;
      section.playbackUrl = media.playbackUrl;
      section.intro = intro;
      await writeAboutSection(section);
      res.json({ success: true, data: section });
    } catch (error) {
      console.error("Update about section error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to update about section" });
    }
  });
});

const HOME_FAQ_SLUG = "home-faq";

const DEFAULT_HOME_FAQS = [
  {
    question: "How do I know which gemstone is right for me?",
    answer:
      "Choosing a gemstone can be personal. In Vedic astrology, suitability may depend on factors in an individual's birth chart rather than only their zodiac sign. If you are unsure, you can seek personalised guidance before making your choice.",
  },
  {
    question: "Are Abhimantrit gemstones authentic?",
    answer:
      "At Abhimantrit, we bring together natural and authentic gemstones, carefully selected for their quality and traditional significance. Where applicable, certification details are provided to help you understand and choose your gemstone with confidence.",
  },
  {
    question: "What does a gemstone certificate tell me?",
    answer:
      "A gemstone certificate provides important details about the stone and its characteristics, as assessed by a recognised certifying laboratory. The information may vary depending on the gemstone and certification authority. You can review the certificate provided with your gemstone for a clearer understanding of your purchase.",
  },
  {
    question: "Are Abhimantrit Rudraksha original?",
    answer:
      "Yes. Abhimantrit offers original Rudraksha, carefully selected for authenticity and quality. Where applicable, product-specific certification and authenticity details are provided, along with information about the Rudraksha’s Mukhi and traditional associations.",
  },
  {
    question: "What is gemstone energisation?",
    answer:
      "Gemstone energisation is a traditional practice rooted in Vedic traditions. At Abhimantrit, gemstones may be energised through traditional rituals as part of their spiritual preparation. It is a meaningful part of the journey, rather than a guarantee of any specific life outcome.",
  },
  {
    question: "How do I choose the right Rudraksha?",
    answer:
      "Choosing a Rudraksha can depend on its Mukhi, traditional associations, and your personal spiritual or astrological journey. If you’re unsure which Rudraksha may be suitable for you, personalised astrology guidance can help you explore your options with greater clarity.",
  },
  {
    question: "Can I get personalised guidance before buying?",
    answer:
      "Absolutely. If you’re unsure which gemstone or Rudraksha to choose, you can seek personalised guidance from Dr. Priyanka Singh. This can help you understand the different options and make a choice that feels more personal and meaningful.",
  },
];

function normalizeFaqs(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({
      question: String(item?.question || item?.q || "").trim(),
      answer: String(item?.answer || item?.a || "").trim(),
    }))
    .filter((item) => item.question && item.answer);
}

async function readHomeFaqs() {
  const page = await StorePage.findOne({ slug: HOME_FAQ_SLUG }).select("content").lean();
  if (!page?.content) return DEFAULT_HOME_FAQS;
  try {
    const parsed = JSON.parse(page.content);
    if (parsed && parsed.managed === true && Array.isArray(parsed.items)) {
      const faqs = normalizeFaqs(parsed.items);
      if (faqs.length) return faqs;
    }
  } catch (_error) {
    return DEFAULT_HOME_FAQS;
  }
  return DEFAULT_HOME_FAQS;
}

async function writeHomeFaqs(faqs) {
  await StorePage.findOneAndUpdate(
    { slug: HOME_FAQ_SLUG },
    {
      $set: {
        title: "Home FAQs",
        content: JSON.stringify({ managed: true, items: faqs }),
        isActive: true,
      },
      $setOnInsert: { slug: HOME_FAQ_SLUG },
    },
    { upsert: true }
  );
}

const TESTIMONIAL_SLUG = "home-testimonials";

const DEFAULT_TESTIMONIALS = [
  {
    quote:
      "Ordered the wrong bracelet accidentally, the team was nice and supportive and helped replace the order with the new one within 7 days! Such a smooth experience, really happy with my tiger eye bracelet.",
    name: "Maanya",
    imageUrl: "",
  },
];

function readTestimonials() {
  return StorePage.findOne({ slug: TESTIMONIAL_SLUG })
    .select("content")
    .lean()
    .then((page) => {
      if (!page?.content) return DEFAULT_TESTIMONIALS;
      try {
        const saved = JSON.parse(page.content);
        const items = Array.isArray(saved?.items) ? saved.items : [];
        const clean = items
          .map((item) => ({
            quote: String(item?.quote || "").trim(),
            name: String(item?.name || "").trim(),
            imageUrl: String(item?.imageUrl || "").trim(),
            videoUrl: String(item?.videoUrl || "").trim(),
            playbackUrl: String(item?.playbackUrl || "").trim(),
          }))
          .filter((item) => item.quote && item.name);
        return clean.length ? clean : DEFAULT_TESTIMONIALS;
      } catch (_error) {
        return DEFAULT_TESTIMONIALS;
      }
    });
}

async function writeTestimonials(items) {
  await StorePage.findOneAndUpdate(
    { slug: TESTIMONIAL_SLUG },
    {
      $set: {
        title: "Testimonials",
        content: JSON.stringify({ items }),
        isActive: true,
      },
      $setOnInsert: { slug: TESTIMONIAL_SLUG },
    },
    { upsert: true }
  );
}

router.get("/admin/testimonials", async (_req, res) => {
  try {
    res.json({ success: true, data: await readTestimonials() });
  } catch (error) {
    console.error("Load testimonials error:", error);
    res.status(500).json({ success: false, message: "Failed to load testimonials" });
  }
});

function driveFileId(url) {
  const file = String(url).match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (file) return file[1];
  if (!/drive\.google\.com|googleusercontent\.com/.test(url)) return "";
  const id = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return id ? id[1] : "";
}

function downloadToFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("Video download redirected too many times"));
      return;
    }
    const request = https.get(url, (response) => {
      const location = response.headers.location;
      if (response.statusCode >= 300 && response.statusCode < 400 && location) {
        response.resume();
        downloadToFile(location, dest, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error("Could not download that video. Share the Drive file as Anyone with the link."));
        return;
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    });
    request.on("error", reject);
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, { timeout: 180000 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve();
    });
  });
}

function removeTestimonialVideo(fileUrl) {
  if (!fileUrl || !String(fileUrl).startsWith("/uploads/")) return;
  deleteUploadByUrl(fileUrl).catch(() => {});
}

async function prepareTestimonialVideo(videoUrl) {
  const directMp4 = /\.mp4($|\?)/i.test(videoUrl) && !driveFileId(videoUrl);
  if (directMp4) return videoUrl;
  const id = driveFileId(videoUrl) || crypto.randomBytes(6).toString("hex");
  const filename = `${id}.mp4`;
  const dir = path.join(__dirname, "..", "uploads", "testimonials");
  fs.mkdirSync(dir, { recursive: true });
  const source = path.join(dir, `${id}-source`);
  const output = path.join(dir, filename);
  const remote = driveFileId(videoUrl)
    ? `https://drive.usercontent.google.com/download?id=${driveFileId(videoUrl)}&export=download`
    : videoUrl;
  if (!/^https:\/\//i.test(remote)) {
    throw new Error("Paste a public https video link");
  }
  await downloadToFile(remote, source);
  const size = fs.statSync(source).size;
  if (size > 80 * 1024 * 1024) {
    fs.unlink(source, () => {});
    throw new Error("Video is larger than 80 MB");
  }
  await runFfmpeg([
    "-y",
    "-i",
    source,
    "-vf",
    "scale='min(640,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-movflags",
    "+faststart",
    output,
  ]);
  fs.unlink(source, () => {});
  const posterName = filename.replace(/\.mp4$/, ".jpg");
  const posterPath = path.join(dir, posterName);
  await runFfmpeg([
    "-y",
    "-ss",
    "0.2",
    "-i",
    output,
    "-frames:v",
    "1",
    "-update",
    "1",
    "-vf",
    "scale='min(640,iw)':-2",
    "-q:v",
    "5",
    posterPath,
  ]);
  await saveLocalFile(filename, output, "video/mp4");
  await saveLocalFile(posterName, posterPath, "image/jpeg");
  return `/uploads/testimonials/${filename}`;
}

router.put("/admin/testimonials", (req, res) => {
  uploadTestimonialImages.any()(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      const current = await readTestimonials();
      let incoming = [];
      try {
        incoming = JSON.parse(req.body?.items || "[]");
      } catch (_error) {
        incoming = [];
      }
      if (!Array.isArray(incoming) || !incoming.length) {
        return res.status(400).json({ success: false, message: "Add at least one testimonial" });
      }
      const files = Array.isArray(req.files) ? req.files : [];
      const items = [];
      for (let index = 0; index < incoming.length; index += 1) {
        const item = incoming[index];
        const quote = String(item?.quote || "").trim();
        const name = String(item?.name || "").trim();
        if (!quote || !name) continue;
        const file = files.find((entry) => entry.fieldname === `image_${index}`);
        let imageUrl = String(item?.imageUrl || "").trim();
        const videoUrl = String(item?.videoUrl || "").trim();
        if (file) {
          const next = `/uploads/banners/${file.filename}`;
          if (imageUrl && imageUrl !== next) removeBannerFile(imageUrl);
          imageUrl = next;
        }
        const previous = current.find((row) => row.videoUrl === videoUrl && row.playbackUrl);
        let playbackUrl = "";
        if (videoUrl) {
          const reused = previous?.playbackUrl || "";
          const reusedFile = reused.startsWith("/uploads/testimonials/")
            ? path.join(__dirname, "..", reused.replace(/^\/+/, ""))
            : "";
          if (reused && (!reusedFile || fs.existsSync(reusedFile))) {
            playbackUrl = reused;
          } else {
            playbackUrl = await prepareTestimonialVideo(videoUrl);
          }
        }
        items.push({ quote, name, imageUrl, videoUrl, playbackUrl });
      }
      if (!items.length) {
        return res.status(400).json({ success: false, message: "Each testimonial needs a quote and a name" });
      }
      const kept = new Set(items.map((item) => item.imageUrl));
      const keptVideos = new Set(items.map((item) => item.playbackUrl));
      current.forEach((item) => {
        if (item.imageUrl && !kept.has(item.imageUrl)) removeBannerFile(item.imageUrl);
        if (item.playbackUrl && !keptVideos.has(item.playbackUrl)) removeTestimonialVideo(item.playbackUrl);
      });
      await writeTestimonials(items);
      res.json({ success: true, data: items });
    } catch (error) {
      console.error("Update testimonials error:", error);
      res.status(500).json({ success: false, message: "Failed to save testimonials" });
    }
  });
});

router.delete("/admin/testimonials/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const current = await readTestimonials();
    if (isNaN(index) || index < 0 || index >= current.length) {
      return res.status(400).json({ success: false, message: "Invalid testimonial index" });
    }
    const target = current[index];
    if (target?.imageUrl) removeBannerFile(target.imageUrl);
    if (target?.playbackUrl) removeTestimonialVideo(target.playbackUrl);
    const next = current.filter((_, i) => i !== index);
    await writeTestimonials(next);
    res.json({ success: true, data: next, message: "Testimonial removed successfully" });
  } catch (error) {
    console.error("Delete testimonial error:", error);
    res.status(500).json({ success: false, message: "Failed to delete testimonial" });
  }
});

const FEATURED_SLUG = "home-featured-finds";

const DEFAULT_FEATURED = {
  eyebrow: "Featured finds",
  title: "Everyday Vibe, Purposeful Intention",
  videoUrl: "",
  imageUrl: "",
  imageLabel: "Mind Peace",
  points: [
    "Authentically Sourced",
    "Mindful Rituals",
    "Positive Energy",
    "Traditional Craftsmanship",
  ],
  ctaLabel: "Shop now",
  ctaHref: "/product/gm-karungali-mala",
};

function removeFeaturedFile(fileUrl) {
  if (!fileUrl || !String(fileUrl).startsWith("/uploads/")) return;
  deleteUploadByUrl(fileUrl).catch(() => {});
}

async function readFeaturedFinds() {
  const page = await StorePage.findOne({ slug: FEATURED_SLUG }).select("content").lean();
  let saved = {};
  if (page?.content) {
    try {
      saved = JSON.parse(page.content) || {};
    } catch (_error) {
      saved = {};
    }
  }
  const points = Array.isArray(saved.points)
    ? saved.points.map((item) => String(item || "").trim()).filter(Boolean)
    : DEFAULT_FEATURED.points;
  return {
    eyebrow: String(saved.eyebrow || DEFAULT_FEATURED.eyebrow),
    title: String(saved.title || DEFAULT_FEATURED.title),
    videoUrl: String(saved.videoUrl || ""),
    imageUrl: String(saved.imageUrl || ""),
    imageLabel: String(saved.imageLabel || DEFAULT_FEATURED.imageLabel),
    points: points.length ? points : DEFAULT_FEATURED.points,
    ctaLabel: String(saved.ctaLabel || DEFAULT_FEATURED.ctaLabel),
    ctaHref: String(saved.ctaHref || DEFAULT_FEATURED.ctaHref),
  };
}

async function writeFeaturedFinds(section) {
  await StorePage.findOneAndUpdate(
    { slug: FEATURED_SLUG },
    {
      $set: {
        title: "Karungali mala",
        content: JSON.stringify(section),
        isActive: true,
      },
      $setOnInsert: { slug: FEATURED_SLUG },
    },
    { upsert: true }
  );
}

router.get("/admin/featured-finds", async (_req, res) => {
  try {
    res.json({ success: true, data: await readFeaturedFinds() });
  } catch (error) {
    console.error("Load featured finds error:", error);
    res.status(500).json({ success: false, message: "Failed to load Karungali section" });
  }
});

router.put("/admin/featured-finds", (req, res) => {
  uploadFeaturedMedia.fields([
    { name: "video", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ])(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      const current = await readFeaturedFinds();
      const title = String(req.body?.title || "").trim();
      if (!title) {
        return res.status(400).json({ success: false, message: "Heading is required" });
      }
      const points = String(req.body?.points || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
      const video = req.files?.video?.[0];
      const image = req.files?.image?.[0];
      let videoUrl = current.videoUrl;
      let imageUrl = current.imageUrl;
      if (video) {
        const next = `/uploads/featured/${video.filename}`;
        if (videoUrl && videoUrl !== next) removeFeaturedFile(videoUrl);
        videoUrl = next;
      } else if (req.body?.videoUrl !== undefined) {
        const customVideo = String(req.body.videoUrl).trim();
        if (videoUrl && videoUrl !== customVideo && videoUrl.startsWith("/uploads/featured/")) {
          removeFeaturedFile(videoUrl);
        }
        videoUrl = customVideo;
      }
      if (image) {
        const next = `/uploads/featured/${image.filename}`;
        if (imageUrl && imageUrl !== next) removeFeaturedFile(imageUrl);
        imageUrl = next;
      } else if (req.body?.imageUrl !== undefined) {
        const customImage = String(req.body.imageUrl).trim();
        if (imageUrl && imageUrl !== customImage && imageUrl.startsWith("/uploads/featured/")) {
          removeFeaturedFile(imageUrl);
        }
        imageUrl = customImage;
      }
      const section = {
        eyebrow: String(req.body?.eyebrow || DEFAULT_FEATURED.eyebrow).trim(),
        title,
        videoUrl,
        imageUrl,
        imageLabel: String(req.body?.imageLabel || "").trim(),
        points: points.length ? points : DEFAULT_FEATURED.points,
        ctaLabel: String(req.body?.ctaLabel || DEFAULT_FEATURED.ctaLabel).trim(),
        ctaHref: String(req.body?.ctaHref || DEFAULT_FEATURED.ctaHref).trim() || DEFAULT_FEATURED.ctaHref,
      };
      await writeFeaturedFinds(section);
      res.json({ success: true, data: section });
    } catch (error) {
      console.error("Update featured finds error:", error);
      res.status(500).json({ success: false, message: "Failed to update Karungali section" });
    }
  });
});

router.delete("/admin/featured-finds/video", async (_req, res) => {
  try {
    const current = await readFeaturedFinds();
    if (current.videoUrl) removeFeaturedFile(current.videoUrl);
    current.videoUrl = "";
    await writeFeaturedFinds(current);
    res.json({ success: true, data: current, message: "Video removed successfully" });
  } catch (error) {
    console.error("Delete featured video error:", error);
    res.status(500).json({ success: false, message: "Failed to remove video" });
  }
});

router.delete("/admin/featured-finds/image", async (_req, res) => {
  try {
    const current = await readFeaturedFinds();
    if (current.imageUrl) removeFeaturedFile(current.imageUrl);
    current.imageUrl = "";
    await writeFeaturedFinds(current);
    res.json({ success: true, data: current, message: "Photo removed successfully" });
  } catch (error) {
    console.error("Delete featured image error:", error);
    res.status(500).json({ success: false, message: "Failed to remove photo" });
  }
});

/* ------------------------ Screen to Space (Shoppable Reels) ------------------------ */

const SCREEN_TO_SPACE_SLUG = "home-screen-to-space";

const DEFAULT_SCREEN_TO_SPACE = {
  title: "from screen to space, seamlessly",
  subtitle: "",
  isActive: true,
  items: [],
};

async function readScreenToSpace() {
  const page = await StorePage.findOne({ slug: SCREEN_TO_SPACE_SLUG }).select("content").lean();
  if (!page?.content) return { ...DEFAULT_SCREEN_TO_SPACE };
  try {
    const saved = JSON.parse(page.content);
    if (!saved || typeof saved !== "object") return { ...DEFAULT_SCREEN_TO_SPACE };
    const items = Array.isArray(saved.items) ? saved.items : [];
    return {
      title: String(saved.title || DEFAULT_SCREEN_TO_SPACE.title).trim(),
      subtitle: String(saved.subtitle || "").trim(),
      isActive: saved.isActive !== false,
      items: items.map((item, idx) => ({
        id: String(item.id || `reel-${idx + 1}`),
        overlayTag: String(item.overlayTag || "").trim(),
        videoUrl: String(item.videoUrl || "").trim(),
        imageUrl: String(item.imageUrl || "").trim(),
        productTitle: String(item.productTitle || "").trim(),
        productPrice: Number(item.productPrice) || 0,
        productImage: String(item.productImage || "").trim(),
        productSlug: String(item.productSlug || "").trim(),
        buttonText: String(item.buttonText || "SHOP NOW").trim(),
        dotsCount: Number(item.dotsCount) || 4,
        isActive: item.isActive !== false,
      })),
    };
  } catch (_error) {
    return DEFAULT_SCREEN_TO_SPACE;
  }
}

async function writeScreenToSpace(data) {
  await StorePage.findOneAndUpdate(
    { slug: SCREEN_TO_SPACE_SLUG },
    {
      $set: {
        title: "From screen to space, seamlessly",
        content: JSON.stringify(data),
        isActive: true,
      },
      $setOnInsert: { slug: SCREEN_TO_SPACE_SLUG },
    },
    { upsert: true }
  );
}

router.get("/admin/screen-to-space", async (_req, res) => {
  try {
    const data = await readScreenToSpace();
    res.json({ success: true, data });
  } catch (error) {
    console.error("Load screen to space error:", error);
    res.status(500).json({ success: false, message: "Failed to load screen-to-space section" });
  }
});

router.put("/admin/screen-to-space", async (req, res) => {
  try {
    const payload = req.body || {};
    const title = String(payload.title || DEFAULT_SCREEN_TO_SPACE.title).trim();
    const subtitle = String(payload.subtitle || "").trim();
    const isActive = payload.isActive !== false;
    const items = Array.isArray(payload.items) ? payload.items : [];

    const cleanItems = items.map((item, idx) => ({
      id: String(item.id || `reel-${Date.now()}-${idx}`),
      overlayTag: String(item.overlayTag || "").trim(),
      videoUrl: String(item.videoUrl || "").trim(),
      imageUrl: String(item.imageUrl || "").trim(),
      productTitle: String(item.productTitle || "").trim(),
      productPrice: Number(item.productPrice) || 0,
      productImage: String(item.productImage || "").trim(),
      productSlug: String(item.productSlug || "").trim(),
      buttonText: String(item.buttonText || "SHOP NOW").trim(),
      dotsCount: Math.min(Math.max(Number(item.dotsCount) || 4, 1), 8),
      isActive: item.isActive !== false,
    }));

    const nextData = {
      title,
      subtitle,
      isActive,
      items: cleanItems,
    };

    await writeScreenToSpace(nextData);
    res.json({ success: true, data: nextData });
  } catch (error) {
    console.error("Update screen to space error:", error);
    res.status(500).json({ success: false, message: "Failed to update screen-to-space section" });
  }
});

router.post("/admin/screen-to-space/upload", (req, res) => {
  uploadReelsMedia.fields([
    { name: "video", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "productImage", maxCount: 1 },
  ])(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || "Upload failed" });
    }
    try {
      const video = req.files?.video?.[0];
      const image = req.files?.image?.[0];
      const prodImg = req.files?.productImage?.[0];

      res.json({
        success: true,
        data: {
          videoUrl: video ? `/uploads/reels/${video.filename}` : undefined,
          imageUrl: image ? `/uploads/reels/${image.filename}` : undefined,
          productImage: prodImg ? `/uploads/reels/${prodImg.filename}` : undefined,
        },
      });
    } catch (uploadError) {
      console.error("Upload reel error:", uploadError);
      res.status(500).json({ success: false, message: "Upload failed" });
    }
  });
});


router.get("/admin/faqs", async (_req, res) => {
  try {
    const data = await readHomeFaqs();
    res.json({ success: true, data });
  } catch (error) {
    console.error("Load home FAQs error:", error);
    res.status(500).json({ success: false, message: "Failed to load FAQs" });
  }
});

router.put("/admin/faqs", async (req, res) => {
  try {
    const raw = req.body?.faqs;
    if (Array.isArray(raw) && raw.length === 0) {
      await writeHomeFaqs([]);
      return res.json({ success: true, data: [] });
    }
    const faqs = normalizeFaqs(raw);
    await writeHomeFaqs(faqs);
    res.json({ success: true, data: faqs });
  } catch (error) {
    console.error("Update home FAQs error:", error);
    res.status(500).json({ success: false, message: "Failed to update FAQs" });
  }
});

router.delete("/admin/faqs/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const current = await readHomeFaqs();
    if (isNaN(index) || index < 0 || index >= current.length) {
      return res.status(400).json({ success: false, message: "Invalid FAQ index" });
    }
    const next = current.filter((_, i) => i !== index);
    await writeHomeFaqs(next);
    res.json({ success: true, data: next, message: "FAQ removed successfully" });
  } catch (error) {
    console.error("Delete FAQ error:", error);
    res.status(500).json({ success: false, message: "Failed to delete FAQ" });
  }
});

router.delete("/admin/faqs", async (_req, res) => {
  try {
    await writeHomeFaqs([]);
    res.json({ success: true, data: [], message: "All FAQs cleared" });
  } catch (error) {
    console.error("Delete all FAQs error:", error);
    res.status(500).json({ success: false, message: "Failed to clear FAQs" });
  }
});

router.put("/admin/about/features/:id", (req, res) => {
  uploadAboutMedia.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ])(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      const imageFile = req.files?.image?.[0] || null;
      const videoFile = req.files?.video?.[0] || null;
      const base = aboutFeatureById(req.params.id);
      if (!base) {
        if (imageFile) removeBannerFile(`/uploads/about/${imageFile.filename}`);
        if (videoFile) removeBannerFile(`/uploads/about/${videoFile.filename}`);
        return res.status(404).json({ success: false, message: "Point not found" });
      }
      const title = String(req.body?.title || "").trim();
      const description = String(req.body?.description || "").trim();
      if (!title || !description) {
        if (imageFile) removeBannerFile(`/uploads/about/${imageFile.filename}`);
        if (videoFile) removeBannerFile(`/uploads/about/${videoFile.filename}`);
        return res.status(400).json({ success: false, message: "Title and description are required" });
      }
      const section = await readAboutSection();
      const current = section.features.find((item) => item.id === base.id);
      const media = aboutMedia(current, req.body, { image: imageFile, video: videoFile });
      section.features = section.features.map((item) =>
        item.id === base.id
          ? {
              ...item,
              title,
              description,
              image: media.image,
              videoUrl: media.videoUrl,
              playbackUrl: media.playbackUrl,
            }
          : item
      );
      await writeAboutSection(section);
      res.json({ success: true, data: section.features.find((item) => item.id === base.id) });
    } catch (error) {
      console.error("Update about feature error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to update point" });
    }
  });
});

router.delete("/admin/about/features/:id/image", async (req, res) => {
  try {
    const base = aboutFeatureById(req.params.id);
    if (!base) {
      return res.status(404).json({ success: false, message: "Point not found" });
    }
    const section = await readAboutSection();
    const current = section.features.find((item) => item.id === base.id);
    if (current?.image) removeBannerFile(current.image);
    section.features = section.features.map((item) =>
      item.id === base.id
        ? {
            ...item,
            image: "",
            imageUrl: "",
          }
        : item
    );
    await writeAboutSection(section);
    const updated = section.features.find((item) => item.id === base.id);
    res.json({ success: true, data: updated, message: "Photo removed successfully" });
  } catch (error) {
    console.error("Delete feature image error:", error);
    res.status(500).json({ success: false, message: "Failed to remove photo" });
  }
});

router.delete("/admin/about/features/:id/video", async (req, res) => {
  try {
    const base = aboutFeatureById(req.params.id);
    if (!base) {
      return res.status(404).json({ success: false, message: "Point not found" });
    }
    const section = await readAboutSection();
    const current = section.features.find((item) => item.id === base.id);
    if (current?.playbackUrl) removeTestimonialVideo(current.playbackUrl);
    section.features = section.features.map((item) =>
      item.id === base.id
        ? {
            ...item,
            videoUrl: "",
            playbackUrl: "",
          }
        : item
    );
    await writeAboutSection(section);
    const updated = section.features.find((item) => item.id === base.id);
    res.json({ success: true, data: updated, message: "Video removed successfully" });
  } catch (error) {
    console.error("Delete feature video error:", error);
    res.status(500).json({ success: false, message: "Failed to remove video" });
  }
});

router.post("/admin/home-banners", (req, res) => {
  uploadBannerImage.single("image")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      const rawUrl = String(req.body?.imageUrl || "").trim();
      if (!req.file && !rawUrl) {
        return res.status(400).json({ success: false, message: "Banner image file or live URL is required" });
      }
      const payload = readBannerFields(req.body, req.file, HOME_SLIDER_KEY);
      const last = await StoreBanner.findOne({ key: HOME_SLIDER_KEY }).sort({ sortOrder: -1 }).select("sortOrder").lean();
      if (!payload.sortOrder) payload.sortOrder = (last?.sortOrder || 0) + 1;
      const banner = await StoreBanner.create(payload);
      res.status(201).json({ success: true, data: banner });
    } catch (error) {
      console.error("Create home banner error:", error);
      res.status(500).json({ success: false, message: "Failed to create banner" });
    }
  });
});

router.put("/admin/home-banners/:id", (req, res) => {
  uploadBannerImage.single("image")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      const existing = await StoreBanner.findOne({ _id: req.params.id, key: HOME_SLIDER_KEY });
      if (!existing) {
        if (req.file) removeBannerFile(`/uploads/banners/${req.file.filename}`);
        return res.status(404).json({ success: false, message: "Banner not found" });
      }
      const payload = readBannerFields(req.body, req.file, HOME_SLIDER_KEY);
      if (!payload.sortOrder) payload.sortOrder = existing.sortOrder || 0;
      if (req.file && existing.imageUrl && existing.imageUrl !== payload.imageUrl) {
        removeBannerFile(existing.imageUrl);
      }
      Object.assign(existing, payload);
      await existing.save();
      res.json({ success: true, data: existing });
    } catch (error) {
      console.error("Update home banner error:", error);
      res.status(500).json({ success: false, message: "Failed to update banner" });
    }
  });
});

router.delete("/admin/home-banners/:id", async (req, res) => {
  try {
    const banner = await StoreBanner.findOneAndDelete({ _id: req.params.id, key: HOME_SLIDER_KEY });
    if (!banner) return res.status(404).json({ success: false, message: "Banner not found" });
    removeBannerFile(banner.imageUrl);
    res.json({ success: true, message: "Banner deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete banner" });
  }
});

/* ------------------------ Category Banners CRUD ------------------------ */
router.get("/admin/category-banners", async (req, res) => {
  try {
    const filter = { key: CATEGORY_BANNER_KEY };
    if (req.query.category) {
      filter.category = String(req.query.category).trim();
    }
    const data = await StoreBanner.find(filter).sort({ sortOrder: 1, createdAt: 1 });
    res.json({ success: true, data, categories: HERO_CATEGORIES });
  } catch (error) {
    console.error("List category banners error:", error);
    res.status(500).json({ success: false, message: "Failed to load category banners" });
  }
});

router.post("/admin/category-banners", (req, res) => {
  uploadBannerImage.single("image")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      const rawUrl = String(req.body?.imageUrl || "").trim();
      if (!req.file && !rawUrl) {
        return res.status(400).json({ success: false, message: "Banner image file or live URL is required" });
      }
      const category = String(req.body?.category || "").trim();
      if (!category) {
        return res.status(400).json({ success: false, message: "Category is required" });
      }
      const payload = readBannerFields(req.body, req.file, CATEGORY_BANNER_KEY);
      payload.key = CATEGORY_BANNER_KEY;
      payload.category = category;
      if (!payload.ctaHref) payload.ctaHref = `/shop/${category}`;

      const last = await StoreBanner.findOne({ key: CATEGORY_BANNER_KEY, category }).sort({ sortOrder: -1 }).select("sortOrder").lean();
      if (!payload.sortOrder) payload.sortOrder = (last?.sortOrder || 0) + 1;

      const banner = await StoreBanner.create(payload);
      res.status(201).json({ success: true, data: banner });
    } catch (error) {
      console.error("Create category banner error:", error);
      res.status(500).json({ success: false, message: "Failed to create category banner" });
    }
  });
});

router.put("/admin/category-banners/:id", (req, res) => {
  uploadBannerImage.single("image")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      const existing = await StoreBanner.findOne({ _id: req.params.id, key: CATEGORY_BANNER_KEY });
      if (!existing) {
        if (req.file) removeBannerFile(`/uploads/banners/${req.file.filename}`);
        return res.status(404).json({ success: false, message: "Category banner not found" });
      }
      const payload = readBannerFields(req.body, req.file, CATEGORY_BANNER_KEY);
      payload.key = CATEGORY_BANNER_KEY;
      if (!payload.sortOrder) payload.sortOrder = existing.sortOrder || 0;
      if (req.file && existing.imageUrl && existing.imageUrl !== payload.imageUrl) {
        removeBannerFile(existing.imageUrl);
      }
      Object.assign(existing, payload);
      await existing.save();
      res.json({ success: true, data: existing });
    } catch (error) {
      console.error("Update category banner error:", error);
      res.status(500).json({ success: false, message: "Failed to update category banner" });
    }
  });
});

router.delete("/admin/category-banners/:id", async (req, res) => {
  try {
    const banner = await StoreBanner.findOneAndDelete({ _id: req.params.id, key: CATEGORY_BANNER_KEY });
    if (!banner) return res.status(404).json({ success: false, message: "Category banner not found" });
    removeBannerFile(banner.imageUrl);
    res.json({ success: true, message: "Category banner deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete category banner" });
  }
});

router.get("/admin/home-blogs", async (_req, res) => {
  try {
    const posts = await StoreBlogPost.find({ status: "published" })
      .sort({ publishedAt: -1 })
      .limit(6)
      .select("title slug coverImage videoUrl playbackUrl tags publishedAt")
      .lean();
    res.json({ success: true, data: posts });
  } catch (error) {
    console.error("Load home blogs error:", error);
    res.status(500).json({ success: false, message: "Failed to load blog cards" });
  }
});

router.put("/admin/home-blogs", (req, res) => {
  uploadBlogMedia.any()(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "Upload failed" });
    }
    try {
      let incoming = [];
      try {
        incoming = JSON.parse(req.body?.items || "[]");
      } catch (_error) {
        incoming = [];
      }
      if (!Array.isArray(incoming) || !incoming.length) {
        return res.status(400).json({ success: false, message: "No blog cards to update" });
      }
      const files = Array.isArray(req.files) ? req.files : [];
      const saved = [];
      for (let index = 0; index < incoming.length; index += 1) {
        const item = incoming[index];
        const id = String(item?._id || "").trim();
        if (!id) continue;
        const post = await StoreBlogPost.findById(id);
        if (!post) continue;
        const imageFile = files.find((entry) => entry.fieldname === `image_${index}`);
        const videoFile = files.find((entry) => entry.fieldname === `video_${index}`);

        let coverImage = String(post.coverImage || "").trim();
        if (imageFile) {
          const next = `/uploads/blogs/${imageFile.filename}`;
          if (coverImage && coverImage !== next) removeBannerFile(coverImage);
          coverImage = next;
        } else if (/^https?:\/\//i.test(coverImage)) {
          coverImage = "";
        }

        let videoUrl = String(post.videoUrl || "").trim();
        let playbackUrl = String(post.playbackUrl || "").trim();
        if (videoFile) {
          const nextVideo = `/uploads/blogs/${videoFile.filename}`;
          if (playbackUrl && playbackUrl !== nextVideo) removeTestimonialVideo(playbackUrl);
          if (videoUrl && videoUrl !== nextVideo && videoUrl !== playbackUrl) removeBannerFile(videoUrl);
          videoUrl = nextVideo;
          playbackUrl = nextVideo;
        } else if (/^https?:\/\//i.test(videoUrl) || /^https?:\/\//i.test(playbackUrl)) {
          videoUrl = "";
          playbackUrl = "";
        }

        post.coverImage = coverImage;
        post.videoUrl = videoUrl;
        post.playbackUrl = playbackUrl;
        await post.save();
        saved.push({
          _id: post._id,
          title: post.title,
          slug: post.slug,
          coverImage: post.coverImage,
          videoUrl: post.videoUrl,
          playbackUrl: post.playbackUrl,
          tags: post.tags,
          publishedAt: post.publishedAt,
        });
      }
      res.json({ success: true, data: saved });
    } catch (error) {
      console.error("Update home blogs error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to save blog cards" });
    }
  });
});

router.delete("/admin/home-blogs/:id/image", async (req, res) => {
  try {
    const post = await StoreBlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Blog not found" });
    if (post.coverImage) removeBannerFile(post.coverImage);
    post.coverImage = "";
    await post.save();
    res.json({ success: true, data: post, message: "Blog cover image removed" });
  } catch (error) {
    console.error("Delete blog cover image error:", error);
    res.status(500).json({ success: false, message: "Failed to remove blog cover image" });
  }
});

router.delete("/admin/home-blogs/:id/video", async (req, res) => {
  try {
    const post = await StoreBlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Blog not found" });
    if (post.playbackUrl) removeTestimonialVideo(post.playbackUrl);
    post.videoUrl = "";
    post.playbackUrl = "";
    await post.save();
    res.json({ success: true, data: post, message: "Blog video removed" });
  } catch (error) {
    console.error("Delete blog video error:", error);
    res.status(500).json({ success: false, message: "Failed to remove blog video" });
  }
});

router.delete("/admin/home-blogs/:id", async (req, res) => {
  try {
    const post = await StoreBlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Blog not found" });
    if (post.coverImage) removeBannerFile(post.coverImage);
    if (post.playbackUrl) removeTestimonialVideo(post.playbackUrl);
    await StoreBlogPost.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Blog post deleted" });
  } catch (error) {
    console.error("Delete blog post error:", error);
    res.status(500).json({ success: false, message: "Failed to delete blog post" });
  }
});

router.post("/admin/blogs", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ success: false, message: "Title required" });
    const post = await StoreBlogPost.create({
      ...req.body,
      title,
      slug: slugify(req.body?.slug || title),
    });
    res.status(201).json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to create blog" });
  }
});

router.put("/admin/blogs/:id", async (req, res) => {
  try {
    const update = { ...req.body };
    if (update.slug) update.slug = slugify(update.slug);
    const post = await StoreBlogPost.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!post) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update blog" });
  }
});

router.delete("/admin/blogs/:id", async (req, res) => {
  try {
    const post = await StoreBlogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Blog not found" });
    if (post.coverImage) removeBannerFile(post.coverImage);
    if (post.playbackUrl) removeTestimonialVideo(post.playbackUrl);
    await StoreBlogPost.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Blog post deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete blog post" });
  }
});

router.put("/admin/pages/:slug", async (req, res) => {
  try {
    const slug = slugify(req.params.slug);
    const page = await StorePage.findOneAndUpdate(
      { slug },
      {
        $set: {
          title: req.body?.title || slug,
          content: req.body?.content || "",
          seo: req.body?.seo || {},
          isActive: req.body?.isActive !== false,
        },
        $setOnInsert: { slug },
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: page });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to upsert page" });
  }
});

router.post("/admin/cms/seed", async (_req, res) => {
  try {
    const banners = [
      {
        key: "home-hero",
        title: "Authentic Rudraksha & Gemstones",
        subtitle: "Lab-inspired curation for intention-led living",
        imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1600",
        ctaLabel: "Shop Collection",
        ctaHref: "/shop",
        sortOrder: 1,
      },
      {
        key: "home-promo",
        title: "Shop by Intention",
        subtitle: "Wealth · Peace · Protection · Health",
        ctaLabel: "Explore",
        ctaHref: "/intention/Wealth",
        sortOrder: 2,
      },
    ];
    for (const b of banners) {
      await StoreBanner.findOneAndUpdate({ key: b.key, title: b.title }, b, { upsert: true });
    }

    await StoreBlogPost.findOneAndUpdate(
      { slug: "how-to-choose-rudraksha" },
      {
        title: "How to Choose the Right Rudraksha",
        slug: "how-to-choose-rudraksha",
        excerpt: "A simple guide to mukhi, intention and daily wear.",
        content:
          "Start with your intention — peace, protection, wealth or health — then match mukhi guidance and consult an expert when unsure.",
        coverImage: "",
        videoUrl: "",
        playbackUrl: "",
        tags: ["rudraksha", "guide"],
        status: "published",
        publishedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await StorePage.findOneAndUpdate(
      { slug: "shipping-policy" },
      {
        title: "Shipping Policy",
        content: "Orders are typically dispatched within 48 hours across India. COD available on eligible orders.",
        isActive: true,
      },
      { upsert: true }
    );
    await StorePage.findOneAndUpdate(
      { slug: "refund-policy" },
      {
        title: "Refund Policy",
        content: "Reach support within 7 days for eligible returns as per product condition guidelines.",
        isActive: true,
      },
      { upsert: true }
    );
    await StorePage.findOneAndUpdate(
      { slug: "privacy-policy" },
      {
        title: "Privacy Policy",
        content: "We use your contact details only to fulfill orders and support requests.",
        isActive: true,
      },
      { upsert: true }
    );

    await StoreCoupon.findOneAndUpdate(
      { code: "WELCOME10" },
      {
        code: "WELCOME10",
        description: "10% off for new shoppers",
        type: "percent",
        value: 10,
        minOrderAmount: 999,
        maxDiscount: 500,
        isActive: true,
      },
      { upsert: true }
    );
    await StoreCoupon.findOneAndUpdate(
      { code: "FLAT200" },
      {
        code: "FLAT200",
        description: "Flat ₹200 off",
        type: "flat",
        value: 200,
        minOrderAmount: 1499,
        isActive: true,
      },
      { upsert: true }
    );

    res.json({ success: true, message: "CMS + sample coupons seeded" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "CMS seed failed" });
  }
});

module.exports = router;
