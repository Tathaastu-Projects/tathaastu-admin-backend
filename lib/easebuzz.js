const crypto = require("crypto");

function trim(value) {
  return String(value ?? "").trim();
}

function getEasebuzzConfig() {
  const key = trim(process.env.EASEBUZZ_KEY);
  const salt = trim(process.env.EASEBUZZ_SALT);
  const rawEnv = trim(process.env.EASEBUZZ_ENV || "test").toLowerCase();
  const env = rawEnv === "prod" || rawEnv === "production" ? "prod" : "test";
  const iframe = String(process.env.EASEBUZZ_IFRAME || "0") === "1";
  const configured = Boolean(key && salt);

  const initiateBase =
    env === "prod" ? "https://pay.easebuzz.in" : "https://testpay.easebuzz.in";
  const dashboardBase =
    env === "prod"
      ? "https://dashboard.easebuzz.in"
      : "https://testdashboard.easebuzz.in";

  return {
    key,
    salt,
    env,
    iframe,
    configured,
    isDemo: !configured,
    initiateBase,
    dashboardBase,
    gateway: trim(process.env.PAYMENT_GATEWAY || "easebuzz") || "easebuzz",
  };
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return "0.00";
  return n.toFixed(2);
}

function generateEasebuzzHash({
  key,
  salt,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = "",
  udf2 = "",
  udf3 = "",
  udf4 = "",
  udf5 = "",
  udf6 = "",
  udf7 = "",
}) {
  const parts = [
    key,
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
    udf6,
    udf7,
    "",
    "",
    "", // udf8–10 empty
    salt,
  ].map((v) => trim(v));
  return crypto.createHash("sha512").update(parts.join("|")).digest("hex");
}

function verifyEasebuzzReverseHash(params = {}, salt) {
  const p = params || {};
  const hashString = [
    salt,
    p.status,
    p.udf10,
    p.udf9,
    p.udf8,
    p.udf7,
    p.udf6,
    p.udf5,
    p.udf4,
    p.udf3,
    p.udf2,
    p.udf1,
    p.email,
    p.firstname,
    p.productinfo,
    p.amount,
    p.txnid,
    p.key,
  ]
    .map((v) => trim(v))
    .join("|");
  const calculated = crypto.createHash("sha512").update(hashString).digest("hex");
  return calculated.toLowerCase() === trim(p.hash).toLowerCase();
}

function generateRetrieveHash({ key, salt, txnid, amount, email, phone }) {
  const parts = [key, txnid, amount, email, phone, salt].map((v) => trim(v));
  return crypto.createHash("sha512").update(parts.join("|")).digest("hex");
}

function generateRefundHash({ key, salt, merchantRefundId, easebuzzId, refundAmount }) {
  const parts = [key, merchantRefundId, easebuzzId, refundAmount, salt].map((v) => trim(v));
  return crypto.createHash("sha512").update(parts.join("|")).digest("hex");
}

function buildPaymentUrl(accessKey, env = "test") {
  const base = env === "prod" ? "https://pay.easebuzz.in" : "https://testpay.easebuzz.in";
  return `${base}/pay/${trim(accessKey)}`;
}

function buildReturnUrls({ txnid, orderId, orderNumber }) {
  const frontendBase = trim(process.env.FRONTEND_BASE_URL).replace(/\/$/, "");
  const successOverride = trim(process.env.EASEBUZZ_SUCCESS_URL);
  const failureOverride = trim(process.env.EASEBUZZ_FAILURE_URL);

  const qs = new URLSearchParams();
  if (txnid) qs.set("txnid", txnid);
  if (orderId) qs.set("orderId", String(orderId));
  if (orderNumber) qs.set("orderNumber", String(orderNumber));

  const successQs = new URLSearchParams(qs);
  successQs.set("status", "success");
  const failureQs = new URLSearchParams(qs);
  failureQs.set("status", "failure");

  const surl =
    successOverride ||
    (frontendBase ? `${frontendBase}/payment?${successQs.toString()}` : "");
  const furl =
    failureOverride ||
    (frontendBase ? `${frontendBase}/payment?${failureQs.toString()}` : "");

  return { surl, furl, frontendBase };
}

