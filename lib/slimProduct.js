/**
 * Trim product docs for list / home / related cards.
 * Storefront cards only need identity, price, primary image, badges, hover bits.
 */

const fs = require("fs");
const path = require("path");

/** Only expose thumbUrl when the sibling *-thumb.webp file really exists. */
function existingThumbUrl(url) {
  if (!url || typeof url !== "string" || !url.startsWith("/uploads/")) return undefined;
  const thumbUrl = url.replace(/(\.[a-z0-9]+)$/i, "-thumb.webp");
  if (thumbUrl === url) return undefined;
  const diskPath = path.join(__dirname, "..", thumbUrl.replace(/^\//, ""));
  try {
    if (fs.existsSync(diskPath)) return thumbUrl;
  } catch (_e) {
    /* ignore */
  }
  return undefined;
}

function primaryImageOnly(images) {
  if (!Array.isArray(images) || !images.length) return [];
  const primary = images.find((img) => img && img.isPrimary) || images[0];
  if (!primary?.url) return [];
  const url = String(primary.url);
  // Never invent missing -thumb.webp paths — that broke Intention / Rashi home cards
  const thumbUrl = existingThumbUrl(url);
  return [
    {
      url,
      ...(thumbUrl ? { thumbUrl } : {}),
      alt: primary.alt || "",
      isPrimary: true,
    },
  ];
}

function firstActiveVariant(variants) {
  if (!Array.isArray(variants)) return [];
  const active = variants.filter((v) => v && v.isActive !== false);
  const v = active[0];
  if (!v) return [];
  return [
    {
      _id: v._id,
      label: v.label,
      salePrice: v.salePrice,
      mrp: v.mrp,
      quantity: v.quantity,
      isActive: true,
    },
  ];
}

function slimCardProduct(product) {
  if (!product || typeof product !== "object") return product;
  const attrs = product.attributes || {};
  return {
    _id: product._id,
    title: product.title,
    slug: product.slug,
    sku: product.sku,
    status: product.status,
    category: product.category,
    intentions: product.intentions,
    tags: product.tags,
    mrp: product.mrp,
    salePrice: product.salePrice,
    discountPercent: product.discountPercent,
    effectiveMrp: product.effectiveMrp,
    effectiveSalePrice: product.effectiveSalePrice,
    effectiveDiscountPercent: product.effectiveDiscountPercent,
    effectiveStock: product.effectiveStock,
    totalStock: product.totalStock,
    quantity: product.quantity,
    isFeatured: product.isFeatured,
    isBestSeller: product.isBestSeller,
    isNewArrival: product.isNewArrival,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    hoverDetails: Array.isArray(product.hoverDetails)
      ? product.hoverDetails.slice(0, 6)
      : product.hoverDetails,
    attributes: {
      material: attrs.material,
      stone: attrs.stone,
      origin: attrs.origin,
      zodiac: attrs.zodiac,
    },
    images: primaryImageOnly(product.images),
    variants: firstActiveVariant(product.variants),
  };
}

function slimCardProducts(list) {
  if (!Array.isArray(list)) return [];
  return list.map(slimCardProduct);
}

function slimCardProductMap(map) {
  if (!map || typeof map !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(map)) {
    out[key] = slimCardProduct(value);
  }
  return out;
}

module.exports = {
  slimCardProduct,
  slimCardProducts,
  slimCardProductMap,
  primaryImageOnly,
};
