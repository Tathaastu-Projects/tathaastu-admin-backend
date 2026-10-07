const StoreCoupon = require("../models/StoreCoupon");

function computeCouponDiscount(coupon, subtotal) {
  let discount = 0;
  if (coupon.type === "percent") {
    discount = (subtotal * Number(coupon.value || 0)) / 100;
    if (coupon.maxDiscount != null) discount = Math.min(discount, Number(coupon.maxDiscount));
  } else {
    discount = Number(coupon.value || 0);
  }
  discount = Math.max(0, Math.min(discount, subtotal));
  return Math.round(discount);
}

async function findValidCoupon(code, subtotal = 0) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return { error: "Coupon code required" };
  const coupon = await StoreCoupon.findOne({ code: normalized, isActive: true });
  if (!coupon) return { error: "Invalid coupon code" };
  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) return { error: "Coupon not started yet" };
  if (coupon.endsAt && now > coupon.endsAt) return { error: "Coupon expired" };
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { error: "Coupon usage limit reached" };
  }
  if (subtotal < Number(coupon.minOrderAmount || 0)) {
    return { error: `Minimum order ₹${coupon.minOrderAmount} required` };
  }
  return { coupon };
}

module.exports = { computeCouponDiscount, findValidCoupon };
