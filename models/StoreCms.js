const mongoose = require("mongoose");

const storeBannerSchema = new mongoose.Schema(
  {
    key: { type: String, default: "home-hero", index: true },
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    ctaLabel: { type: String, default: "Shop Now" },
    ctaHref: { type: String, default: "/shop" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const storeBlogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    excerpt: { type: String, default: "" },
    content: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    tags: { type: [String], default: [] },
    author: { type: String, default: "Tathaastu" },
    status: { type: String, enum: ["draft", "published"], default: "published", index: true },
    publishedAt: { type: Date, default: Date.now },
    seo: {
      metaTitle: { type: String, default: "" },
      metaDescription: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

const storePageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    content: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    seo: {
      metaTitle: { type: String, default: "" },
      metaDescription: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = {
  StoreBanner: mongoose.models.StoreBanner || mongoose.model("StoreBanner", storeBannerSchema),
  StoreBlogPost: mongoose.models.StoreBlogPost || mongoose.model("StoreBlogPost", storeBlogPostSchema),
  StorePage: mongoose.models.StorePage || mongoose.model("StorePage", storePageSchema),
};
