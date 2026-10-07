const mongoose = require("mongoose");

const storeLeadSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["newsletter", "consultation"],
      required: true,
      index: true,
    },
    name: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true },
    message: { type: String, default: "" },
    interest: { type: String, default: "" },
    source: { type: String, default: "store", trim: true },
    status: {
      type: String,
      enum: ["new", "contacted", "closed"],
      default: "new",
      index: true,
    },
  },
  { timestamps: true }
);

storeLeadSchema.index({ email: 1, type: 1 });

module.exports = mongoose.models.StoreLead || mongoose.model("StoreLead", storeLeadSchema);
