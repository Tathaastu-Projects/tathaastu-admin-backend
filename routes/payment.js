const express = require("express");
const { Types } = require("../lib/fileDb");
const StoreOrder = require("../models/StoreOrder");
const StorePayment = require("../models/StorePayment");
const {
  getEasebuzzConfig,
  formatAmount,
  generateEasebuzzHash,
  verifyEasebuzzReverseHash,
  initiateEasebuzzPayment,
  retrieveEasebuzzTransaction,
  refundEasebuzzTransaction,
  buildReturnUrls,
  makeTxnId,
} = require("../lib/easebuzz");
const { restoreStock } = require("../lib/storeStock");

const router = express.Router();

function asCallbackParams(req) {
  return { ...(req.query || {}), ...(req.body || {}) };
}

function publicOrder(order) {
  if (!order) return null;
  return {
    id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    pricing: order.pricing,
    customer: order.customer,
    items: order.items,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

async function markOrderPaid(order, { txnId, easepayId }) {
  order.paymentMethod = "online";
  order.paymentStatus = "paid";
  if (order.status === "placed") order.status = "confirmed";
  order.easebuzzTxnId = txnId || order.easebuzzTxnId || "";
  order.easepayId = easepayId || order.easepayId || "";
  // clear razorpay leftovers if any
  order.razorpayOrderId = order.razorpayOrderId || "";
  order.razorpayPaymentId = order.razorpayPaymentId || "";
  await order.save();
  return order;
}

async function markOrderFailed(order, reason = "") {
  order.paymentMethod = "online";
  order.paymentStatus = "failed";
  if (reason) order.adminNote = String(reason).slice(0, 500);
  await order.save();
  return order;
}

/**
 * GET /api/payment/config
 */
router.get("/config", (_req, res) => {
  const cfg = getEasebuzzConfig();
  res.json({
    success: true,
    data: {
      gateway: "easebuzz",
      isConfigured: cfg.configured,
      isDemo: cfg.isDemo,
      environment: cfg.env,
      iframe: cfg.iframe,
      currency: "INR",
      supportedModes: ["UPI", "CREDIT_CARD", "DEBIT_CARD", "NET_BANKING", "WALLET"],
    },
  });
});

/**
 * POST /api/payment/easebuzz/initiate
 * Body: { orderId } OR { orderNumber }
 * Optional overrides: customerName, customerPhone, customerEmail
 */
async function initiateEasebuzz(req, res) {
  try {
    const body = req.body || {};
    const orderId = body.orderId || body.storeOrderId || body.bookingId;
    const orderNumber = body.orderNumber ? String(body.orderNumber).trim().toUpperCase() : "";

    let order = null;
    if (orderId && Types.ObjectId.isValid(orderId)) {
      order = await StoreOrder.findById(orderId);
    }
    if (!order && orderNumber) {
      order = await StoreOrder.findOne({ orderNumber });
    }
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.paymentStatus === "paid") {
      return res.status(409).json({
        success: false,
        message: "Order already paid",
        data: { orderId: order._id, orderNumber: order.orderNumber },
      });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({ success: false, message: "Order is cancelled" });
    }

    const amountNum = Number(order.pricing?.total);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, message: "Invalid order amount" });
    }

    const firstname =
      String(body.customerName || order.customer?.name || "").trim() || "Customer";
    const phone =
      String(body.customerPhone || order.customer?.phone || "").trim() || "";
    const email =
      String(body.customerEmail || order.customer?.email || "").trim().toLowerCase() ||
      `${String(phone || "guest").replace(/\D/g, "").slice(-10) || "guest"}@tathaastu.local`;

    if (!phone) {
      return res.status(400).json({ success: false, message: "Customer phone is required" });
    }

    const amount = formatAmount(amountNum);
    const productinfo = String(
      body.productinfo || `Order ${order.orderNumber}` || "Tathaastu Store Order"
    )
      .trim()
      .slice(0, 45);

    const txnid = makeTxnId("TST");
    const udf1 = String(order.orderNumber || "").slice(0, 255);
    const udf2 = String(order.items?.length || 0);
    const udf3 = String(order.paymentMethod || "online");
    const udf4 = phone;
    const udf5 = String(order._id);

    const { surl, furl } = buildReturnUrls({
      txnid,
      orderId: order._id,
      orderNumber: order.orderNumber,
    });

    if (!surl || !furl) {
      return res.status(500).json({
        success: false,
        message: "FRONTEND_BASE_URL (or EASEBUZZ_SUCCESS_URL / EASEBUZZ_FAILURE_URL) must be set",
      });
    }

    const cfg = getEasebuzzConfig();

    const payment = await StorePayment.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      gateway: "easebuzz",
      txnId: txnid,
      easepayId: "",
      amountInr: amountNum,
      amountFormatted: amount,
      status: "pending",
      isDemo: cfg.isDemo,
      productInfo: productinfo,
      customerName: firstname,
      customerEmail: email,
      customerPhone: phone,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
      surl,
      furl,
      rawInitiate: {},
      rawCallback: {},
      refundedAmountInr: 0,
      refunds: [],
    });

    order.paymentMethod = "online";
    order.paymentStatus = "pending";
    order.easebuzzTxnId = txnid;
    await order.save();

    if (cfg.isDemo) {
      return res.json({
        success: true,
        data: {
          gateway: "easebuzz",
          isDemo: true,
          orderId: order._id,
          orderNumber: order.orderNumber,
          paymentId: payment._id,
          txnid,
          amount,
          message: "Easebuzz not configured — set EASEBUZZ_KEY + EASEBUZZ_SALT",
          surl,
          furl,
          demoConfirmPath: `/api/payment/easebuzz/confirm-demo`,
        },
      });
    }

    const hash = generateEasebuzzHash({
      key: cfg.key,
      salt: cfg.salt,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
    });

    const initiated = await initiateEasebuzzPayment({
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl,
      furl,
      hash,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
    });

    payment.rawInitiate = {
      accessKey: initiated.accessKey,
      paymentUrl: initiated.paymentUrl,
      env: initiated.env,
      iframe: initiated.iframe,
    };
    await payment.save();

    return res.json({
      success: true,
      data: {
        gateway: "easebuzz",
        isDemo: false,
        orderId: order._id,
        orderNumber: order.orderNumber,
        paymentId: payment._id,
        txnid,
        amount,
        accessKey: initiated.accessKey,
        paymentUrl: initiated.paymentUrl,
        actionUrl: initiated.paymentUrl,
        env: initiated.env,
        iframe: initiated.iframe,
        key: initiated.key,
        surl,
        furl,
      },
    });
  } catch (error) {
    console.error("Easebuzz initiate error:", error);
    const status = error.code === "EASEBUZZ_NOT_CONFIGURED" ? 503 : 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Failed to initiate Easebuzz payment",
      code: error.code || "EASEBUZZ_INITIATE_ERROR",
    });
  }
}

