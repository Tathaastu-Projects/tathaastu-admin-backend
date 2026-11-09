/**
 * Removes old unpaid online test orders so store_orders.json stays small.
 * Large JSON files + double saves can OOM a small Mac mini Node process.
 *
 *   node scripts/purge-pending-online-orders.js
 *   node scripts/purge-pending-online-orders.js --days 1
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const StoreOrder = require("../models/StoreOrder");

const days = Math.max(0, Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] || 0));
const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

(async () => {
  const all = await StoreOrder.find({
    paymentMethod: "online",
    paymentStatus: { $in: ["pending"] },
  });
  const list = Array.isArray(all) ? all : [];
  const victims = list.filter((o) => {
    if (o.paymentStatus === "paid") return false;
    const t = new Date(o.createdAt || 0).getTime();
    if (days > 0) return Number.isFinite(t) && t < cutoff;
    // default: pending online with no successful pay (keep last 20)
    return true;
  });

  // Keep newest 20 pending; delete the rest
  victims.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const toDelete = days > 0 ? victims : victims.slice(20);
  console.log(`pending online=${list.length} delete=${toDelete.length} keep=${list.length - toDelete.length}`);

  let n = 0;
  for (const o of toDelete) {
    await StoreOrder.findByIdAndDelete(String(o._id));
    n += 1;
  }
  console.log(`deleted ${n} unpaid online orders`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
