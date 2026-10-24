const path = require("path");
const express = require("express");
const multer = require("multer");
const Product = require("../models/Product");
const ProductAudit = require("../models/ProductAudit");
const Remedy = require("../models/Remedy");
const { uploadProductImages } = require("../middleware/upload");
const { queryCatalog, queryFacets } = require("../lib/storeCatalog");
const { buildProductExcelTemplate, parseProductsFromExcel } = require("../lib/productExcel");
const { deleteUploadByUrl } = require("../lib/storedFiles");

const router = express.Router();

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (
      [".xlsx", ".xls", ".csv"].includes(ext) ||
      file.mimetype.includes("spreadsheet") ||
      file.mimetype.includes("excel") ||
      file.mimetype.includes("csv") ||
      file.mimetype === "application/octet-stream"
    ) {
      return cb(null, true);
    }
    cb(new Error("Please upload a valid Excel (.xlsx, .xls) or CSV file"));
  },
});

const INTENTIONS = ["Peace", "Wealth", "Health", "Protection", "Relationship", "Success", "Spirituality"];
const CATEGORIES = [
  "crystal-bracelets",
  "rudraksha",
  "crystal-anklets",
  "tumbles",
  "crystal-trees",
  "pyramids",
  "loose-stones",
  "mala",
  "photo-frames",
  "other",
];

const LEGACY_CATEGORY_MAP = {
  bracelet: "crystal-bracelets",
  bracelets: "crystal-bracelets",
  gemstone: "loose-stones",
  gemstones: "loose-stones",
  stone: "loose-stones",
  stones: "loose-stones",
  crystal: "tumbles",
  yantra: "photo-frames",
  combo: "crystal-bracelets",
};

function normalizeCategory(val) {
  if (!val) return "crystal-bracelets";
  const str = String(val).trim().toLowerCase();
  const slug = str.replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (CATEGORIES.includes(slug)) return slug;
  if (CATEGORIES.includes(str)) return str;
  if (LEGACY_CATEGORY_MAP[slug]) return LEGACY_CATEGORY_MAP[slug];
  if (LEGACY_CATEGORY_MAP[str]) return LEGACY_CATEGORY_MAP[str];
  return "crystal-bracelets";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function actorFrom(req) {
  return {
    actor: req.body?.actor || req.headers["x-actor-name"] || "Admin",
    actorEmail: req.body?.actorEmail || req.headers["x-actor-email"] || "",
  };
}

async function writeAudit({ product, action, actor, actorEmail, changes = {}, note = "" }) {
  await ProductAudit.create({
    productId: product._id,
    productTitle: product.title,
    action,
    actor,
    actorEmail,
    changes,
    note,
  });
}

function normalizeProductPayload(body = {}) {
  const title = String(body.title || "").trim();
  const slug = slugify(body.slug || title);
  const intentions = Array.isArray(body.intentions)
    ? body.intentions.filter((item) => INTENTIONS.includes(item))
    : [];

  const variants = Array.isArray(body.variants)
    ? body.variants
        .map((item) => ({
          sku: String(item.sku || "").trim(),
          label: String(item.label || "").trim(),
          mukhi: String(item.mukhi || "").trim(),
          size: String(item.size || "").trim(),
          weight: String(item.weight || "").trim(),
          material: String(item.material || "").trim(),
          color: String(item.color || "").trim(),
          mrp: Number(item.mrp) || 0,
          salePrice: Number(item.salePrice) || 0,
          quantity: Number(item.quantity) || 0,
          isActive: item.isActive !== false,
        }))
        .filter((item) => item.label)
    : [];

  const images = Array.isArray(body.images)
    ? body.images
        .map((item, index) => ({
          url: String(item.url || "").trim(),
          alt: String(item.alt || title).trim(),
          isPrimary: Boolean(item.isPrimary) || index === 0,
        }))
        .filter((item) => item.url)
    : [];

  if (images.length && !images.some((img) => img.isPrimary)) {
    images[0].isPrimary = true;
  }

  return {
    title,
    slug,
    sku: String(body.sku || "").trim(),
    shortDescription: String(body.shortDescription || "").trim(),
    description: String(body.description || "").trim(),
    category: normalizeCategory(body.category),
    images,
    mrp: Number(body.mrp) || 0,
    salePrice: Number(body.salePrice) || 0,
    quantity: Number(body.quantity) || 0,
    lowStockThreshold: Number(body.lowStockThreshold ?? 5),
    variants,
    status: ["draft", "listed", "unlisted"].includes(body.status) ? body.status : "draft",
    isFeatured: Boolean(body.isFeatured),
    isBestSeller: Boolean(body.isBestSeller),
    isNewArrival: body.isNewArrival !== false && body.isNew !== false,
    intentions,
    attributes: {
      face: String(body.attributes?.face || "").trim(),
      stone: String(body.attributes?.stone || "").trim(),
      shape: String(body.attributes?.shape || "").trim(),
      weight: String(body.attributes?.weight || "").trim(),
      gender: String(body.attributes?.gender || "").trim(),
      color: String(body.attributes?.color || "").trim(),
      occasion: String(body.attributes?.occasion || "").trim(),
      zodiac: String(body.attributes?.zodiac || "").trim(),
      material: String(body.attributes?.material || "").trim(),
      mukhi: String(body.attributes?.mukhi || "").trim(),
      jewelryType: String(body.attributes?.jewelryType || "").trim(),
      planet: String(body.attributes?.planet || "").trim(),
      origin: String(body.attributes?.origin || "").trim(),
    },
    tags: Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
      : String(body.tags || "")
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
    weightCarat: body.weightCarat === "" || body.weightCarat == null ? null : Number(body.weightCarat),
    weightRatti: body.weightRatti === "" || body.weightRatti == null ? null : Number(body.weightRatti),
    seo: {
      metaTitle: String(body.seo?.metaTitle || body.title || "").trim(),
      metaDescription: String(body.seo?.metaDescription || body.shortDescription || "").trim(),
    },
    linkedRemedyId: body.linkedRemedyId || null,
    linkedRemedyName: String(body.linkedRemedyName || "").trim(),
    hoverDetails: Array.isArray(body.hoverDetails)
      ? body.hoverDetails
          .map((item) => ({ label: String(item?.label || "").trim() }))
          .filter((item) => item.label)
          .slice(0, 8)
      : [],
  };
}

function pickChanges(before, after, fields) {
  const changes = {};
  for (const field of fields) {
    const prev = before?.[field];
    const next = after?.[field];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changes[field] = { from: prev, to: next };
    }
  }
  return changes;
}