/**
 * Shared verify / webhook handler
 */
async function verifyEasebuzz(req, res) {
  try {
    const params = asCallbackParams(req);
    const cfg = getEasebuzzConfig();

    const txnid = String(params.txnid || params.txnId || "").trim();
    const statusRaw = String(params.status || "").trim().toLowerCase();
    const amount = String(params.amount || "").trim();
    const email = String(params.email || "").trim();
    const phone = String(params.phone || params.udf4 || "").trim();
    const easepayid = String(params.easepayid || params.easepayId || "").trim();
    const orderIdFromUdf = String(params.udf5 || params.orderId || params.bookingId || "").trim();

    let payment =
      (txnid && (await StorePayment.findOne({ txnId: txnid }))) ||
      null;

    let order = null;
    if (payment?.orderId) {
      order = await StoreOrder.findById(payment.orderId);
    }
    if (!order && orderIdFromUdf && Types.ObjectId.isValid(orderIdFromUdf)) {
      order = await StoreOrder.findById(orderIdFromUdf);
    }
    if (!order && params.orderNumber) {
      order = await StoreOrder.findOne({
        orderNumber: String(params.orderNumber).trim().toUpperCase(),
      });
    }

    // Idempotent success
    if (payment?.status === "success" || order?.paymentStatus === "paid") {
      if (payment && payment.status !== "success") {
        payment.status = "success";
        payment.easepayId = payment.easepayId || easepayid;
        await payment.save();
      }
      if (order && order.paymentStatus !== "paid") {
        await markOrderPaid(order, { txnId: txnid || payment?.txnId, easepayId: easepayid });
      }
      return res.json({
        success: true,
        verified: true,
        status: "success",
        txnid: txnid || payment?.txnId,
        amount: amount || payment?.amountFormatted,
        easepayid: easepayid || payment?.easepayId,
        isDemo: Boolean(payment?.isDemo),
        orderId: order?._id || payment?.orderId,
        orderNumber: order?.orderNumber || payment?.orderNumber,
        order: publicOrder(order),
        message: "Payment already verified.",
      });
    }

    let verifiedOk = false;
    let failureReason = "";

    if (cfg.isDemo) {
      // Demo: accept explicit success status only
      verifiedOk = statusRaw === "success";
      if (!verifiedOk) failureReason = "Demo verify requires status=success";
    } else if (params.hash) {
      verifiedOk = verifyEasebuzzReverseHash(
        {
          ...params,
          key: params.key || cfg.key,
        },
        cfg.salt
      );
      if (!verifiedOk) failureReason = "Invalid reverse hash";
      else if (statusRaw !== "success") {
        verifiedOk = false;
        failureReason = `Payment status: ${statusRaw || "unknown"}`;
      }
    } else if (txnid && amount && email && phone) {
      const retrieved = await retrieveEasebuzzTransaction({
        txnid,
        amount,
        email,
        phone,
      });
      const msgStatus = String(
        retrieved?.msg?.status || retrieved?.status || retrieved?.data?.status || ""
      ).toLowerCase();
      verifiedOk = msgStatus === "success";
      if (!verifiedOk) {
        failureReason = `Retrieve status: ${msgStatus || "unknown"}`;
      }
    } else {
      return res.status(400).json({
        success: false,
        verified: false,
        message: "Missing hash or txn details for verification",
      });
    }

    if (!payment && order) {
      payment = await StorePayment.create({
        orderId: order._id,
        orderNumber: order.orderNumber,
        gateway: "easebuzz",
        txnId: txnid || makeTxnId("TST"),
        amountInr: Number(order.pricing?.total) || Number(amount) || 0,
        amountFormatted: amount || formatAmount(order.pricing?.total),
        status: "pending",
        isDemo: cfg.isDemo,
        customerName: order.customer?.name || "",
        customerEmail: email || order.customer?.email || "",
        customerPhone: phone || order.customer?.phone || "",
        udf5: String(order._id),
        rawCallback: params,
        refundedAmountInr: 0,
        refunds: [],
      });
    }

    if (payment) {
      payment.rawCallback = params;
      payment.easepayId = easepayid || payment.easepayId || "";
    }

    if (!verifiedOk) {
      if (payment) {
        payment.status = "failed";
        payment.failureReason = failureReason;
        await payment.save();
      }
      if (order) {
        await markOrderFailed(order, failureReason);
      }
      return res.status(400).json({
        success: false,
        verified: false,
        status: statusRaw || "failed",
        txnid,
        amount,
        message: failureReason || "Payment verification failed",
        orderId: order?._id,
        orderNumber: order?.orderNumber,
        order: publicOrder(order),
      });
    }

    if (payment) {
      payment.status = "success";
      payment.easepayId = easepayid || payment.easepayId || "";
      payment.failureReason = "";
      await payment.save();
    }

    if (order) {
      await markOrderPaid(order, {
        txnId: txnid || payment?.txnId,
        easepayId: easepayid || payment?.easepayId,
      });
    }

    return res.json({
      success: true,
      verified: true,
      status: "success",
      txnid: txnid || payment?.txnId,
      amount: amount || payment?.amountFormatted,
      easepayid: easepayid || payment?.easepayId,
      isDemo: Boolean(payment?.isDemo || cfg.isDemo),
      orderId: order?._id || payment?.orderId,
      orderNumber: order?.orderNumber || payment?.orderNumber,
      order: publicOrder(order),
      message: "Easebuzz payment successfully verified.",
    });
  } catch (error) {
    console.error("Easebuzz verify error:", error);
    return res.status(500).json({
      success: false,
      verified: false,
      message: error.message || "Payment verification failed",
    });
  }
}

