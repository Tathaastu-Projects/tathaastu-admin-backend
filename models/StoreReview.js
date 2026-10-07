const mongoose = require("mongoose");

const storeReviewSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productSlug: { type: String, required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "StoreCustomer", default: null },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: "", trim: true },
    body: { type: String, default: "", trim: true },
    images: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
      index: true,
    },
    isVerifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true }
);

storeReviewSchema.index({ productId: 1, createdAt: -1 });

module.exports = mongoose.models.StoreReview || mongoose.model("StoreReview", storeReviewSchema);