router.get("/meta", async (_req, res) => {
  try {
    const remedies = await Remedy.find({})
      .select("name category slug problems")
      .sort({ category: 1, name: 1 })
      .limit(300)
      .lean();
    res.json({
      success: true,
      data: {
        categories: CATEGORIES,
        intentions: INTENTIONS,
        statuses: ["draft", "listed", "unlisted"],
        remedies,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load product meta" });
  }
});

router.get("/excel-template", (_req, res) => {
  try {
    const buffer = buildProductExcelTemplate();
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Tathaastu_Product_Template.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (error) {
    console.error("Excel template error:", error);
    res.status(500).json({ success: false, message: "Failed to generate Excel template" });
  }
});

router.post("/excel-import", (req, res) => {
  excelUpload.single("file")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({ success: false, message: uploadError.message || "File upload failed" });
    }
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ success: false, message: "Please select an Excel or CSV file to upload" });
      }

      const { valid, errors, totalParsed } = parseProductsFromExcel(req.file.buffer);

      if (!valid.length && errors.length) {
        return res.status(400).json({
          success: false,
          message: "No valid products found in the file",
          totalParsed,
          importedCount: 0,
          failedCount: errors.length,
          errors,
        });
      }

      const { actor, actorEmail } = actorFrom(req);
      const createdProducts = [];
      const importErrors = [...errors];

      for (const item of valid) {
        try {
          const payload = item.payload;
          let slug = payload.slug || slugify(payload.title);
          const slugExists = await Product.findOne({ slug });
          if (slugExists) {
            slug = `${slug}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 900 + 100)}`;
          }
          payload.slug = slug;

          if (payload.linkedRemedyName) {
            try {
              const remedy = await Remedy.findOne({
                $or: [
                  { name: new RegExp(`^${payload.linkedRemedyName}$`, "i") },
                  { slug: slugify(payload.linkedRemedyName) },
                  { name: new RegExp(payload.linkedRemedyName, "i") },
                ],
              }).select("_id name");
              if (remedy) {
                payload.linkedRemedyId = remedy._id;
                payload.linkedRemedyName = remedy.name;
              }
            } catch (_remErr) {}
          }

          const product = await Product.create({
            ...payload,
            createdBy: actor,
            updatedBy: actor,
          });

          try {
            await writeAudit({
              product,
              action: payload.status === "listed" ? "publish" : "create",
              actor,
              actorEmail,
              changes: { row: item.row, title: product.title, sku: product.sku },
              note: `Imported from file (${req.file?.originalname || "Excel template"})`,
            });
          } catch (auditErr) {
            console.warn("Product audit write warning:", auditErr.message);
          }

          createdProducts.push({
            _id: product._id,
            title: product.title,
            sku: product.sku,
            category: product.category,
            salePrice: product.salePrice,
            status: product.status,
          });
        } catch (rowErr) {
          importErrors.push({
            row: item.row,
            title: item.payload?.title || "Unknown",
            error: rowErr.message || "Database insert error",
          });
        }
      }

      res.status(200).json({
        success: true,
        message: `Successfully imported ${createdProducts.length} of ${totalParsed} products`,
        totalParsed,
        importedCount: createdProducts.length,
        failedCount: importErrors.length,
        importedProducts: createdProducts,
        errors: importErrors,
      });
    } catch (error) {
      console.error("Excel import error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to process Excel file",
      });
    }
  });
});