/**
 * Demo confirm — only when keys missing / payment flagged demo
 * POST /api/payment/easebuzz/confirm-demo  { orderId | orderNumber | txnid }
 */
async function confirmDemoPayment(req, res) {
  try {
    const cfg = getEasebuzzConfig();
    const body = req.body || {};
    const txnid = String(body.txnid || body.txnId || "").trim();
    const orderId = body.orderId || body.storeOrderId;
    const orderNumber = body.orderNumber
      ? String(body.orderNumber).trim().toUpperCase()
      : "";

    let payment = txnid ? await StorePayment.findOne({ txnId: txnid }) : null;
    let order = null;

    if (payment?.orderId) order = await StoreOrder.findById(payment.orderId);
    if (!order && orderId && Types.ObjectId.isValid(orderId)) {
      order = await StoreOrder.findById(orderId);
    }
    if (!order && orderNumber) {
      order = await StoreOrder.findOne({ orderNumber });
    }
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (!payment && order?._id) {
      payment = await StorePayment.findOne({ orderId: order._id });
    }

    // Live keys configured: only allow confirm-demo for payments that were
    // originally created in demo mode. Never invent a demo payment here.
    if (!cfg.isDemo && payment?.isDemo !== true) {
      return res.status(403).json({
        success: false,
        message: "Demo confirm is disabled when Easebuzz live keys are configured",
      });
    }

    if (order.paymentStatus === "paid") {
      return res.json({
        success: true,
        verified: true,
        isDemo: true,
        message: "Order already paid",
        order: publicOrder(order),
      });
    }

    if (!payment) {
      payment = await StorePayment.create({
        orderId: order._id,
        orderNumber: order.orderNumber,
        gateway: "easebuzz",
        txnId: txnid || makeTxnId("DEMO"),
        amountInr: Number(order.pricing?.total) || 0,
        amountFormatted: formatAmount(order.pricing?.total),
        status: "success",
        isDemo: true,
        easepayId: `DEMO-${Date.now()}`,
        customerName: order.customer?.name || "",
        customerEmail: order.customer?.email || "",
        customerPhone: order.customer?.phone || "",
        udf5: String(order._id),
        rawCallback: { status: "success", demo: true },
        refundedAmountInr: 0,
        refunds: [],
      });
    } else {
      payment.status = "success";
      payment.isDemo = true;
      payment.easepayId = payment.easepayId || `DEMO-${Date.now()}`;
      payment.rawCallback = { status: "success", demo: true };
      await payment.save();
    }

    await markOrderPaid(order, {
      txnId: payment.txnId,
      easepayId: payment.easepayId,
    });

    return res.json({
      success: true,
      verified: true,
      status: "success",
      isDemo: true,
      txnid: payment.txnId,
      easepayid: payment.easepayId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      order: publicOrder(order),
      message: "Demo payment confirmed",
    });
  } catch (error) {
    console.error("Demo confirm error:", error);
    return res.status(500).json({ success: false, message: "Demo confirm failed" });
  }
}

