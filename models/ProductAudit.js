const mongoose = require("mongoose");

const productAuditSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productTitle: { type: String, default: "" },
    action: {
      type: String,
      enum: [
        "create",
        "update",
        "delete",
        "list",
        "unlist",
        "publish",
        "draft",
        "bulk_list",
        "bulk_unlist",
        "price_change",
        "stock_change",
        "image_upload",
      ],
      required: true,
    },
    actor: { type: String, default: "Admin" },
    actorEmail: { type: String, default: "" },
    changes: { type: mongoose.Schema.Types.Mixed, default: {} },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.ProductAudit || mongoose.model("ProductAudit", productAuditSchema);
