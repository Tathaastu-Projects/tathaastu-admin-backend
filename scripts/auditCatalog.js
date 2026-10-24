const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { ensureStorageLayout } = require("../lib/fileDb");
ensureStorageLayout();
const Product = require("../models/Product");

async function main() {
    const total = await Product.countDocuments({});
  const listed = await Product.countDocuments({ status: "listed" });
  const byCat = await Product.aggregate([
    { $match: { status: "listed" } },
    { $group: { _id: "$category", c: { $sum: 1 } } },
    { $sort: { c: -1 } },
  ]);
  const featured = await Product.countDocuments({ status: "listed", isFeatured: true });
  const best = await Product.countDocuments({ status: "listed", isBestSeller: true });
  const neu = await Product.countDocuments({ status: "listed", isNewArrival: true });
  const withIntent = await Product.countDocuments({
    status: "listed",
    intentions: { $exists: true, $not: { $size: 0 } },
  });
  const withRating = await Product.countDocuments({ status: "listed", ratingCount: { $gt: 0 } });
  const withColor = await Product.countDocuments({
    status: "listed",
    "attributes.color": { $exists: true, $ne: "" },
  });
  const withShape = await Product.countDocuments({
    status: "listed",
    "attributes.shape": { $exists: true, $ne: "" },
  });
  const sample = await Product.find({ status: "listed" })
    .select("title category intentions isFeatured isBestSeller ratingAvg ratingCount images attributes")
    .limit(3)
    .lean();
  console.log(
    JSON.stringify(
      { total, listed, featured, best, neu, withIntent, withRating, withColor, withShape, byCat, sample },
      null,
      2
    )
  );
  }

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
