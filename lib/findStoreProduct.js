const Product = require("../models/Product");

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Resolve a storefront /product/:param to a listed product.
 * Accepts catalog SKU (any punctuation), URL slug, or product title.
 */
async function findListedProductByPath(param) {
  const raw = String(param || "").trim();
  if (!raw) return null;

  const asSlug = slugify(raw);
  const candidates = [
    ...new Set([raw, asSlug, raw.toUpperCase(), raw.toLowerCase()].filter(Boolean)),
  ];

  let product = await Product.findOne({
    status: "listed",
    $or: [{ slug: { $in: candidates } }, { sku: { $in: candidates } }],
  });
  if (product) return product;

  // Match slugified SKU / slug / title (e.g. URL gm-dyn-770 vs DB SKU GM_DYN_770)
  const listed = await Product.find({ status: "listed" })
    .select("title slug sku status")
    .lean();
  const want = asSlug || slugify(raw);
  const hit = (listed || []).find((p) => {
    if (!want) return false;
    if (slugify(p.slug) === want) return true;
    if (p.sku && slugify(p.sku) === want) return true;
    if (slugify(p.title) === want) return true;
    return false;
  });

  if (hit?._id) {
    product = await Product.findById(hit._id);
    if (product && product.status === "listed") return product;
  }

  return null;
}

module.exports = {
  slugify,
  findListedProductByPath,
};
