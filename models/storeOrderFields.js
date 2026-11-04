/**
 * Soft schema for store_orders (file DB / Mongo-compatible document shape).
 * Not enforced by Mongoose — document contract for checkout + Easebuzz.
 *
 * Unique-ish fields enforced in application code:
 * - easebuzzPaymentId (easepayid) — replay blocked in applyPaidAtomically
 * - orderNumber — generated unique
 *
 * Payment hold TTL: paymentExpiresAt (default 15 minutes from initiate).
 */
module.exports = {
  ORDER_STATUSES: ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"],
  PAYMENT_STATUSES: ["pending", "paid", "failed", "expired", "refunded"],
  PAYMENT_METHODS: ["cod", "online"],
  /** Document fields used by Easebuzz flow */
  EASEBUZZ_FIELDS: [
    "easebuzzTxnId",
    "easebuzzPaymentId", // easepayid
    "easebuzzAccessKey",
    "easebuzzStatus",
    "easebuzzBankRef",
    "paymentRawResponse",
    "paymentExpiresAt",
    "paymentInitiatedAt",
    "paymentSyncedAt",
    "paymentSyncSource",
    "paymentToken", // not stored — issued HMAC to client only
  ],
};