router.get("/stats", async (_req, res) => {
  try {
    const [total, listed, draft, unlisted, byCategory, lowStockAgg] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ status: "listed" }),
      Product.countDocuments({ status: "draft" }),
      Product.countDocuments({ status: "unlisted" }),
      Product.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
      Product.aggregate([
        {
          $addFields: {
            stockTotal: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] },
                { $sum: "$variants.quantity" },
                { $ifNull: ["$quantity", 0] },
              ],
            },
            threshold: { $ifNull: ["$lowStockThreshold", 5] },
          },
        },
        { $match: { $expr: { $lte: ["$stockTotal", "$threshold"] } } },
        { $count: "count" },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        total,
        listed,
        draft,
        unlisted,
        lowStock: lowStockAgg[0]?.count || 0,
        byCategory: byCategory.reduce((acc, row) => {
          acc[row._id] = row.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Product stats error:", error);
    res.status(500).json({ success: false, message: "Failed to load product stats" });
  }
});

router.get("/audits", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const filter = {};
    if (req.query.productId) filter.productId = req.query.productId;
    const data = await ProductAudit.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load audits" });
  }
});

// Public catalog for website
router.get("/public", async (req, res) => {
  try {
    const result = await queryCatalog(req.query);
    const payload = {
      success: true,
      data: result.items,
      pagination: result.pagination,
      priceStats: result.priceStats,
      appliedFilters: result.params,
    };

    if (result.params.includeFacets) {
      const facets = await queryFacets(req.query);
      payload.facets = facets.facets;
      payload.sortOptions = facets.sortOptions;
    }

    res.json(payload);
  } catch (error) {
    console.error("Public products error:", error);
    res.status(500).json({ success: false, message: "Failed to load public products" });
  }
});

router.get("/public/:slug", async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, status: "listed" });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load product" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status, category, intention, q, lowStock, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (intention) filter.intentions = intention;
    if (q) {
      filter.$or = [
        { title: new RegExp(String(q), "i") },
        { sku: new RegExp(String(q), "i") },
        { description: new RegExp(String(q), "i") },
        { shortDescription: new RegExp(String(q), "i") },
        { slug: new RegExp(String(q), "i") },
      ];
    }

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 50, 1), 200);

    // Low-stock filter needs computed stock — use aggregation path
    if (lowStock === "true") {
      const pipeline = [
        { $match: filter },
        {
          $addFields: {
            stockTotal: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] },
                { $sum: "$variants.quantity" },
                { $ifNull: ["$quantity", 0] },
              ],
            },
            threshold: { $ifNull: ["$lowStockThreshold", 5] },
          },
        },
        { $match: { $expr: { $lte: ["$stockTotal", "$threshold"] } } },
        { $sort: { updatedAt: -1 } },
        {
          $facet: {
            items: [{ $skip: (pageNum - 1) * limitNum }, { $limit: limitNum }],
            totalCount: [{ $count: "count" }],
          },
        },
      ];
      const [result] = await Product.aggregate(pipeline);
      const items = result?.items || [];
      const total = result?.totalCount?.[0]?.count || 0;
      return res.json({
        success: true,
        data: items,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum) || 1,
        },
      });
    }

    const skip = (pageNum - 1) * limitNum;
    const [items, total] = await Promise.all([
      Product.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limitNum),
      Product.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error("List products error:", error);
    res.status(500).json({ success: false, message: "Failed to load products" });
  }
});

router.post("/", async (req, res) => {
  try {
    const payload = normalizeProductPayload(req.body);
    if (!payload.title) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    const existing = await Product.findOne({ slug: payload.slug });
    if (existing) {
      payload.slug = `${payload.slug}-${Date.now().toString().slice(-4)}`;
    }

    const { actor, actorEmail } = actorFrom(req);
    const product = await Product.create({
      ...payload,
      createdBy: actor,
      updatedBy: actor,
    });

    await writeAudit({
      product,
      action: payload.status === "listed" ? "publish" : "create",
      actor,
      actorEmail,
      changes: payload,
      note: "Product created",
    });

    res.status(201).json({ success: true, data: product, message: "Product created" });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create product" });
  }
});

