const StorePayment = require("../models/StorePayment");
const StoreOrder = require("../models/StoreOrder");
const { restoreStock } = require("./storeStock");
const {
  formatAmount,
  getEasebuzzConfig,
  refundTransaction,
  makeTxnId,
} = require("./easebuzz");

function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

async function upsertPaymentLedger(fields = {}) {
  const txnId = String(fields.txnId || "").trim();
  let payment = null;
  if (txnId) {
    payment = await StorePayment.findOne({ txnId });
  }
  if (!payment && fields.orderId) {
    payment = await StorePayment.findOne({
      orderId: String(fields.orderId),
      status: { $in: ["pending", "initiated", "success", "partial_refunded"] },
    });
  }

  const payload = {
    orderId: fields.orderId ? String(fields.orderId) : "",
    orderNumber: fields.orderNumber || "",
    gateway: "easebuzz",
    txnId: txnId || fields.txnId || makeTxnId("ABM"),
    easepayId: fields.easepayId || "",
    amountInr: toAmount(fields.amountInr),
    amountFormatted: fields.amountFormatted || formatAmount(fields.amountInr || 0),
    status: fields.status || "pending",
    isDemo: Boolean(fields.isDemo),
    productInfo: fields.productInfo || "",
    customerName: fields.customerName || "",
    customerEmail: fields.customerEmail || "",
    customerPhone: fields.customerPhone || "",
    udf1: fields.udf1 || "",
    udf2: fields.udf2 || "",
    rawInitiate: fields.rawInitiate || {},
    rawCallback: fields.rawCallback || {},
    refundedAmountInr: toAmount(fields.refundedAmountInr || 0),
    refunds: Array.isArray(fields.refunds) ? fields.refunds : [],
    failureReason: fields.failureReason || "",
  };

  if (payment) {
    Object.assign(payment, {
      ...payload,
      refunds: Array.isArray(payment.refunds) ? payment.refunds : [],
      refundedAmountInr: toAmount(payment.refundedAmountInr || payload.refundedAmountInr),
    });
    if (fields.status) payment.status = fields.status;
    if (fields.easepayId) payment.easepayId = fields.easepayId;
    if (fields.rawInitiate) payment.rawInitiate = fields.rawInitiate;
    if (fields.rawCallback) payment.rawCallback = fields.rawCallback;
    if (fields.failureReason !== undefined) payment.failureReason = fields.failureReason;
    await payment.save();
    return payment;
  }

  return StorePayment.create(payload);
}

async function markLedgerPaid(order, payload = {}) {
  if (!order?._id) return null;
  const txnId = String(payload.txnid || order.easebuzzTxnId || "").trim();
  let payment = txnId ? await StorePayment.findOne({ txnId }) : null;
  if (!payment) {
    payment = await StorePayment.findOne({ orderId: String(order._id) });
  }
  if (!payment) {
    return upsertPaymentLedger({
      orderId: order._id,
      orderNumber: order.orderNumber,
      txnId: txnId || makeTxnId("ABM"),
      easepayId: payload.easepayid || payload.mihpayid || order.easebuzzPaymentId || "",
      amountInr: order.pricing?.total,
      amountFormatted: formatAmount(order.pricing?.total),
      status: "success",
      isDemo: Boolean(payload.isDemo),
      customerName: order.customer?.name,
      customerEmail: order.customer?.email,
      customerPhone: order.customer?.phone,
      rawCallback: payload,
    });
  }
  payment.status = "success";
  payment.easepayId = String(payload.easepayid || payload.mihpayid || payment.easepayId || "");
  payment.rawCallback = payload || payment.rawCallback || {};
  payment.failureReason = "";
  await payment.save();
  return payment;
}

/**
 * Admin refund for a paid store order (Easebuzz Refund API v2).
 */
