const crypto = require("crypto");

function paymentSecret() {
  return (
    process.env.PAYMENT_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    process.env.EASEBUZZ_SALT ||
    process.env.ADMIN_JWT_SECRET ||
    "tathaastu-payment-secret"
  );
}

function normalizePhone(phone) {
  return String(phone || "")
    .replace(/\D/g, "")
    .slice(-10);
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch (_err) {
    return false;
  }
}

/**
 * Short-lived HMAC token proving the caller created / owns this order.
 * Format: expUnix.hexSignature
 */
function createOrderPaymentToken(orderId, phone, ttlSeconds = 2 * 60 * 60) {
  const exp = Math.floor(Date.now() / 1000) + Math.max(300, Number(ttlSeconds) || 7200);
  const phoneNorm = normalizePhone(phone);
  const data = `${String(orderId)}|${phoneNorm}|${exp}`;
  const sig = crypto.createHmac("sha256", paymentSecret()).update(data).digest("hex");
  return `${exp}.${sig}`;
}

function verifyOrderPaymentToken(token, orderId, phone) {
  const raw = String(token || "").trim();
  const parts = raw.split(".");
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  const sig = String(parts[1] || "");
  if (!Number.isFinite(exp) || !sig || Math.floor(Date.now() / 1000) > exp) return false;
  const phoneNorm = normalizePhone(phone);
  const data = `${String(orderId)}|${phoneNorm}|${exp}`;
  const expected = crypto.createHmac("sha256", paymentSecret()).update(data).digest("hex");
  return timingSafeEqualString(sig.toLowerCase(), expected.toLowerCase());
}

function phonesMatch(a, b) {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return left.length === 10 && right.length === 10 && timingSafeEqualString(left, right);
}

/** Simple in-memory IP rate limit (per process). */
const buckets = new Map();

function rateLimitPayment(req, res, options = {}) {
  const windowMs = Number(options.windowMs) || 60 * 1000;
  const max = Number(options.max) || 20;
  const ip = String(
    req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || "unknown",
  )
    .split(",")[0]
    .trim();
  const key = `${options.key || "pay"}:${ip}`;
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > max) {
    if (!options.silent && res && !res.headersSent) {
      res.status(429).json({
        success: false,
        message: "Too many payment requests. Please wait a moment and try again.",
      });
    }
    return false;
  }
  return true;
}

/** Periodically prune old buckets */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets.entries()) {
    if (now - entry.start > 10 * 60 * 1000) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

module.exports = {
  normalizePhone,
  timingSafeEqualString,
  createOrderPaymentToken,
  verifyOrderPaymentToken,
  phonesMatch,
  rateLimitPayment,
};
