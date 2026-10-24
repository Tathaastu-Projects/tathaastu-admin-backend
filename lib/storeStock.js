const Product = require("../models/Product");
const { toIdString, idsEqual } = require("./fileDb");

async function decrementStock(productId, variantId, quantity) {
  const product = await Product.findById(productId);
  if (!product || product.status !== "listed") return false;
  const qty = Number(quantity) || 0;
  if (qty <= 0) return false;

  if (variantId) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variants.find((v) => idsEqual(v._id, variantId));
    if (!variant || variant.isActive === false) return false;
    if (Number(variant.quantity || 0) < qty) return false;
    variant.quantity = Number(variant.quantity || 0) - qty;
    product.variants = variants;
    await product.save();
    return true;
  }

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return false;
  }
  if (Number(product.quantity || 0) < qty) return false;
  product.quantity = Number(product.quantity || 0) - qty;
  await product.save();
  return true;
}

async function restoreStock(productId, variantId, quantity) {
  const product = await Product.findById(productId);
  if (!product) return;
  const qty = Number(quantity) || 0;
  if (qty <= 0) return;

  if (variantId) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variants.find((v) => idsEqual(v._id, variantId) || toIdString(v._id) === toIdString(variantId));
    if (variant) {
      variant.quantity = Number(variant.quantity || 0) + qty;
      product.variants = variants;
      await product.save();
    }
    return;
  }

  product.quantity = Number(product.quantity || 0) + qty;
  await product.save();
}

module.exports = { decrementStock, restoreStock };
