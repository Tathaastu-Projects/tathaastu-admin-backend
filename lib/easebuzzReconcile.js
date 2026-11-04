const StoreOrder = require("../models/StoreOrder");
const {
  retrieveTransaction,
  isSuccessStatus,
  isFailureStatus,
  getEasebuzzConfig,
} = require("./easebuzz");
const {
  PAYMENT_HOLD_MS,
  applyPaidAtomically,
  applyFailedOrExpiredAtomically,
} = require("./easebuzzPayments");

/** @deprecated kept for older call sites — prefer applyPaidAtomically */
async function markOrderPaidFromEasebuzz(order, payload = {}) {
  const result = await applyPaidAtomically(order, payload, payload._syncSource || "legacy");
  return result.order || order;
}

/** @deprecated kept for older call sites — prefer applyFailedOrExpiredAtomically */
async function markOrderFailedFromEasebuzz(order, payload = {}) {
  const asExpired = String(payload.status || "").includes("expired");
  const result = await applyFailedOrExpiredAtomically(
    order,
    payload,
    payload._syncSource || "legacy",
    asExpired,
  );
  return result.order || order;
}

function orderAgeMs(order) {
  const t = new Date(order.paymentInitiatedAt || order.updatedAt || order.createdAt || 0).getTime();
  return Number.isFinite(t) ? Date.now() - t : 0;
}

function isPastPaymentExpiry(order) {
  if (order.paymentExpiresAt) {
    const exp = new Date(order.paymentExpiresAt).getTime();
    if (Number.isFinite(exp)) return Date.now() >= exp;
  }
  return orderAgeMs(order) >= PAYMENT_HOLD_MS;
}

/**
 * Sync one store order with Easebuzz transaction status API (S2S authority).
 */
async function syncStoreOrderPayment(orderOrId, options = {}) {
  const { expireAfterMs = PAYMENT_HOLD_MS } = options;
  const cfg = getEasebuzzConfig();

  let order = orderOrId;
  if (!order || typeof order.save !== "function") {
    order = await StoreOrder.findById(orderOrId);
  }
  if (!order) {
    return { ok: false, action: "missing", message: "Order not found" };
  }

  if (order.paymentMethod !== "online") {
    return { ok: true, action: "skipped", message: "Not an online order", order };
  }

  if (order.paymentStatus === "paid") {
    return { ok: true, action: "already_paid", message: "Already paid", order };
  }

  if (!cfg.configured) {
    return { ok: false, action: "config_error", message: "Easebuzz keys missing", order };
  }

  if (!order.easebuzzTxnId) {
    if (isPastPaymentExpiry(order) || orderAgeMs(order) >= expireAfterMs) {
      const result = await applyFailedOrExpiredAtomically(
        order,
        { status: "expired_no_txn", _syncSource: "reconcile" },
        "reconcile",
        true,
      );
      return { ok: true, action: "expired", message: result.message, order: result.order };
    }
    return { ok: true, action: "waiting", message: "Payment not initiated yet", order };
  }

  const result = await retrieveTransaction({
    txnid: order.easebuzzTxnId,
    amount: order.pricing?.total,
    email: order.customer?.email,
    phone: order.customer?.phone,
  });

  const payload = {
    ...(result.data || {}),
    txnid: result.data?.txnid || order.easebuzzTxnId,
    status: result.txnStatus || result.data?.status,
    amount: result.data?.amount || order.pricing?.total,
    easepayid: result.data?.easepayid || result.data?.mihpayid,
  };

  if (isSuccessStatus(payload.status)) {
    const paid = await applyPaidAtomically(order, payload, "status_api");
    return {
      ok: paid.ok || paid.action === "already_paid",
      action: paid.action === "already_paid" ? "already_paid" : "paid",
      message: paid.message || "Payment confirmed via Easebuzz status API",
      order: paid.order || order,
      easebuzz: result.raw,
    };
  }

  if (isFailureStatus(payload.status)) {
    const failed = await applyFailedOrExpiredAtomically(order, payload, "status_api", false);
    return {
      ok: true,
      action: "failed",
      message: failed.message,
      order: failed.order || order,
      easebuzz: result.raw,
    };
  }

  // Never expire on network/API transport errors — leave pending for next tick.
  if (result.error || result.httpStatus === 0) {
    return {
      ok: false,
      action: "api_error",
      message: result.error || "Easebuzz status API unreachable — left pending",
      order,
      easebuzz: result.raw,
    };
  }

  const notFound =
    Number(result.apiStatus) === 0 ||
    /not\s*found|invalid|no transaction/i.test(String(result.raw?.data || result.raw?.msg || ""));

  if ((isPastPaymentExpiry(order) || orderAgeMs(order) >= expireAfterMs) && (notFound || !isSuccessStatus(payload.status))) {
    const expired = await applyFailedOrExpiredAtomically(
      order,
      { ...payload, status: notFound ? "expired_not_found" : "expired_unpaid" },
      "reconcile_expire",
      true,
    );
    return {
      ok: true,
      action: "expired",
      message: expired.message,
      order: expired.order || order,
      easebuzz: result.raw,
    };
  }

  await StoreOrder.findOneAndUpdate(
    { _id: String(order._id) },
    {
      $set: {
        easebuzzStatus: payload.status || order.easebuzzStatus || "pending",
        paymentSyncedAt: new Date().toISOString(),
        paymentSyncSource: "status_api",
        paymentRawResponse: result.raw || order.paymentRawResponse || null,
      },
    },
  );

  const refreshed = await StoreOrder.findById(order._id);
  return {
    ok: true,
    action: "pending",
    message: `Still pending at Easebuzz (${payload.status || "unknown"})`,
    order: refreshed || order,
    easebuzz: result.raw,
  };
}