/**
 * Admin refund
 * POST /api/payment/easebuzz/refund
 */
async function refundEasebuzz(req, res) {
  try {
    const body = req.body || {};
    let payment = null;

    if (body.paymentId && Types.ObjectId.isValid(body.paymentId)) {
      payment = await StorePayment.findById(body.paymentId);
    }
    if (!payment && body.txnId) {
      payment = await StorePayment.findOne({ txnId: String(body.txnId).trim() });
    }
    if (!payment && body.easepayId) {
      payment = await StorePayment.findOne({ easepayId: String(body.easepayId).trim() });
    }
    if (!payment && body.orderId && Types.ObjectId.isValid(body.orderId)) {
      payment = await StorePayment.findOne({ orderId: body.orderId, status: { $in: ["success", "partial_refunded"] } });
    }
    if (!payment && body.bookingId && Types.ObjectId.isValid(body.bookingId)) {
      payment = await StorePayment.findOne({ orderId: body.bookingId });
    }
    if (!payment && body.orderNumber) {
      payment = await StorePayment.findOne({
        orderNumber: String(body.orderNumber).trim().toUpperCase(),
      });
    }

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    if (!["success", "partial_refunded"].includes(payment.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot refund payment in status ${payment.status}`,
      });
    }

    const already = Number(payment.refundedAmountInr) || 0;
    const total = Number(payment.amountInr) || 0;
    const remaining = Math.max(0, total - already);
    const refundAmount =
      body.amount != null && body.amount !== ""
        ? Number(body.amount)
        : remaining;

    if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > remaining + 0.001) {
      return res.status(400).json({
        success: false,
        message: `Invalid refund amount. Remaining: ${remaining}`,
      });
    }

    const merchantRefundId =
      String(body.merchantRefundId || "").trim() || makeTxnId("RFD");
    const cfg = getEasebuzzConfig();

    let easebuzzRefund = null;
    if (!cfg.isDemo && payment.easepayId && !String(payment.easepayId).startsWith("DEMO-")) {
      easebuzzRefund = await refundEasebuzzTransaction({
        easebuzzId: payment.easepayId,
        refundAmount,
        merchantRefundId,
        splitLabels: body.splitLabels,
      });
    }

    const newRefunded = Math.round((already + refundAmount) * 100) / 100;
    payment.refundedAmountInr = newRefunded;
    payment.status = newRefunded >= total ? "refunded" : "partial_refunded";
    payment.refunds = Array.isArray(payment.refunds) ? payment.refunds : [];
    payment.refunds.push({
      merchantRefundId,
      refundId: easebuzzRefund?.refund_id || easebuzzRefund?.data?.refund_id || "",
      easebuzzId: payment.easepayId,
      refundAmount,
      status: payment.status,
      raw: easebuzzRefund || { demo: true },
      createdAt: new Date().toISOString(),
    });
    await payment.save();

    const cancelOrder = body.cancelOrder !== false && body.cancelBooking !== false;
    if (payment.status === "refunded" && cancelOrder) {
      const order = await StoreOrder.findById(payment.orderId);
      if (order && order.status !== "cancelled") {
        if (order.stockDecremented) {
          for (const item of order.items || []) {
            // eslint-disable-next-line no-await-in-loop
            await restoreStock(item.productId, item.variantId, item.quantity);
          }
          order.stockDecremented = false;
        }
        order.status = "cancelled";
        order.paymentStatus = "refunded";
        await order.save();
      }
    } else if (payment.status === "partial_refunded" || payment.status === "refunded") {
      const order = await StoreOrder.findById(payment.orderId);
      if (order) {
        order.paymentStatus = payment.status === "refunded" ? "refunded" : "paid";
        await order.save();
      }
    }

    return res.json({
      success: true,
      message: easebuzzRefund?.message || "Refund recorded",
      data: {
        paymentId: payment._id,
        status: payment.status,
        refundedAmountInr: payment.refundedAmountInr,
        remainingInr: Math.max(0, total - payment.refundedAmountInr),
        refund: payment.refunds[payment.refunds.length - 1],
        isDemo: Boolean(payment.isDemo || cfg.isDemo || !easebuzzRefund),
      },
    });
  } catch (error) {
    console.error("Easebuzz refund error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Refund failed",
      code: error.code,
    });
  }
}

router.post("/easebuzz/initiate", initiateEasebuzz);
router.post("/initiate", initiateEasebuzz);
router.post("/easebuzz/verify", verifyEasebuzz);
router.post("/verify", verifyEasebuzz);
router.post("/easebuzz/webhook", verifyEasebuzz);
router.post("/easebuzz/confirm-demo", confirmDemoPayment);
router.post("/easebuzz/refund", refundEasebuzz);
router.post("/refund", refundEasebuzz);

module.exports = router;
