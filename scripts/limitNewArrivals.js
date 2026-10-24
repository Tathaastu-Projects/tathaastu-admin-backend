const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { ensureStorageLayout } = require("../lib/fileDb");
ensureStorageLayout();
const Product = require("../models/Product");

async function main() {
    const listed = await Product.find({ status: "listed" }).select("_id").sort({ slug: 1 });
  await Product.updateMany({ status: "listed" }, { $set: { isNewArrival: false } });
  const ids = listed.slice(0, 48).map((p) => p._id);
  await Product.updateMany({ _id: { $in: ids } }, { $set: { isNewArrival: true } });
  const neu = await Product.countDocuments({ status: "listed", isNewArrival: true });
  console.log(JSON.stringify({ listed: listed.length, newArrival: neu }, null, 2));
  }

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
