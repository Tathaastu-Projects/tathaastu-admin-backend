const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, trim: true },
    label: { type: String, trim: true, required: true },
    mukhi: { type: String, trim: true, default: "" },
    size: { type: String, trim: true, default: "" },
    weight: { type: String, trim: true, default: "" },
    material: { type: String, trim: true, default: "" },
    color: { type: String, trim: true, default: "" },
    mrp: { type: Number, default: 0 },
    salePrice: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, default: "" },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    sku: { type: String, trim: true, index: true },
    shortDescription: { type: String, default: "" },
    description: { type: String, default: "" },
    category: {
      type: String,
      enum: [
        "rudraksha",
        "crystal",
        "stone",
        "gemstone",
        "yantra",
        "bracelet",
        "combo",
        "other",
      ],
      required: true,
      index: true,
    },
    images: { type: [imageSchema], default: [] },
    mrp: { type: Number, default: 0 },
    salePrice: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    variants: { type: [variantSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "listed", "unlisted"],
      default: "draft",
      index: true,
    },
    isFeatured: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: true },
    intentions: {
      type: [
        {
          type: String,
          enum: ["Peace", "Wealth", "Health", "Protection", "Relationship", "Success", "Spirituality"],
        },
      ],
      default: [],
      index: true,
    },
    attributes: {
      face: { type: String, default: "" },
      stone: { type: String, default: "" },
      shape: { type: String, default: "" },
      weight: { type: String, default: "" },
      gender: { type: String, default: "" },
      color: { type: String, default: "" },
      occasion: { type: String, default: "" },
      zodiac: { type: String, default: "" },
    },
    seo: {
      metaTitle: { type: String, default: "" },
      metaDescription: { type: String, default: "" },
    },
    linkedRemedyId: { type: mongoose.Schema.Types.ObjectId, ref: "Remedy", default: null },
    linkedRemedyName: { type: String, default: "" },
    createdBy: { type: String, default: "Admin" },
    updatedBy: { type: String, default: "Admin" },
  },
  { timestamps: true }
);

productSchema.virtual("discountPercent").get(function discountPercent() {
  if (!this.mrp || this.mrp <= 0 || this.salePrice >= this.mrp) return 0;
  return Math.round(((this.mrp - this.salePrice) / this.mrp) * 100);
});

productSchema.virtual("totalStock").get(function totalStock() {
  if (this.variants?.length) {
    return this.variants.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }
  return Number(this.quantity) || 0;
});

productSchema.virtual("isLowStock").get(function isLowStock() {
  const stock = this.variants?.length
    ? this.variants.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
    : Number(this.quantity) || 0;
  return stock <= (this.lowStockThreshold ?? 5);
});

productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

productSchema.index({ title: "text", description: "text", shortDescription: "text", sku: "text" });

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
