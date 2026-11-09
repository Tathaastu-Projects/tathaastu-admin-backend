/**
 * Local / live diagnostic: create 2 online orders and initiate payment twice.
 *
 * Usage:
 *   node scripts/test-easebuzz-twice.js
 *   node scripts/test-easebuzz-twice.js http://localhost:3024
 *   node scripts/test-easebuzz-twice.js https://storebackend.abhimantritstore.com
 *
 * What "main error" looks like:
 *   - INIT returns HTML "502 Bad Gateway" + /api/health also 502
 *     → YOUR Node process crashed (not Easebuzz declining payment)
 *   - INIT returns JSON { success:false, message:"..." }
 *     → API stayed up; read the message (hash/keys/validation)
 *   - INIT returns JSON { success:true, data.paymentUrl }
 *     → payment gateway path OK
 */
const base = (process.argv[2] || process.env.API_BASE || "http://localhost:3024").replace(/\/$/, "");

async function health(label) {
  try {
    const r = await fetch(`${base}/api/health`);
    const t = await r.text();
    console.log(`  [${label}] health ${r.status} ${t.slice(0, 60)}`);
    return r.status;
  } catch (e) {
    console.log(`  [${label}] health ERR ${e.message}`);
    return 0;
  }
}

async function once(n) {
  console.log(`\n=== Attempt ${n} ===`);
  await health(`before-order-${n}`);

  const cat = await fetch(`${base}/api/store/catalog?page=1&limit=1`);
  const cj = await cat.json();
  const item = Array.isArray(cj.data) ? cj.data[0] : null;
  if (!item) {
    console.log("No catalog product. Is backend running?", cat.status);
    return false;
  }

  const body = {
    items: [{ productId: item._id, slug: item.slug, quantity: 1 }],
    customer: {
      name: "Local Test",
      email: "govindrajpoot760@gmail.com",
      phone: "7500620049",
    },
    shippingAddress: {
      name: "Local Test",
      phone: "7500620049",
      line1: "A-1 Test",
      city: "Delhi",
      state: "DL",
      pincode: "110001",
      country: "India",
    },
    paymentMethod: "online",
  };

  const or = await fetch(`${base}/api/store/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const oj = await or.json().catch(() => ({}));
  console.log(`  ORDER ${or.status} id=${oj?.data?.id || "?"}`);
  if (!oj?.data?.id || !oj?.data?.paymentToken) {
    console.log("  order body:", JSON.stringify(oj).slice(0, 300));
    return false;
  }

  await health(`before-init-${n}`);
  const t0 = Date.now();
  const ir = await fetch(`${base}/api/store/payments/easebuzz/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeOrderId: oj.data.id,
      paymentToken: oj.data.paymentToken,
      phone: "7500620049",
    }),
  });
  const raw = await ir.text();
  const ms = Date.now() - t0;
  const ct = ir.headers.get("content-type") || "";
  console.log(`  INIT ${ir.status} ms=${ms} ct=${ct}`);
  console.log(`  body: ${raw.slice(0, 220).replace(/\n/g, " ")}`);
  await health(`after-init-${n}`);

  if (ir.status === 502 && /Bad Gateway/i.test(raw)) {
    console.log("  >> MAIN ERROR: Node crashed behind nginx (not Easebuzz). Check pm2 logs.");
    return false;
  }
  if (!ir.ok) {
    console.log("  >> API error (process still alive). Fix message above.");
    return false;
  }
  console.log("  >> OK paymentUrl received");
  return true;
}

(async () => {
  console.log("API:", base);
  const ping = await fetch(`${base}/api/store/payments/easebuzz/ping`).catch(() => null);
  if (ping) {
    console.log("ping", ping.status, (await ping.text()).slice(0, 180));
  }
  const a = await once(1);
  await new Promise((r) => setTimeout(r, 1200));
  const b = await once(2);
  console.log("\nRESULT:", a && b ? "BOTH OK" : "FAILED — see MAIN ERROR lines above");
  process.exit(a && b ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
