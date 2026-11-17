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
  const configured = Boolean(key && salt);
  const iframe = String(process.env.EASEBUZZ_IFRAME || "0") === "1";

  return {
    key,
    salt,
    env: isProd ? "prod" : "test",
    iframe,
    baseUrl,
    dashboardUrl,
    initiateUrl: `${baseUrl}/payment/initiateLink`,
    retrieveUrl: `${dashboardUrl}/transaction/v1/retrieve`,
    refundUrl: `${dashboardUrl}/transaction/v2/refund`,
    payUrl: (accessKey) => `${baseUrl}/pay/${accessKey}`,
    configured,
    isDemo: !configured,
    gateway: trimStr(process.env.PAYMENT_GATEWAY || "easebuzz") || "easebuzz",
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

/**
 * Refund API v2 hash:
 * key|merchant_refund_id|easebuzz_id|refund_amount|salt
 * @see https://docs.easebuzz.in/docs/payment-gateway/c2ac48618b3bd-refund-api-v2
 */
function generateRefundHash({ key, salt, merchantRefundId, easebuzzId, refundAmount }) {
  const hashString = [
    trimStr(key),
    trimStr(merchantRefundId),
    trimStr(easebuzzId),
    trimStr(refundAmount),
    trimStr(salt),
  ].join("|");
  return crypto.createHash("sha512").update(hashString).digest("hex");
}

function makeTxnId(prefix = "ABM") {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}${stamp}${rand}`.slice(0, 40);
}

/**
 * Call Easebuzz Refund API v2 (JSON + Authorization: merchant key).
 */
async function refundTransaction({
  easebuzzId,
  refundAmount,
  merchantRefundId,
  splitLabels,
}) {
  const cfg = getEasebuzzConfig();
  if (!cfg.configured) {
    return { ok: false, error: "Easebuzz keys missing", code: "EASEBUZZ_NOT_CONFIGURED" };
  }

  const easebuzz_id = trimStr(easebuzzId);
  const merchant_refund_id = trimStr(merchantRefundId) || makeTxnId("RFD");
  const refund_amount_num = Number(refundAmount);
  if (!easebuzz_id) {
    return { ok: false, error: "easebuzz_id (easepayid) is required for refund" };
  }
  if (!Number.isFinite(refund_amount_num) || refund_amount_num <= 0) {
    return { ok: false, error: "Valid refund_amount required" };
  }

  const refund_amount = formatAmount(refund_amount_num);
  const hash = generateRefundHash({
    key: cfg.key,
    salt: cfg.salt,
    merchantRefundId: merchant_refund_id,
    easebuzzId: easebuzz_id,
    refundAmount: refund_amount,
  });

  const payload = {
    key: cfg.key,
    merchant_refund_id,
    easebuzz_id,
    refund_amount: Number(refund_amount),
    hash,
  };
  if (splitLabels && typeof splitLabels === "object") {
    payload.split_labels = splitLabels;
  }

  try {
    const https = require("https");
    const http = require("http");
    const { URL } = require("url");
    const parsed = new URL(cfg.refundUrl);
    const body = JSON.stringify(payload);
    const lib = parsed.protocol === "https:" ? https : http;

    const response = await new Promise((resolve) => {
      const req = lib.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: `${parsed.pathname}${parsed.search || ""}`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: cfg.key,
            "Content-Length": Buffer.byteLength(body),
            Connection: "close",
          },
          agent: false,
          timeout: 25000,
          servername: parsed.hostname,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const rawText = Buffer.concat(chunks).toString("utf8");
            let data = {};
            try {
              data = rawText ? JSON.parse(rawText) : {};
            } catch (_e) {
              resolve({
                ok: false,
                httpStatus: res.statusCode || 0,
                error: "Easebuzz refund returned non-JSON",
                rawText: rawText.slice(0, 300),
              });
              return;
            }
            resolve({ ok: true, httpStatus: res.statusCode || 0, data, rawText });
          });
        },
      );
      req.on("error", (err) => {
        resolve({ ok: false, httpStatus: 0, error: err.message || "Refund request failed" });
      });
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, httpStatus: 0, error: "Refund request timed out" });
      });
      req.write(body);
      req.end();
    });

    if (!response.ok) {
      return {
        ok: false,
        error: response.error || "Easebuzz refund failed",
        httpStatus: response.httpStatus,
        raw: response,
      };
    }

    const data = response.data || {};
    const httpOk = response.httpStatus >= 200 && response.httpStatus < 300;
    // Easebuzz may return status:1 / true / success string
    const apiOk =
      httpOk &&
      (data.status === 1 ||
        data.status === true ||
        String(data.status).toLowerCase() === "success" ||
        String(data.msg || "").toLowerCase().includes("success") ||
        Boolean(data.refund_id || data.data?.refund_id));

    if (!apiOk && !httpOk) {
      return {
        ok: false,
        error: data.message || data.msg || data.error_desc || "Easebuzz refund rejected",
        httpStatus: response.httpStatus,
        raw: data,
      };
    }

    return {
      ok: true,
      httpStatus: response.httpStatus,
      merchantRefundId: merchant_refund_id,
      refundId: String(data.refund_id || data.data?.refund_id || ""),
      data,
      raw: data,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Easebuzz refund request failed",
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
  generateRefundHash,
  isSuccessStatus,
  isFailureStatus,
  isPendingStatus,
  retrieveTransaction,
  refundTransaction,
  makeTxnId,
};
