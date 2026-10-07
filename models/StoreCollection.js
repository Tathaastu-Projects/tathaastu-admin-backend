const mongoose = require("mongoose");

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const storeCollectionSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "" },
    description: { type: String, default: "" },
    bannerImage: { type: String, default: "" },
    seo: {
      metaTitle: { type: String, default: "" },
      metaDescription: { type: String, default: "" },
    },
    // Default catalog filters applied when opening this collection
    defaultFilters: {
      categories: { type: [String], default: [] },
      intentions: { type: [String], default: [] },
      onSale: { type: Boolean, default: false },
      featured: { type: Boolean, default: false },
      bestSeller: { type: Boolean, default: false },
      isNewArrival: { type: Boolean, default: false },
      minPrice: { type: Number, default: null },
      maxPrice: { type: Number, default: null },
    },
    trustBadges: {
      type: [{ id: String, label: String, description: String }],
      default: [],
    },
    comparisonTable: {
      title: { type: String, default: "" },
      headers: { type: [String], default: [] },
      rows: { type: [[String]], default: [] },
    },
    faqs: { type: [faqSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.StoreCollection || mongoose.model("StoreCollection", storeCollectionSchema);
