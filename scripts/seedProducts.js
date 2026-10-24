const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { ensureStorageLayout } = require("../lib/fileDb");
const Product = require("../models/Product");
const ProductAudit = require("../models/ProductAudit");
const Remedy = require("../models/Remedy");

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function seed() {
  ensureStorageLayout();

  const fiveMukhi = await Remedy.findOne({ slug: "rudraksha-5-mukhi" }).lean();
  const amethyst = await Remedy.findOne({ name: /amethyst/i }).lean();
  const citrine = await Remedy.findOne({ name: /citrine/i }).lean();

  const samples = [
    {
      title: "5 Mukhi Rudraksha Pendant",
      sku: "RDK-5M-001",
      category: "rudraksha",
      shortDescription: "Classic 5 Mukhi Rudraksha for peace, balance and wellbeing.",
      description:
        "Lab-inspired spiritual pendant crafted for daily wear. Ideal for blood pressure balance, calm mind and overall protection as per rudraksha guidance.",
      mrp: 2499,
      salePrice: 1999,
      quantity: 25,
      status: "listed",
      isFeatured: true,
      isBestSeller: true,
      isNewArrival: true,
      intentions: ["Peace", "Health", "Protection"],
      attributes: { face: "5 Mukhi", shape: "Round", gender: "Unisex", occasion: "Daily Wear" },
      variants: [
        {
          sku: "RDK-5M-001-PLN",
          label: "Plain Bead",
          mukhi: "5",
          material: "Natural",
          mrp: 2499,
          salePrice: 1999,
          quantity: 15,
        },
        {
          sku: "RDK-5M-001-SLV",
          label: "Silver Capped",
          mukhi: "5",
          material: "Silver",
          mrp: 3499,
          salePrice: 2999,
          quantity: 10,
        },
      ],
      images: [
        {
          url: "",
          alt: "5 Mukhi Rudraksha",
          isPrimary: true,
        },
      ],
      linkedRemedyId: fiveMukhi?._id || null,
      linkedRemedyName: fiveMukhi?.name || "5 Mukhi Rudraksha",
      seo: {
        metaTitle: "Buy 5 Mukhi Rudraksha Pendant | Tathaastu",
        metaDescription: "Shop authentic 5 Mukhi Rudraksha for peace, health and protection.",
      },
    },
    {
      title: "Amethyst Healing Crystal",
      sku: "CRY-AME-001",
      category: "crystal",
      shortDescription: "Calming amethyst for stress relief, sleep and spiritual clarity.",
      description: "Natural amethyst crystal piece for meditation spaces, pillows and desks.",
      mrp: 1499,
      salePrice: 1199,
      quantity: 40,
      status: "listed",
      isFeatured: true,
      isBestSeller: false,
      isNewArrival: true,
      intentions: ["Peace", "Spirituality", "Health"],
      attributes: { stone: "Amethyst", shape: "Tumble", color: "Purple", gender: "Unisex" },
      variants: [
        { sku: "CRY-AME-S", label: "Small", size: "S", weight: "20-30g", mrp: 999, salePrice: 799, quantity: 20 },
        { sku: "CRY-AME-M", label: "Medium", size: "M", weight: "40-60g", mrp: 1499, salePrice: 1199, quantity: 20 },
      ],
      images: [
        {
          url: "",
          alt: "Amethyst crystal",
          isPrimary: true,
        },
      ],
      linkedRemedyId: amethyst?._id || null,
      linkedRemedyName: amethyst?.name || "Amethyst",
    },
    {
      title: "Citrine Wealth Stone Bracelet",
      sku: "BRC-CIT-001",
      category: "bracelet",
      shortDescription: "Citrine bracelet for abundance, confidence and money flow.",
      description: "Hand-strung citrine bracelet for wealth intention rituals and everyday wear.",
      mrp: 1799,
      salePrice: 1399,
      quantity: 18,
      status: "draft",
      isFeatured: false,
      isBestSeller: false,
      isNewArrival: true,
      intentions: ["Wealth", "Success"],
      attributes: { stone: "Citrine", shape: "Beaded", gender: "Unisex", occasion: "Gift" },
      variants: [],
      images: [
        {
          url: "",
          alt: "Citrine bracelet",
          isPrimary: true,
        },
      ],
      linkedRemedyId: citrine?._id || null,
      linkedRemedyName: citrine?.name || "Citrine",
    },
    {
      title: "Black Tourmaline Protection Stone",
      sku: "STN-TOU-001",
      category: "stone",
      shortDescription: "Grounding protection stone against negativity and stress.",
      description: "Raw/tumbled black tourmaline for aura protection and calm focus.",
      mrp: 999,
      salePrice: 799,
      quantity: 4,
      lowStockThreshold: 5,
      status: "listed",
      isFeatured: false,
      isBestSeller: true,
      isNewArrival: false,
      intentions: ["Protection", "Peace"],
      attributes: { stone: "Black Tourmaline", color: "Black", shape: "Raw", gender: "Unisex" },
      images: [
        {
          url: "",
          alt: "Black tourmaline",
          isPrimary: true,
        },
      ],
    },
    {
      title: "Shree Yantra Frame",
      sku: "YAN-SHREE-001",
      category: "yantra",
      shortDescription: "Sacred Shree Yantra for prosperity and divine blessings.",
      description: "Premium framed Shree Yantra for home temple and office altar.",
      mrp: 4999,
      salePrice: 3999,
      quantity: 12,
      status: "unlisted",
      isFeatured: true,
      isBestSeller: false,
      isNewArrival: true,
      intentions: ["Wealth", "Spirituality", "Success"],
      attributes: { occasion: "Home Temple", shape: "Framed", gender: "Unisex" },
      images: [
        {
          url: "",
          alt: "Shree Yantra",
          isPrimary: true,
        },
      ],
    },
  ].map((item) => ({
    ...item,
    slug: slugify(item.title),
    createdBy: "Seed Script",
    updatedBy: "Seed Script",
    seo: item.seo || {
      metaTitle: `${item.title} | Tathaastu`,
      metaDescription: item.shortDescription,
    },
  }));

  await Product.deleteMany({});
  const created = await Product.insertMany(samples);
  await ProductAudit.deleteMany({});
  await ProductAudit.insertMany(
    created.map((product) => ({
      productId: product._id,
      productTitle: product.title,
      action: "create",
      actor: "Seed Script",
      changes: { status: product.status },
      note: "Sample product seeded",
    }))
  );

  console.log(`✅ Seeded ${created.length} products into storage/data/products.json`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
