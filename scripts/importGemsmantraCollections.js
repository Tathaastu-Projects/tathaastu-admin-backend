/**
 * Import products from specific GemsMantra Shopify collections
 * to balance rudraksha / bracelet / jewelry categories for Figma grids.
 *
 * Usage:
 *   node scripts/importGemsmantraCollections.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Product = require("../models/Product");

// Reuse mapping helpers by requiring the main importer logic inline (duplicated lightly)
function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 180);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COLLECTIONS = [
  { handle: "natural-rudraksha", forceCategory: "rudraksha", pages: 3 },
  { handle: "5-mukhi-rudraksha", forceCategory: "rudraksha", pages: 2 },
  { handle: "jewelry", forceCategory: "bracelet", pages: 2 },
  { handle: "rudraksha-bracelet", forceCategory: "bracelet", pages: 2 },
  { handle: "bracelet-mala", forceCategory: "bracelet", pages: 2 },
  { handle: "amethyst", forceCategory: "crystal", pages: 1 },
  { handle: "yantra", forceCategory: "yantra", pages: 1 },
];

function mapIntentions(tags = []) {
  const intentions = new Set();
  const joined = tags.join(" ").toLowerCase();
  if (/wealth|money|dhan|prosperity/.test(joined)) intentions.add("Wealth");
  if (/health|healing|aarogya/.test(joined)) intentions.add("Health");
  if (/protect|evil.?eye|suraksha|nazar/.test(joined)) intentions.add("Protection");
  if (/peace|calm|shanti/.test(joined)) intentions.add("Peace");
  if (/love|relationship|marriage|vivah/.test(joined)) intentions.add("Relationship");
  if (/career|success|business|naukri/.test(joined)) intentions.add("Success");
  if (/spiritual|meditation|devotion|rudraksha/.test(joined)) intentions.add("Spirituality");
  return [...intentions];
}

function extractCarat(title, body) {
  const text = `${title} ${body}`;
  const carat = text.match(/(\d+(?:\.\d+)?)\s*(?:carats?|ct)\b/i);
  const ratti = text.match(/(\d+(?:\.\d+)?)\s*ratti\b/i);
  const weightCarat = carat ? Number(carat[1]) : null;
  let weightRatti = ratti ? Number(ratti[1]) : null;
  if (weightCarat != null && weightRatti == null) {
    weightRatti = Math.round(weightCarat * 1.1 * 100) / 100;
  }
  return { weightCarat, weightRatti };
}

function extractMukhi(tags, title) {
  const hit = [...tags, title].map(String).find((t) => /\b(\d{1,2})\s*-?\s*mukhi\b/i.test(t)) || "";
  const m = String(hit).match(/\b(\d{1,2})\s*-?\s*mukhi\b/i);
  return m ? m[1] : "";
}

function mapProduct(p, forceCategory) {
  const tags = Array.isArray(p.tags)
    ? p.tags
    : String(p.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
  const description = stripHtml(p.body_html);
  const shortDescription = description.slice(0, 180);
  const { weightCarat, weightRatti } = extractCarat(p.title, description);
  const mukhi = extractMukhi(tags, p.title);
  const variants = (p.variants || []).map((v) => ({
    sku: v.sku || "",
    label: v.title && v.title !== "Default Title" ? v.title : "Standard",
    mukhi: mukhi || "",
    material: /silver/i.test(`${p.title} ${tags.join(" ")}`) ? "Silver" : "",
    mrp: Number(v.compare_at_price || v.price || 0),
    salePrice: Number(v.price || 0),
    quantity: v.available === false ? 0 : 8,
    isActive: true,
  }));
  const first = variants[0] || { mrp: 0, salePrice: 0 };
  const mrp = Math.max(...variants.map((v) => v.mrp || 0), first.mrp || 0);
  const salePrice = Math.min(
    ...variants.map((v) => v.salePrice || 0).filter((n) => n > 0),
    first.salePrice || 0
  );
  const images = (p.images || []).slice(0, 8).map((img, index) => ({
    url: img.src,
    alt: p.title,
    isPrimary: index === 0,
  }));
  const handle = p.handle || slugify(p.title);
  return {
    title: p.title,
    slug: slugify(`gm-${handle}`),
    sku: variants.find((v) => v.sku)?.sku || `GM-${p.id}`,
    shortDescription,
    description: description || p.title,
    category: forceCategory || "other",
    images,
    mrp: mrp || salePrice || 0,
    salePrice: salePrice || mrp || 0,
    quantity: variants.reduce((s, v) => s + (v.quantity || 0), 0) || 8,
    variants,
    status: "listed",
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    intentions: mapIntentions(tags),
    attributes: {
      stone: p.product_type || "",
      mukhi,
      face: mukhi ? `${mukhi} Mukhi` : "",
      jewelryType: p.product_type || "",
      material: /silver/i.test(`${p.title} ${tags.join(" ")}`) ? "Silver" : "",
      weight: weightCarat != null ? `${weightCarat} Carat` : "",
      gender: "Unisex",
      origin: forceCategory === "rudraksha" ? "Nepali" : "",
    },
    weightCarat,
    weightRatti,
    tags: tags.map((t) => t.toLowerCase()),
    seo: {
      metaTitle: `${p.title} | Tathaastu`,
      metaDescription: shortDescription || p.title,
    },
    source: {
      provider: "gemsmantra-shopify",
      externalId: String(p.id),
      externalHandle: handle,
    },
    createdBy: "import-collections",
    updatedBy: "import-collections",
  };
}

async function fetchCollectionPage(handle, page, limit = 50) {
  const url = `https://gemsmantra.com/collections/${handle}/products.json?limit=${limit}&page=${page}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "TathaastuImporter/1.0" },
  });
  if (!res.ok) {
    console.warn(`Skip ${handle} page ${page}: HTTP ${res.status}`);
    return [];
  }
  const json = await res.json();
  return json.products || [];
}

async function upsertMapped(mapped) {
  if (!mapped.images.length) return "skipped";
  const existing = await Product.findOne({
    $or: [{ "source.externalId": mapped.source.externalId }, { slug: mapped.slug }],
  });
  if (existing) {
    // Prefer forced category if current is sparse category upgrade
    await Product.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...mapped,
          // keep stronger flags if already enriched
          isFeatured: existing.isFeatured || mapped.isFeatured,
          isBestSeller: existing.isBestSeller || mapped.isBestSeller,
        },
      }
    );
    return "updated";
  }
  await Product.create(mapped);
  return "imported";
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/tathasstu-admin");
  const stats = { imported: 0, updated: 0, skipped: 0 };

  for (const col of COLLECTIONS) {
    console.log(`Collection ${col.handle} (${col.forceCategory})...`);
    for (let page = 1; page <= col.pages; page += 1) {
      const products = await fetchCollectionPage(col.handle, page);
      if (!products.length) break;
      for (const raw of products) {
        try {
          const mapped = mapProduct(raw, col.forceCategory);
          const result = await upsertMapped(mapped);
          stats[result] += 1;
        } catch (err) {
          console.warn("fail", raw.handle, err.message);
          stats.skipped += 1;
        }
      }
    }
  }

  console.log(JSON.stringify(stats, null, 2));
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