async function refundStoreOrderPayment({
  orderId,
  orderNumber,
  txnId,
  easepayId,
  paymentId,
  amount,
  merchantRefundId,
  splitLabels,
  cancelOrder = true,
  allowDemo = false,
}) {
  const cfg = getEasebuzzConfig();
  let payment = null;
  let order = null;

  if (paymentId) {
    payment = await StorePayment.findById(paymentId);
  }
  if (!payment && txnId) {
    payment = await StorePayment.findOne({ txnId: String(txnId).trim() });
  }
  if (!payment && easepayId) {
    payment = await StorePayment.findOne({ easepayId: String(easepayId).trim() });
  }
  if (!payment && orderId) {
    payment = await StorePayment.findOne({ orderId: String(orderId) });
  }
  if (!payment && orderNumber) {
    payment = await StorePayment.findOne({
      orderNumber: String(orderNumber).trim().toUpperCase(),
    });
  }

  if (payment?.orderId) {
    order = await StoreOrder.findById(payment.orderId);
  }
  if (!order && orderId) {
    order = await StoreOrder.findById(orderId);
  }
  if (!order && orderNumber) {
    order = await StoreOrder.findOne({
      orderNumber: String(orderNumber).trim().toUpperCase(),
    });
  }
  if (!order && txnId) {
    order = await StoreOrder.findOne({ easebuzzTxnId: String(txnId).trim() });
  }
  if (!order && easepayId) {
    order = await StoreOrder.findOne({ easebuzzPaymentId: String(easepayId).trim() });
  }

  if (!order && !payment) {
    return { ok: false, status: 404, message: "Payment / order not found" };
  }

  if (!payment && order) {
    payment = await upsertPaymentLedger({
      orderId: order._id,
      orderNumber: order.orderNumber,
      txnId: order.easebuzzTxnId || makeTxnId("ABM"),
      easepayId: order.easebuzzPaymentId || "",
      amountInr: order.pricing?.total,
      amountFormatted: formatAmount(order.pricing?.total),
      status: order.paymentStatus === "paid" ? "success" : order.paymentStatus || "pending",
      customerName: order.customer?.name,
      customerEmail: order.customer?.email,
      customerPhone: order.customer?.phone,
    });
  }

  if (!["success", "partial_refunded", "paid"].includes(String(payment.status)) &&
      order?.paymentStatus !== "paid" &&
      order?.paymentStatus !== "partial_refunded") {
    return {
      ok: false,
      status: 400,
      message: `Cannot refund payment in status ${payment.status || order?.paymentStatus}`,
    };
  }

  // Normalize ledger status if order is paid but ledger says pending
  if (order?.paymentStatus === "paid" && payment.status !== "success" && payment.status !== "partial_refunded") {
    payment.status = "success";
  }

  const total = toAmount(payment.amountInr || order?.pricing?.total || 0);
  const already = toAmount(payment.refundedAmountInr);
  const remaining = Math.max(0, toAmount(total - already));
  const refundAmount =
    amount != null && amount !== "" ? toAmount(amount) : remaining;

  if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > remaining + 0.001) {
    return {
      ok: false,
      status: 400,
      message: `Invalid refund amount. Remaining: ${remaining}`,
    };
  }

  const easebuzzId = String(
    payment.easepayId || order?.easebuzzPaymentId || easepayId || "",
  ).trim();
  const refundRef = String(merchantRefundId || "").trim() || makeTxnId("RFD");
  const isDemoPayment =
    Boolean(payment.isDemo) || String(easebuzzId).startsWith("DEMO-") || cfg.isDemo;

  let easebuzzRefund = null;
  if (!isDemoPayment) {
    if (!easebuzzId) {
      return {
        ok: false,
        status: 400,
        message: "Missing easepayid — cannot refund on Easebuzz",
      };
    }
    easebuzzRefund = await refundTransaction({
      easebuzzId,
      refundAmount,
      merchantRefundId: refundRef,
      splitLabels,
    });
    if (!easebuzzRefund.ok) {
      return {
        ok: false,
        status: 502,
        message: easebuzzRefund.error || "Easebuzz refund failed",
        raw: easebuzzRefund.raw || easebuzzRefund,
      };
    }
  } else if (!allowDemo && !cfg.isDemo && !payment.isDemo) {
    return {
      ok: false,
      status: 400,
      message: "Demo refund only allowed for demo payments or when keys are missing",
    };
  }

  const newRefunded = toAmount(already + refundAmount);
  const nextStatus = newRefunded >= total ? "refunded" : "partial_refunded";
  payment.refundedAmountInr = newRefunded;
  payment.status = nextStatus;
  payment.refunds = Array.isArray(payment.refunds) ? payment.refunds : [];
  payment.refunds.push({
    merchantRefundId: refundRef,
    refundId: easebuzzRefund?.refundId || "",
    easebuzzId,
    refundAmount,
    status: nextStatus,
    raw: easebuzzRefund?.raw || { demo: true },
    createdAt: new Date().toISOString(),
  });
  await payment.save();

  if (order) {
    order.refundedAmountInr = newRefunded;
    order.paymentStatus = nextStatus === "refunded" ? "refunded" : "partial_refunded";
    order.easebuzzStatus = nextStatus;

    if (nextStatus === "refunded" && cancelOrder !== false) {
      if (order.stockDecremented && order.status !== "cancelled") {
        for (const item of order.items || []) {
          // eslint-disable-next-line no-await-in-loop
          await restoreStock(item.productId, item.variantId, item.quantity);
        }
        order.stockDecremented = false;
      }
      order.status = "cancelled";
    }
    await order.save();
  }

  return {
    ok: true,
    status: 200,
    message: easebuzzRefund?.data?.message || (isDemoPayment ? "Demo refund recorded" : "Refund recorded"),
    data: {
      paymentId: payment._id,
      orderId: order?._id,
      orderNumber: order?.orderNumber || payment.orderNumber,
      status: payment.status,
      refundedAmountInr: payment.refundedAmountInr,
      remainingInr: Math.max(0, toAmount(total - payment.refundedAmountInr)),
      refund: payment.refunds[payment.refunds.length - 1],
      isDemo: Boolean(isDemoPayment),
      orderStatus: order?.status,
      paymentStatus: order?.paymentStatus,
    },
  };
}

module.exports = {
  upsertPaymentLedger,
  markLedgerPaid,
  refundStoreOrderPayment,
};
