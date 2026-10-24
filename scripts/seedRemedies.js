const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { ensureStorageLayout } = require("../lib/fileDb");
const Remedy = require("../models/Remedy");
const { buildAllRemedies } = require("../data/buildRemedies");

async function seed() {
  ensureStorageLayout();
  console.log("Using local file storage");

  let remedies = [];
  try {
    remedies = buildAllRemedies();
  } catch (err) {
    console.warn("⚠️  Remedy PDF sources missing — writing empty remedies.json:", err.message);
    remedies = [];
  }
  console.log("Built remedies:", remedies.length);
  const byCategory = remedies.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
  console.log("By category:", byCategory);

  await Remedy.deleteMany({});
  await Remedy.insertMany(remedies);

  console.log("✅ Seeded", remedies.length, "remedies into storage/data/remedies.json");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
