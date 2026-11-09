/**
 * Run THIS ON THE LIVE MAC (not through nginx) to find the real crash point.
 *
 *   cd ~/Developer/website_hosting/tathasstu_store/tathaastu-admin-backend
 *   node scripts/diag-initiate-crash.js
 *
 * Then in another terminal while it runs:
 *   pm2 logs tathaastu-admin-backend --lines 50
 *   (use your real pm2 app name from `pm2 list`)
 *
 * Steps stop at the first failure. If THIS script itself exits hard (no RESULT line),
 * the crash is inside Easebuzz HTTPS or fileDb save — not nginx.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const StoreOrder = require("../models/StoreOrder");
const {
  getEasebuzzConfig,
  generateRequestHash,
  formatAmount,
} = require("../lib/easebuzz");
const { postFormUrlEncoded } = require("../lib/easebuzzHttp");
const { paymentExpiresAtFromNow } = require("../lib/easebuzzPayments");
const crypto = require("crypto");

function log(step, msg, extra) {
  console.log(`\n[${step}] ${msg}`);
  if (extra !== undefined) console.log(typeof extra === "string" ? extra : JSON.stringify(extra, null, 2));
}

async function main() {
  log("0", "Node", { version: process.version, pid: process.pid, cwd: process.cwd() });

  const cfg = getEasebuzzConfig();
  log("1", "Easebuzz config", { configured: cfg.configured, env: cfg.env, initiateUrl: cfg.initiateUrl });
  if (!cfg.configured) {
    console.log("RESULT: FAIL missing keys");
    process.exit(1);
  }

  log("2", "HTTPS probe to Easebuzz (in-process, no child)...");
  const probe = await postFormUrlEncoded(
    cfg.initiateUrl,
    "key=probe&txnid=ping&amount=1.00&productinfo=ping&firstname=Ping&email=ping@example.com&phone=9999999999&surl=https://example.com&furl=https://example.com&hash=0",
    { timeoutMs: 15000, isolated: false },
  );
  log("2", "probe done", {
    ok: probe.ok,
    httpStatus: probe.httpStatus,
    error: probe.error || null,
    preview: probe.ok
      ? String(probe.data?.error_desc || probe.data?.data || "").slice(0, 120)
      : String(probe.rawText || "").slice(0, 120),
  });

  log("3", "Create unpaid online order via fileDb...");
  const order = await StoreOrder.create({
    orderNumber: `DIAG-${Date.now()}`,
    status: "placed",
    paymentMethod: "online",
    paymentStatus: "pending",
    customer: {
      name: "Diag Test",
      email: "govindrajpoot760@gmail.com",
      phone: "7500620049",
    },
    shippingAddress: {
      line1: "A-1",
      city: "Delhi",
      state: "DL",
      pincode: "110001",
      country: "India",
    },
    items: [{ productId: "diag", name: "Diag", quantity: 1, price: 100 }],
    pricing: { subtotal: 100, shipping: 0, discount: 0, total: 100 },
  });
  log("3", "order created", { id: String(order._id), orderNumber: order.orderNumber });

  for (let n = 1; n <= 2; n += 1) {
    log(`4.${n}`, `Build Easebuzz form + HTTPS initiate #${n}`);
    const txnid = `ABMDIAG${Date.now()}${n}${crypto.randomBytes(2).toString("hex")}`.slice(0, 40);
    const amount = formatAmount(order.pricing?.total);
    const firstname = "Diag";
    const email = "govindrajpoot760@gmail.com";
    const phone = "7500620049";
    const productinfo = `Order ${order.orderNumber}`.slice(0, 100);
    const udf1 = String(order._id);
    const udf2 = String(order.orderNumber || "");
    const returnUrl = `${process.env.BACKEND_PUBLIC_URL || "https://storebackend.abhimantritstore.com"}/api/store/payments/easebuzz/return`;
    const hash = generateRequestHash({
      key: cfg.key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      udf1,
      udf2,
      salt: cfg.salt,
    });
    const form = new URLSearchParams({
      key: cfg.key,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl: returnUrl,
      furl: returnUrl,
      hash,
      udf1,
      udf2,
    });

    log(`4.${n}`, "calling pay.easebuzz.in ...");
    const ease = await postFormUrlEncoded(cfg.initiateUrl, form.toString(), {
      timeoutMs: 20000,
      isolated: false,
    });
    log(`4.${n}`, "Easebuzz response", {
      ok: ease.ok,
      httpStatus: ease.httpStatus,
      status: ease.data?.status,
      error: ease.error || ease.data?.error_desc || ease.data?.data || null,
    });

    if (!ease.ok || Number(ease.data?.status) !== 1 || !ease.data?.data) {
      console.log("RESULT: FAIL at Easebuzz response (API alive — this is NOT nginx 502)");
      process.exit(1);
    }

    log(`5.${n}`, "Saving accessKey on order...");
    const accessKey = String(ease.data.data);
    order.easebuzzTxnId = txnid;
    order.easebuzzAccessKey = accessKey;
    order.easebuzzStatus = "initiated";
    order.paymentInitiatedAt = new Date().toISOString();
    order.paymentExpiresAt = paymentExpiresAtFromNow();
    await order.save();
    log(`5.${n}`, "save OK", { txnid, accessKey: accessKey.slice(0, 12) + "..." });
  }

  console.log("\nRESULT: BOTH initiates OK inside this script (no process crash).");
  console.log("If `npm run test:pay:live` still 502s, crash is only in the PM2/nginx HTTP process");
  console.log("(memory limit / old code still running). Do: pm2 restart all && pm2 logs");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nRESULT: SCRIPT THREW (process stayed alive):", err);
  process.exit(1);
});
