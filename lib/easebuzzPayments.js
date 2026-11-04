/**
 * Enterprise Easebuzz payment state transitions (atomic where file-DB allows).
 * Authority to mark PAID: S2S webhook + Transaction retrieve API (reconcile).
 * Browser surl/furl must not be the sole authority.
 */
const StoreOrder = require("../models/StoreOrder");
const { restoreStock } = require("./storeStock");
const {
  verifyResponseHash,
  isSuccessStatus,
  isFailureStatus,
  formatAmount,
  getEasebuzzConfig,
  retrieveTransaction,
} = require("./easebuzz");
const { timingSafeEqualString } = require("./paymentSecurity");

const PAYMENT_HOLD_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.EASEBUZZ_PAYMENT_HOLD_MS || 15 * 60 * 1000) || 15 * 60 * 1000,
);

function paymentExpiresAtFromNow(ms = PAYMENT_HOLD_MS) {
  return new Date(Date.now() + ms).toISOString();
}

function sanitizePaymentPayload(payload = {}) {
  const copy = { ...(payload || {}) };
  // Never persist hash/salt-like fields longer than needed in logs; keep callback body for audit.
  return copy;
}

function amountsMatch(paidAmount, orderAmount) {
  const a = Number(paidAmount);
  const b = Number(orderAmount);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 0.05;
}

async function findEasepayConflict(easepayid, orderId) {
  const id = String(easepayid || "").trim();
  if (!id) return null;
  const existing = await StoreOrder.findOne({ easebuzzPaymentId: id });
  if (!existing) return null;
  if (String(existing._id) === String(orderId)) return null;
  return existing;
}

/**
 * Atomic-ish paid transition: only from unpaid online states.
 * Also enforces unique easepayid (replay protection).
 */
async function applyPaidAtomically(orderOrId, payload = {}, source = "webhook") {
  const orderId = orderOrId?._id || orderOrId;
  const easepayid = String(payload.easepayid || payload.mihpayid || "").trim();
  const conflict = await findEasepayConflict(easepayid, orderId);
  if (conflict) {
    return {
      ok: false,
      action: "replay_blocked",
      message: `easepayid already used on order ${conflict.orderNumber}`,
      order: null,
    };
  }

  const current = await StoreOrder.findById(orderId);
  if (!current) {
    return { ok: false, action: "missing", message: "Order not found", order: null };
  }
  if (current.paymentStatus === "paid") {
    return { ok: true, action: "already_paid", message: "Already paid", order: current };
  }
  if (current.paymentMethod !== "online") {
    return { ok: false, action: "invalid", message: "Not an online order", order: current };
  }

  if (payload.amount != null && !amountsMatch(payload.amount, current.pricing?.total)) {
    return {
      ok: false,
      action: "amount_mismatch",
      message: "Payment amount mismatch",
      order: current,
    };
  }

  if (
    current.easebuzzTxnId &&
    payload.txnid &&
    !timingSafeEqualString(String(current.easebuzzTxnId), String(payload.txnid))
  ) {
    return { ok: false, action: "txn_mismatch", message: "Transaction id mismatch", order: current };
  }

  const wasCancelledWithoutStock =
    current.status === "cancelled" && current.stockDecremented === false;

  const nextStatus = wasCancelledWithoutStock
    ? current.status
    : current.status === "placed" || current.status === "cancelled"
      ? "confirmed"
      : current.status;

  const updated = await StoreOrder.findOneAndUpdate(
    {
      _id: String(current._id),
      paymentMethod: "online",
      paymentStatus: { $in: ["pending", "failed", "expired"] },
    },
    {
      $set: {
        paymentStatus: "paid",
        status: nextStatus,
        easebuzzTxnId: String(payload.txnid || current.easebuzzTxnId || ""),
        easebuzzPaymentId: easepayid || current.easebuzzPaymentId || "",
        easebuzzStatus: String(payload.status || "success"),
        easebuzzBankRef: String(
          payload.bank_ref_num || payload.bank_ref_no || current.easebuzzBankRef || "",
        ),
        paymentRawResponse: sanitizePaymentPayload(payload),
        paymentSyncedAt: new Date().toISOString(),
        paymentSyncSource: source,
        needsManualReview: wasCancelledWithoutStock ? true : current.needsManualReview || false,
        adminNote: wasCancelledWithoutStock
          ? [
              String(current.adminNote || "").trim(),
              "Easebuzz paid after cancel/stock restore — manual review required before shipping.",
            ]
              .filter(Boolean)
              .join("\n")
          : current.adminNote || "",
      },
    },
    { new: true },
  );

  if (!updated) {
    const latest = await StoreOrder.findById(orderId);
    if (latest?.paymentStatus === "paid") {
      return { ok: true, action: "already_paid", message: "Already paid", order: latest };
    }
    return { ok: false, action: "race", message: "Could not claim unpaid order", order: latest };
  }

  return { ok: true, action: "paid", message: "Payment confirmed", order: updated };
}