router.post("/bulk-status", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const status = req.body?.status;
    if (!ids.length || !["listed", "unlisted", "draft"].includes(status)) {
      return res.status(400).json({ success: false, message: "ids and valid status are required" });
    }

    const { actor, actorEmail } = actorFrom(req);
    const result = await Product.updateMany(
      { _id: { $in: ids } },
      { $set: { status, updatedBy: actor } }
    );

    const products = await Product.find({ _id: { $in: ids } });
    await ProductAudit.insertMany(
      products.map((product) => ({
        productId: product._id,
        productTitle: product.title,
        action: status === "listed" ? "bulk_list" : status === "unlisted" ? "bulk_unlist" : "draft",
        actor,
        actorEmail,
        changes: { status },
        note: "Bulk status update",
      }))
    );

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} products to ${status}`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Bulk update failed" });
  }
});

/** Stage product images (multi-select) — returns /uploads/products/... URLs for the form */
router.post("/upload-images", (req, res) => {
  uploadProductImages.array("images", 12)(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).json({
        success: false,
        message: uploadError.message || "Image upload failed",
      });
    }
    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ success: false, message: "Select one or more images" });
      }
      const images = files.map((file, index) => ({
        url: `/uploads/products/${file.filename}`,
        alt: String(req.body?.alt || "").trim() || "Product image",
        isPrimary: index === 0,
      }));
      res.json({
        success: true,
        data: images,
        message: `${images.length} image${images.length === 1 ? "" : "s"} uploaded`,
      });
    } catch (error) {
      console.error("Product image stage upload error:", error);
      res.status(500).json({ success: false, message: error.message || "Image upload failed" });
    }
  });
});

router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    const audits = await ProductAudit.find({ productId: product._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: product, audits });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load product" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const payload = normalizeProductPayload({ ...product.toObject(), ...req.body });
    if (!payload.title) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    const slugOwner = await Product.findOne({ slug: payload.slug, _id: { $ne: product._id } });
    if (slugOwner) {
      return res.status(400).json({ success: false, message: "Slug already in use" });
    }

    const before = product.toObject();
    const { actor, actorEmail } = actorFrom(req);

    Object.assign(product, payload, { updatedBy: actor });
    await product.save();

    const changes = pickChanges(before, product.toObject(), [
      "title",
      "sku",
      "mrp",
      "salePrice",
      "quantity",
      "status",
      "variants",
      "images",
      "intentions",
      "isFeatured",
      "isBestSeller",
      "isNewArrival",
      "linkedRemedyId",
      "linkedRemedyName",
    ]);

    let action = "update";
    if (changes.mrp || changes.salePrice) action = "price_change";
    if (changes.quantity || changes.variants) action = "stock_change";
    if (changes.status) {
      if (payload.status === "listed") action = "list";
      if (payload.status === "unlisted") action = "unlist";
      if (payload.status === "draft") action = "draft";
    }

    await writeAudit({ product, action, actor, actorEmail, changes });
    res.json({ success: true, data: product, message: "Product updated" });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update product" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const status = req.body?.status;
    if (!["draft", "listed", "unlisted"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const { actor, actorEmail } = actorFrom(req);
    const from = product.status;
    product.status = status;
    product.updatedBy = actor;
    await product.save();

    await writeAudit({
      product,
      action: status === "listed" ? "list" : status === "unlisted" ? "unlist" : "draft",
      actor,
      actorEmail,
      changes: { status: { from, to: status } },
    });

    res.json({ success: true, data: product, message: `Product marked as ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
});

router.post("/:id/images", uploadProductImages.array("images", 12), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: "No images uploaded" });
    }

    const { actor, actorEmail } = actorFrom(req);
    const uploaded = files.map((file, index) => ({
      url: `/uploads/products/${file.filename}`,
      alt: product.title,
      isPrimary: product.images.length === 0 && index === 0,
    }));

    product.images.push(...uploaded);
    if (!product.images.some((img) => img.isPrimary) && product.images.length) {
      product.images[0].isPrimary = true;
    }
    product.updatedBy = actor;
    await product.save();

    await writeAudit({
      product,
      action: "image_upload",
      actor,
      actorEmail,
      changes: { uploaded: uploaded.map((item) => item.url) },
    });

    res.json({ success: true, data: product, message: "Images uploaded" });
  } catch (error) {
    console.error("Image upload error:", error);
    res.status(500).json({ success: false, message: error.message || "Image upload failed" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    const { actor, actorEmail } = actorFrom(req);
    await writeAudit({
      product,
      action: "delete",
      actor,
      actorEmail,
      changes: { title: product.title, sku: product.sku },
      note: "Product deleted",
    });
    // Remove product image files from disk + storage mirror
    for (const img of product.images || []) {
      if (img?.url) await deleteUploadByUrl(img.url);
    }
    await product.deleteOne();
    res.json({ success: true, message: "Product deleted" });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ success: false, message: "Failed to delete product" });
  }
});

module.exports = router;