async function initiateEasebuzzPayment(payload = {}) {
  const cfg = getEasebuzzConfig();
  if (!cfg.configured) {
    const err = new Error("Easebuzz not configured — set EASEBUZZ_KEY + EASEBUZZ_SALT");
    err.code = "EASEBUZZ_NOT_CONFIGURED";
    throw err;
  }

  const body = new URLSearchParams();
  const fields = {
    key: cfg.key,
    txnid: trim(payload.txnid),
    amount: trim(payload.amount),
    productinfo: trim(payload.productinfo).slice(0, 45),
    firstname: trim(payload.firstname),
    email: trim(payload.email),
    phone: trim(payload.phone),
    surl: trim(payload.surl),
    furl: trim(payload.furl),
    hash: trim(payload.hash),
    udf1: trim(payload.udf1),
    udf2: trim(payload.udf2),
    udf3: trim(payload.udf3),
    udf4: trim(payload.udf4),
    udf5: trim(payload.udf5),
  };

  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) body.append(k, v);
  });

  const response = await fetch(`${cfg.initiateBase}/payment/initiateLink`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const rawText = await response.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (_e) {
    const err = new Error(`Easebuzz initiate returned non-JSON: ${rawText.slice(0, 200)}`);
    err.code = "EASEBUZZ_INITIATE_ERROR";
    throw err;
  }

  if (!response.ok || Number(data.status) !== 1 || !data.data) {
    const err = new Error(
      data?.error_desc || data?.data || data?.msg || "Easebuzz initiateLink failed"
    );
    err.code = "EASEBUZZ_INITIATE_ERROR";
    err.raw = data;
    throw err;
  }

  const accessKey = String(data.data);
  return {
    accessKey,
    paymentUrl: buildPaymentUrl(accessKey, cfg.env),
    env: cfg.env,
    iframe: cfg.iframe,
    key: cfg.key,
    raw: data,
  };
}

async function retrieveEasebuzzTransaction({ txnid, amount, email, phone }) {
  const cfg = getEasebuzzConfig();
  if (!cfg.configured) {
    const err = new Error("Easebuzz not configured");
    err.code = "EASEBUZZ_NOT_CONFIGURED";
    throw err;
  }

  const hash = generateRetrieveHash({
    key: cfg.key,
    salt: cfg.salt,
    txnid,
    amount,
    email,
    phone,
  });

  const body = new URLSearchParams({
    key: cfg.key,
    txnid: trim(txnid),
    amount: trim(amount),
    email: trim(email),
    phone: trim(phone),
    hash,
  });

  const response = await fetch(`${cfg.dashboardBase}/transaction/v1/retrieve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const data = await response.json().catch(() => ({}));
  return data;
}

async function refundEasebuzzTransaction({
  easebuzzId,
  refundAmount,
  merchantRefundId,
  splitLabels,
}) {
  const cfg = getEasebuzzConfig();
  if (!cfg.configured) {
    const err = new Error("Easebuzz not configured");
    err.code = "EASEBUZZ_NOT_CONFIGURED";
    throw err;
  }

  const refundAmountStr = String(refundAmount);
  const hash = generateRefundHash({
    key: cfg.key,
    salt: cfg.salt,
    merchantRefundId,
    easebuzzId,
    refundAmount: refundAmountStr,
  });

  const payload = {
    key: cfg.key,
    merchant_refund_id: merchantRefundId,
    easebuzz_id: easebuzzId,
    refund_amount: Number(refundAmount),
    hash,
  };
  if (splitLabels && typeof splitLabels === "object") {
    payload.split_labels = splitLabels;
  }

  const response = await fetch(`${cfg.dashboardBase}/transaction/v2/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: cfg.key,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.message || data?.msg || "Easebuzz refund failed");
    err.code = "EASEBUZZ_REFUND_ERROR";
    err.raw = data;
    throw err;
  }
  return data;
}

function makeTxnId(prefix = "TST") {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${stamp}${rand}`.slice(0, 40);
}

module.exports = {
  getEasebuzzConfig,
  formatAmount,
  generateEasebuzzHash,
  verifyEasebuzzReverseHash,
  generateRetrieveHash,
  generateRefundHash,
  buildPaymentUrl,
  buildReturnUrls,
  initiateEasebuzzPayment,
  retrieveEasebuzzTransaction,
  refundEasebuzzTransaction,
  makeTxnId,
};
