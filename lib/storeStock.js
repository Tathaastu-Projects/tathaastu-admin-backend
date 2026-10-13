const Product = require("../models/Product");

async function decrementStock(productId, variantId, quantity) {
  if (variantId) {
    const updated = await Product.findOneAndUpdate(
      {
        _id: productId,
        status: "listed",
        variants: {
          $elemMatch: {
            _id: variantId,
            isActive: true,
            quantity: { $gte: quantity },
          },
        },
      },
      { $inc: { "variants.$[v].quantity": -quantity } },
      {
        arrayFilters: [{ "v._id": variantId, "v.quantity": { $gte: quantity } }],
        new: true,
      }
    );
    return Boolean(updated);
  }

  const updated = await Product.findOneAndUpdate(
    {
      _id: productId,
      status: "listed",
      quantity: { $gte: quantity },
      $or: [{ variants: { $size: 0 } }, { variants: { $exists: false } }],
    },
    { $inc: { quantity: -quantity } },
    { new: true }
  );
  return Boolean(updated);
}

async function restoreStock(productId, variantId, quantity) {
  if (variantId) {
    await Product.findOneAndUpdate(
      { _id: productId, "variants._id": variantId },
      { $inc: { "variants.$[v].quantity": quantity } },
      { arrayFilters: [{ "v._id": variantId }] }
    );
    return;
  }
  await Product.findByIdAndUpdate(productId, { $inc: { quantity } });
}

module.exports = { decrementStock, restoreStock };
