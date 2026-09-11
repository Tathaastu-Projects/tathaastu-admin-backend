const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Remedy = require("../models/Remedy");
const { buildAllRemedies } = require("../data/buildRemedies");

async function seed() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/tathasstu-admin";
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const remedies = buildAllRemedies();
  console.log("Built remedies:", remedies.length);
  const byCategory = remedies.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
  console.log("By category:", byCategory);

  await Remedy.deleteMany({});
  await Remedy.insertMany(remedies);

  console.log("✅ Seeded", remedies.length, "remedies into MongoDB");
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error("Seed failed:", err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