/**
 * Batch reconcile pending / expired-hold online orders (internal scheduler).
 */
async function reconcilePendingEasebuzzOrders(options = {}) {
  const {
    minAgeMs = 60 * 1000,
    expireAfterMs = PAYMENT_HOLD_MS,
    limit = 40,
  } = options;

  const orders = await StoreOrder.find({
    paymentMethod: "online",
    paymentStatus: { $in: ["pending"] },
  })
    .sort({ createdAt: 1 })
    .limit(200);

  const list = Array.isArray(orders) ? orders : [];
  const eligible = list
    .filter((o) => orderAgeMs(o) >= minAgeMs || isPastPaymentExpiry(o))
    .slice(0, limit);

  const summary = {
    checked: 0,
    paid: 0,
    failed: 0,
    expired: 0,
    pending: 0,
    skipped: 0,
    errors: 0,
    results: [],
  };

  for (const order of eligible) {
    summary.checked += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await syncStoreOrderPayment(order, { expireAfterMs });
      summary.results.push({
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        action: result.action,
        message: result.message,
      });
      if (result.action === "paid" || result.action === "already_paid") summary.paid += 1;
      else if (result.action === "failed") summary.failed += 1;
      else if (result.action === "expired") summary.expired += 1;
      else if (result.action === "pending" || result.action === "waiting") summary.pending += 1;
      else summary.skipped += 1;
    } catch (err) {
      summary.errors += 1;
      summary.results.push({
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        action: "error",
        message: err.message || "sync failed",
      });
      console.error("Easebuzz reconcile error:", order.orderNumber, err);
    }
  }

  return summary;
}

/**
 * Internal background worker (not a public HTTP dependency).
 * Uses setInterval — equivalent to node-cron every N minutes.
 */
function startEasebuzzReconcileScheduler() {
  const enabled = String(process.env.EASEBUZZ_RECONCILE_ENABLED || "true").toLowerCase() !== "false";
  if (!enabled) {
    console.log("⏸️  Easebuzz reconcile scheduler disabled");
    return null;
  }

  const intervalMs = Math.max(
    60_000,
    Number(process.env.EASEBUZZ_RECONCILE_INTERVAL_MS || 5 * 60 * 1000) || 5 * 60 * 1000,
  );

  console.log(
    `🔁 Easebuzz payment reconcile every ${Math.round(intervalMs / 1000)}s (hold ${Math.round(PAYMENT_HOLD_MS / 60000)}m)`,
  );

  const tick = async () => {
    try {
      const summary = await reconcilePendingEasebuzzOrders();
      if (summary.checked > 0) {
        console.log(
          `[easebuzz-reconcile] checked=${summary.checked} paid=${summary.paid} failed=${summary.failed} expired=${summary.expired} pending=${summary.pending} errors=${summary.errors}`,
        );
      }
    } catch (err) {
      console.error("[easebuzz-reconcile] tick failed:", err.message || err);
    }
  };

  const bootTimer = setTimeout(tick, 90_000);
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  if (typeof bootTimer.unref === "function") bootTimer.unref();
  return timer;
}

module.exports = {
  markOrderPaidFromEasebuzz,
  markOrderFailedFromEasebuzz,
  syncStoreOrderPayment,
  reconcilePendingEasebuzzOrders,
  startEasebuzzReconcileScheduler,
  isPastPaymentExpiry,
};
