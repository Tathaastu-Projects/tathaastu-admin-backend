/**
 * Shared payment status payload for store FE polling / sync screens.
 */
const { PAYMENT_HOLD_MS } = require("./easebuzzPayments");

function orderAgeMs(order) {
  const t = new Date(order?.paymentInitiatedAt || order?.updatedAt || order?.createdAt || 0).getTime();
  return Number.isFinite(t) ? Date.now() - t : 0;
}

function isPastPaymentExpiry(order) {
  if (order?.paymentExpiresAt) {
    const exp = new Date(order.paymentExpiresAt).getTime();
    if (Number.isFinite(exp)) return Date.now() >= exp;
  }
  return orderAgeMs(order) >= PAYMENT_HOLD_MS;
}

function buildPaymentUiState(order) {
  if (!order) {
    return {
      uiState: "missing",
      canRetryPayment: false,
      canCancelUnpaid: false,
      shouldPoll: false,
      nextPollAfterMs: 0,
      userMessage: "Order not found",
    };
  }

  const paymentStatus = String(order.paymentStatus || "");
  const status = String(order.status || "");
  const method = String(order.paymentMethod || "");
  const expiresAt = order.paymentExpiresAt ? new Date(order.paymentExpiresAt).getTime() : null;
  const msToExpiry =
    expiresAt && Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : null;

  if (method === "cod") {
    return {
      uiState: "cod_placed",
      canRetryPayment: false,
      canCancelUnpaid: false,
      shouldPoll: false,
      nextPollAfterMs: 0,
      userMessage: "Cash on Delivery order placed. Pay when you receive the shipment.",
    };
  }

  if (paymentStatus === "paid") {
    return {
      uiState: "paid",
      canRetryPayment: false,
      canCancelUnpaid: false,
      shouldPoll: false,
      nextPollAfterMs: 0,
      userMessage: "Payment successful. Your order is confirmed.",
    };
  }

  if (paymentStatus === "refunded") {
    return {
      uiState: "refunded",
      canRetryPayment: false,
      canCancelUnpaid: false,
      shouldPoll: false,
      nextPollAfterMs: 0,
      userMessage: "Payment was refunded.",
    };
  }

  if (paymentStatus === "partial_refunded") {
    return {
      uiState: "partial_refunded",
      canRetryPayment: false,
      canCancelUnpaid: false,
      shouldPoll: false,
      nextPollAfterMs: 0,
      userMessage: "A partial refund was issued for this order.",
    };
  }

  if (paymentStatus === "failed" || paymentStatus === "expired" || status === "cancelled") {
    return {
      uiState: paymentStatus === "expired" ? "expired" : "failed",
      canRetryPayment: true,
      canCancelUnpaid: false,
      shouldPoll: false,
      nextPollAfterMs: 0,
      userMessage:
        paymentStatus === "expired"
          ? "Payment window expired. You can try paying again or choose COD."
          : "Payment failed or was cancelled. You can retry or choose COD.",
    };
  }

  return {
    uiState: "processing",
    canRetryPayment: false,
    canCancelUnpaid: true,
    shouldPoll: true,
    nextPollAfterMs: 4000,
    paymentExpiresAt: order.paymentExpiresAt || null,
    msToExpiry,
    pastHold: isPastPaymentExpiry(order),
    holdMs: PAYMENT_HOLD_MS,
    userMessage:
      "Payment is processing. Do not pay again. We’re confirming with the bank. This can take a minute after timeout or network issues.",
  };
}

function publicPaymentStatus(order, extra = {}) {
  const ui = buildPaymentUiState(order);
  return {
    storeOrderId: order?._id ? String(order._id) : null,
    orderNumber: order?.orderNumber || null,
    paymentMethod: order?.paymentMethod || null,
    paymentStatus: order?.paymentStatus || null,
    status: order?.status || null,
    pricing: order?.pricing || null,
    easebuzzTxnId: order?.easebuzzTxnId || null,
    easebuzzPaymentId: order?.easebuzzPaymentId || null,
    easebuzzStatus: order?.easebuzzStatus || null,
    paymentExpiresAt: order?.paymentExpiresAt || null,
    needsManualReview: Boolean(order?.needsManualReview),
    ...ui,
    ...extra,
  };
}

module.exports = {
  buildPaymentUiState,
  publicPaymentStatus,
  isPastPaymentExpiry,
};
