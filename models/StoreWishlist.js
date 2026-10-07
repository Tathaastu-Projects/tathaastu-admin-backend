const mongoose = require("mongoose");

const storeWishlistSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "StoreCustomer", default: null, index: true },
    guestId: { type: String, default: "", index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productSlug: { type: String, default: "" },
    title: { type: String, default: "" },
    image: { type: String, default: "" },
    salePrice: { type: Number, default: 0 },
  },
  { timestamps: true }
);

storeWishlistSchema.index({ customerId: 1, productId: 1 }, { unique: true, partialFilterExpression: { customerId: { $type: "objectId" } } });
storeWishlistSchema.index({ guestId: 1, productId: 1 }, { unique: true, partialFilterExpression: { guestId: { $gt: "" } } });

module.exports =
  mongoose.models.StoreWishlist || mongoose.model("StoreWishlist", storeWishlistSchema);
