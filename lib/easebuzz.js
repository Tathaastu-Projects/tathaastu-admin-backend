const crypto = require("crypto");

function trimStr(value) {
  return String(value ?? "").trim();
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return "0.00";
  return n.toFixed(2);
}

function getEasebuzzConfig() {
  const key = trimStr(process.env.EASEBUZZ_MERCHANT_KEY || process.env.EASEBUZZ_KEY);
  const salt = trimStr(process.env.EASEBUZZ_SALT);
  const env = trimStr(process.env.EASEBUZZ_ENVIRONMENT || process.env.EASEBUZZ_ENV || "test").toLowerCase();
  const isProd = env === "prod" || env === "production" || env === "live";
  const baseUrl = isProd ? "https://pay.easebuzz.in" : "https://testpay.easebuzz.in";
  const dashboardUrl = isProd ? "https://dashboard.easebuzz.in" : "https://testdashboard.easebuzz.in";

  return {
    key,
    salt,
    env: isProd ? "prod" : "test",
    baseUrl,
    dashboardUrl,
    initiateUrl: `${baseUrl}/payment/initiateLink`,
    retrieveUrl: `${dashboardUrl}/transaction/v1/retrieve`,
    payUrl: (accessKey) => `${baseUrl}/pay/${accessKey}`,
    configured: Boolean(key && salt),
  };
}

/**
 * Request hash:
 * key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
 */
function generateRequestHash({
  key,
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
  salt,
}) {
  const hashString = [
    trimStr(key),
    trimStr(txnid),
    formatAmount(amount),
    trimStr(productinfo),
    trimStr(firstname),
    trimStr(email),
    trimStr(udf1),
    trimStr(udf2),
    trimStr(udf3),
    trimStr(udf4),
    trimStr(udf5),
    "",
    "",
    "",
    "",
    "",
    trimStr(salt),
  ].join("|");

  return crypto.createHash("sha512").update(hashString).digest("hex");
}

/**
 * Transaction status API hash:
 * key|txnid|amount|email|phone|salt
 */
function generateTransactionStatusHash({ key, txnid, amount, email, phone, salt }) {
  const hashString = [
    trimStr(key),
    trimStr(txnid),
    formatAmount(amount),
    trimStr(email),
    trimStr(phone),
    trimStr(salt),
  ].join("|");

  return crypto.createHash("sha512").update(hashString).digest("hex").toLowerCase();
}

/**
 * Response hash (reverse order):
 * salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
 */
function generateResponseHash(payload, salt) {
  const hashString = [
    trimStr(salt),
    trimStr(payload.status),
    "",
    "",
    "",
    "",
    "",
    trimStr(payload.udf5),
    trimStr(payload.udf4),
    trimStr(payload.udf3),
    trimStr(payload.udf2),
    trimStr(payload.udf1),
    trimStr(payload.email),
    trimStr(payload.firstname),
    trimStr(payload.productinfo),
    trimStr(payload.amount),
    trimStr(payload.txnid),
    trimStr(payload.key),
  ].join("|");

  return crypto.createHash("sha512").update(hashString).digest("hex");
}

function verifyResponseHash(payload, salt) {
  const incoming = trimStr(payload.hash).toLowerCase();
  if (!incoming) return false;
  const expected = generateResponseHash(payload, salt).toLowerCase();
  try {
    const a = Buffer.from(incoming, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_err) {
    return false;
  }
}

function isSuccessStatus(status) {
  const s = trimStr(status).toLowerCase();
  return s === "success" || s === "successful" || s === "paid";
}

function isFailureStatus(status) {
  const s = trimStr(status).toLowerCase();
  return [
    "failure",
    "failed",
    "userCancelled",
    "usercancelled",
    "bounced",
    "dropped",
    "timeout",
    "cancelled",
    "canceled",
  ].includes(s);
}

function isPendingStatus(status) {
  const s = trimStr(status).toLowerCase();
  return !s || s === "pending" || s === "initiated" || s === "inprogress" || s === "in_progress";
}

/**
 * Ask Easebuzz for the latest status of a txnid.
 */
async function retrieveTransaction({ txnid, amount, email, phone }) {
  const cfg = getEasebuzzConfig();
  if (!cfg.configured) {
    return { ok: false, error: "Easebuzz keys missing" };
  }

  const payload = {
    key: cfg.key,
    txnid: trimStr(txnid),
    amount: formatAmount(amount),
    email: trimStr(email).toLowerCase(),
    phone: trimStr(phone).replace(/\D/g, "").slice(-10),
  };

  if (!payload.txnid || !payload.email || payload.phone.length !== 10) {
    return { ok: false, error: "txnid, email and 10-digit phone required for status check" };
  }

  payload.hash = generateTransactionStatusHash({ ...payload, salt: cfg.salt });

  const form = new URLSearchParams();
  Object.entries(payload).forEach(([k, v]) => form.set(k, v));

  try {
    const { postFormUrlEncoded } = require("./easebuzzHttp");
    const response = await postFormUrlEncoded(cfg.retrieveUrl, form.toString(), {
      timeoutMs: 20000,
      isolated: false,
    });
    if (!response.ok) {
      return { ok: false, error: response.error || "Easebuzz retrieve failed", raw: response };
    }
    const raw = response.data || {};
    const data = raw?.data && typeof raw.data === "object" ? raw.data : raw;
    const txnStatus = trimStr(data?.status || raw?.txn_status || raw?.msg);

    return {
      ok: true,
      httpStatus: response.httpStatus,
      apiStatus: Number(raw?.status),
      txnStatus,
      data,
      raw,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Easebuzz status API request failed",
      httpStatus: 0,
      apiStatus: NaN,
      txnStatus: "",
      data: null,
      raw: null,
    };
  }
}

module.exports = {
  formatAmount,
  getEasebuzzConfig,
  generateRequestHash,
  generateTransactionStatusHash,
  generateResponseHash,
  verifyResponseHash,
  isSuccessStatus,
  isFailureStatus,
  isPendingStatus,
  retrieveTransaction,
};
