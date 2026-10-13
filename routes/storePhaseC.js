const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const StoreCustomer = require("../models/StoreCustomer");
const StoreReview = require("../models/StoreReview");
const StoreCoupon = require("../models/StoreCoupon");
const StoreWishlist = require("../models/StoreWishlist");
const StoreOrder = require("../models/StoreOrder");
const Product = require("../models/Product");
const { StoreBanner, StoreBlogPost, StorePage } = require("../models/StoreCms");
const { findValidCoupon, computeCouponDiscount } = require("../lib/storeCoupons");
const { signCustomerToken, optionalStoreAuth, requireStoreAuth } = require("../middleware/storeAuth");
const { restoreStock } = require("../lib/storeStock");

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
    { $match: { productId: new mongoose.Types.ObjectId(productId), status: "approved" } },
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
    const customer = await StoreCustomer.create({ name, email, phone, passwordHash });
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
    const customer = await StoreCustomer.findOne({ email, isActive: true });
    if (!customer || !(await customer.comparePassword(password))) {
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
    if (!mongoose.Types.ObjectId.isValid(productId)) {
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

    if (storeOrderId && mongoose.Types.ObjectId.isValid(storeOrderId)) {
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

    if (storeOrderId && mongoose.Types.ObjectId.isValid(storeOrderId)) {
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
  try {
    const Product = require("../models/Product");
    const {
      INTENTIONS,
      ZODIAC_SIGNS,
      CATEGORIES,
      queryCatalog,
    } = require("../lib/storeCatalog");

    const [banners, posts, faqsPage, categoryCounts] = await Promise.all([
      StoreBanner.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }),
      StoreBlogPost.find({ status: "published" }).sort({ publishedAt: -1 }).limit(6),
      StorePage.findOne({ slug: "home-faq", isActive: true }),
      Product.aggregate([
        { $match: { status: "listed" } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = Object.fromEntries(categoryCounts.map((c) => [c._id, c.count]));

    // One representative image per category for Explore Categories cards
    const categoryCards = [];
    for (const cat of CATEGORIES) {
      // eslint-disable-next-line no-await-in-loop
      const sample = await Product.findOne({ status: "listed", category: cat })
        .select("images title")
        .lean();
      categoryCards.push({
        id: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        href: `/shop/${cat}`,
        productCount: countMap[cat] || 0,
        image:
          sample?.images?.find((i) => i.isPrimary)?.url ||
          sample?.images?.[0]?.url ||
          "",
      });
    }

    let faqs = [];
    if (faqsPage?.content) {
      try {
        const parsed = JSON.parse(faqsPage.content);
        if (Array.isArray(parsed)) faqs = parsed;
      } catch (_e) {
        faqs = [{ question: "FAQ", answer: String(faqsPage.content) }];
      }
    }

    const intentionMeta = {
      Peace: { color: "#7BA3A8", icon: "peace" },
      Wealth: { color: "#C6A15B", icon: "wealth" },
      Health: { color: "#6B9B7A", icon: "health" },
      Protection: { color: "#8B5E5E", icon: "protection" },
      Relationship: { color: "#C97B84", icon: "love" },
      Success: { color: "#4F6F8F", icon: "success" },
      Spirituality: { color: "#6E5A8A", icon: "spirit" },
    };

    const [featured, bestsellers, newArrivals] = await Promise.all([
      queryCatalog({ featured: "true", limit: 16, sort: "featured" }),
      queryCatalog({ bestSeller: "true", limit: 16, sort: "best_selling" }),
      queryCatalog({ isNewArrival: "true", limit: 16, sort: "newest" }),
    ]);

    const listedTotal = await Product.countDocuments({ status: "listed" });

    res.json({
      success: true,
      data: {
        brand: {
          name: "Tathaastu",
          tagline: "Authentic Rudraksha & Gemstones",
        },
        banners,
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
        categories: categoryCards,
        zodiacSigns: ZODIAC_SIGNS.map((sign) => ({
          id: sign,
          label: sign,
          href: `/shop?zodiac=${encodeURIComponent(sign)}`,
        })),
        carousels: {
          featured: featured.items,
          bestsellers: bestsellers.items,
          newArrivals: newArrivals.items,
        },
        latestBlogs: posts,
        faqs,
        faqPage: faqsPage,
        consultCta: {
          title: "Not sure what to buy? Talk to our experts",
          subtitle: "Get a free recommendation aligned to your intention.",
          ctaLabel: "Consult Now",
          ctaHref: "/contact",
        },
        stats: {
          listedProducts: listedTotal,
          categoryCounts: countMap,
        },
      },
    });
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
        coverImage: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=1200",
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