async function applyFailedOrExpiredAtomically(orderOrId, payload = {}, source = "webhook", asExpired = false) {
  const orderId = orderOrId?._id || orderOrId;
  const current = await StoreOrder.findById(orderId);
  if (!current) {
    return { ok: false, action: "missing", message: "Order not found", order: null };
  }
  if (current.paymentStatus === "paid") {
    return { ok: true, action: "already_paid", message: "Already paid — ignore failure", order: current };
  }

  const paymentStatus = asExpired ? "expired" : "failed";
  let stockDecremented = current.stockDecremented;
  let status = current.status;

  if (stockDecremented && status !== "cancelled") {
    for (const item of current.items || []) {
      // eslint-disable-next-line no-await-in-loop
      await restoreStock(item.productId, item.variantId, item.quantity);
    }
    stockDecremented = false;
    status = "cancelled";
  }

  const updated = await StoreOrder.findOneAndUpdate(
    {
      _id: String(current._id),
      paymentMethod: "online",
      paymentStatus: { $in: ["pending", "failed"] },
    },
    {
      $set: {
        paymentStatus,
        status,
        stockDecremented,
        easebuzzTxnId: String(payload.txnid || current.easebuzzTxnId || ""),
        easebuzzPaymentId: String(
          payload.easepayid || payload.mihpayid || current.easebuzzPaymentId || "",
        ),
        easebuzzStatus: String(payload.status || paymentStatus),
        paymentRawResponse: sanitizePaymentPayload(payload),
        paymentSyncedAt: new Date().toISOString(),
        paymentSyncSource: source,
      },
    },
    { new: true },
  );

  return {
    ok: true,
    action: asExpired ? "expired" : "failed",
    message: asExpired ? "Order expired — stock restored" : "Payment failed",
    order: updated || (await StoreOrder.findById(orderId)),
  };
}

function validateEasebuzzSignedPayload(payload) {
  const cfg = getEasebuzzConfig();
  if (!cfg.configured) {
    return { ok: false, message: "Easebuzz not configured" };
  }
  if (!verifyResponseHash(payload, cfg.salt)) {
    return { ok: false, message: "Invalid payment signature" };
  }
  if (payload.key && !timingSafeEqualString(String(payload.key).trim(), cfg.key)) {
    return { ok: false, message: "Invalid merchant key" };
  }
  return { ok: true, cfg };
}

async function findOrderFromPayload(payload) {
  const storeOrderId = String(payload.udf1 || "").trim();
  let order = null;
  if (storeOrderId) {
    order = await StoreOrder.findById(storeOrderId);
  }
  if (!order && payload.txnid) {
    order = await StoreOrder.findOne({ easebuzzTxnId: String(payload.txnid) });
  }
  return order;
}

/**
 * Authoritative S2S webhook processing.
 */
