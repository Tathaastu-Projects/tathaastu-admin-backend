const mongoose = require("mongoose");

const remedySchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["rudraksha", "crystal", "stone", "switchword"],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    problems: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    benefits: { type: [String], default: [] },
    description: { type: String, default: "" },
    howToUse: { type: String, default: "" },
    affirmations: { type: [String], default: [] },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    source: { type: String, default: "" },
    searchText: { type: String, default: "" },
  },
  { timestamps: true }
);

remedySchema.index({ category: 1, name: 1 });
remedySchema.index({ problems: 1 });
remedySchema.index({ searchText: "text" });

module.exports = mongoose.models.Remedy || mongoose.model("Remedy", remedySchema);