async function processEasebuzzWebhook(payload) {
  const signed = validateEasebuzzSignedPayload(payload);
  if (!signed.ok) return { httpStatus: 400, ...signed, action: "rejected" };

  const order = await findOrderFromPayload(payload);
  if (!order) {
    return { ok: false, httpStatus: 404, action: "missing", message: "Order not found" };
  }

  if (isSuccessStatus(payload.status)) {
    const result = await applyPaidAtomically(order, payload, "webhook");
    return { httpStatus: result.ok || result.action === "already_paid" ? 200 : 409, ...result };
  }

  if (isFailureStatus(payload.status)) {
    const result = await applyFailedOrExpiredAtomically(order, payload, "webhook", false);
    return { httpStatus: 200, ...result };
  }

  // pending / unknown — store raw, leave unpaid
  await StoreOrder.findOneAndUpdate(
    { _id: String(order._id) },
    {
      $set: {
        easebuzzStatus: String(payload.status || order.easebuzzStatus || "pending"),
        paymentRawResponse: sanitizePaymentPayload(payload),
        paymentSyncedAt: new Date().toISOString(),
        paymentSyncSource: "webhook_pending",
      },
    },
  );
  return { ok: true, httpStatus: 200, action: "pending", message: "Pending status recorded", order };
}

/**
 * Browser return: never trust alone — refresh via Easebuzz Transaction API then redirect.
 */
async function processEasebuzzBrowserReturn(payload) {
  const signed = validateEasebuzzSignedPayload(payload);
  // Soft-fail signature on browser return: still try retrieve by txnid if order found
  const order = await findOrderFromPayload(payload);
  if (!order) {
    return {
      ok: false,
      action: "missing",
      redirectPath: `/order/failed?reason=${encodeURIComponent("Order not found for this payment")}`,
    };
  }

  if (signed.ok && isSuccessStatus(payload.status)) {
    // Hash-valid redirect is a strong hint, but still confirm via retrieve when possible.
    const retrieved = await retrieveTransaction({
      txnid: order.easebuzzTxnId || payload.txnid,
      amount: order.pricing?.total,
      email: order.customer?.email,
      phone: order.customer?.phone,
    });
    if (retrieved.ok && isSuccessStatus(retrieved.txnStatus || retrieved.data?.status)) {
      await applyPaidAtomically(
        order,
        {
          ...(retrieved.data || {}),
          txnid: retrieved.data?.txnid || payload.txnid,
          amount: retrieved.data?.amount || payload.amount,
          status: retrieved.txnStatus || retrieved.data?.status || payload.status,
          easepayid: retrieved.data?.easepayid || payload.easepayid,
        },
        "browser_return_retrieve",
      );
    } else if (signed.ok) {
      // Retrieve unavailable — accept signed redirect as secondary authority with amount checks
      await applyPaidAtomically(order, payload, "browser_return_signed");
    }
  } else {
    // Always try retrieve for ambiguous returns
    const retrieved = await retrieveTransaction({
      txnid: order.easebuzzTxnId || payload.txnid,
      amount: order.pricing?.total,
      email: order.customer?.email,
      phone: order.customer?.phone,
    });
    if (retrieved.ok && isSuccessStatus(retrieved.txnStatus || retrieved.data?.status)) {
      await applyPaidAtomically(
        order,
        {
          ...(retrieved.data || {}),
          txnid: retrieved.data?.txnid || payload.txnid,
          amount: formatAmount(retrieved.data?.amount || order.pricing?.total),
          status: retrieved.txnStatus || retrieved.data?.status,
        },
        "browser_return_retrieve",
      );
    } else if (signed.ok && isFailureStatus(payload.status)) {
      await applyFailedOrExpiredAtomically(order, payload, "browser_return", false);
    }
  }

  const latest = await StoreOrder.findById(order._id);
  if (latest?.paymentStatus === "paid") {
    return {
      ok: true,
      action: "paid",
      redirectPath: `/order/success?orderNumber=${encodeURIComponent(latest.orderNumber || "")}`,
      order: latest,
    };
  }

  const reason = String(
    payload.error || payload.error_Message || payload.status || latest?.easebuzzStatus || "Payment pending or failed",
  );
  return {
    ok: false,
    action: latest?.paymentStatus || "pending",
    redirectPath: `/order/failed?orderNumber=${encodeURIComponent(latest?.orderNumber || "")}&reason=${encodeURIComponent(reason)}`,
    order: latest,
  };
}

module.exports = {
  PAYMENT_HOLD_MS,
  paymentExpiresAtFromNow,
  amountsMatch,
  applyPaidAtomically,
  applyFailedOrExpiredAtomically,
  processEasebuzzWebhook,
  processEasebuzzBrowserReturn,
  validateEasebuzzSignedPayload,
  findOrderFromPayload,
};
