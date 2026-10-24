/**
 * Import a sample of GemsMantra (Shopify) products into local MongoDB.
 * Temporary catalog filler until Tathaastu product data is ready.
 *
 * Usage:
 *   node scripts/importGemsmantraProducts.js
 *   node scripts/importGemsmantraProducts.js --pages=3 --limit=50
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { ensureStorageLayout } = require("../lib/fileDb");
ensureStorageLayout();
const Product = require("../models/Product");

const CATEGORIES = new Set([
  "rudraksha",
  "crystal",
  "stone",
  "gemstone",
  "yantra",
  "bracelet",
  "combo",
  "other",
]);

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

function parseArgs(argv) {
  const out = { pages: 4, limit: 50 };
  for (const arg of argv) {
    if (arg.startsWith("--pages=")) out.pages = Math.max(1, Number(arg.split("=")[1]) || 4);
    if (arg.startsWith("--limit=")) out.limit = Math.min(250, Math.max(1, Number(arg.split("=")[1]) || 50));
  }
  return out;
}

function mapCategory(product) {
  const type = String(product.product_type || "").toLowerCase();
  const tags = (product.tags || []).map((t) => String(t).toLowerCase());
  const hay = `${type} ${tags.join(" ")}`;

  if (/rudraksha/.test(hay)) return "rudraksha";
  if (/yantra/.test(hay)) return "yantra";
  if (/bracelet|mala|kantha/.test(hay)) return "bracelet";
  if (/crystal|amethyst|citrine|tiger|lapis|obsidian/.test(hay)) return "crystal";
  if (/jewellery|jewelry|pendant|ring|anklet|earring/.test(hay)) return "bracelet";
  if (/combo|kavach/.test(hay)) return "combo";
  if (/gemstone|sapphire|ruby|emerald|coral|pearl|pukhraj|neelam|panna|manik|gomed|hessonite|opal|stone/.test(hay)) {
    return "gemstone";
  }
  return "other";
}

function mapIntentions(tags = []) {
  const intentions = new Set();
  const joined = tags.join(" ").toLowerCase();
  if (/wealth|money|dhan|prosperity/.test(joined)) intentions.add("Wealth");
  if (/health|healing|aarogya/.test(joined)) intentions.add("Health");
  if (/protect|evil.?eye|suraksha|nazar/.test(joined)) intentions.add("Protection");
  if (/peace|calm|shanti/.test(joined)) intentions.add("Peace");
  if (/love|relationship|marriage|vivah/.test(joined)) intentions.add("Relationship");
  if (/career|success|business|naukri/.test(joined)) intentions.add("Success");
  if (/spiritual|meditation|devotion/.test(joined)) intentions.add("Spirituality");
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
  const hit =
    [...tags, title].map(String).find((t) => /\b(\d{1,2})\s*-?\s*mukhi\b/i.test(t)) || "";
  const m = String(hit).match(/\b(\d{1,2})\s*-?\s*mukhi\b/i);
  return m ? m[1] : "";
}

function mapProduct(p) {
  const tags = Array.isArray(p.tags)
    ? p.tags
    : String(p.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

  const category = mapCategory({ ...p, tags });
  const description = stripHtml(p.body_html);
  const shortDescription = description.slice(0, 180);
  const { weightCarat, weightRatti } = extractCarat(p.title, description);
  const mukhi = extractMukhi(tags, p.title);

  const variants = (p.variants || []).map((v) => ({
    sku: v.sku || "",
    label: v.title && v.title !== "Default Title" ? v.title : "Standard",
    mukhi: mukhi || "",
    material: /silver/i.test(`${p.title} ${tags.join(" ")}`) ? "Silver" : "",
    color: "",
    mrp: Number(v.compare_at_price || v.price || 0),
    salePrice: Number(v.price || 0),
    quantity: v.available === false ? 0 : 5,
    isActive: true,
  }));

  const first = variants[0] || { mrp: 0, salePrice: 0, quantity: 0 };
  const mrp = Math.max(...variants.map((v) => v.mrp || 0), first.mrp || 0);
  const salePrice = Math.min(...variants.map((v) => v.salePrice || 0).filter((n) => n > 0), first.salePrice || 0);

  const images = (p.images || []).slice(0, 8).map((img, index) => ({
    url: img.src,
    alt: p.title,
    isPrimary: index === 0,
  }));

  const handle = p.handle || slugify(p.title);
  const slug = slugify(`gm-${handle}`);

  return {
    title: p.title,
    slug,
    sku: variants.find((v) => v.sku)?.sku || `GM-${p.id}`,
    shortDescription,
    description: description || p.title,
    category: CATEGORIES.has(category) ? category : "other",
    images,
    mrp: mrp || salePrice || 0,
    salePrice: salePrice || mrp || 0,
    quantity: variants.reduce((s, v) => s + (v.quantity || 0), 0) || 5,
    variants: variants.length > 1 || (variants[0] && variants[0].label !== "Standard") ? variants : variants,
    status: "listed",
    isFeatured: tags.some((t) => /bestseller|top|featured/i.test(t)),
    isBestSeller: tags.some((t) => /bestseller|top/i.test(t)),
    isNewArrival: true,
    intentions: mapIntentions(tags),
    attributes: {
      stone: p.product_type || "",
      mukhi,
      face: mukhi ? `${mukhi} Mukhi` : "",
      jewelryType: /pendant|ring|bracelet|mala|anklet/i.test(p.product_type || "")
        ? p.product_type
        : "",
      material: /silver/i.test(`${p.title} ${tags.join(" ")}`) ? "Silver" : "",
      weight: weightCarat != null ? `${weightCarat} Carat` : "",
      gender: /kids|women|men|unisex/i.test(tags.join(" ")) ? "Unisex" : "",
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
    createdBy: "import-gemsmantra",
    updatedBy: "import-gemsmantra",
  };
}

async function fetchPage(page, limit) {
  const url = `https://gemsmantra.com/products.json?limit=${limit}&page=${page}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "TathaastuImporter/1.0" },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  const json = await res.json();
  return json.products || [];
}

async function main() {
  const { pages, limit } = parseArgs(process.argv.slice(2));
    console.log(`Importing up to ${pages} page(s) × ${limit} from GemsMantra...`);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (let page = 1; page <= pages; page += 1) {
    const products = await fetchPage(page, limit);
    if (!products.length) break;
    console.log(`Page ${page}: ${products.length} products`);

    for (const raw of products) {
      const mapped = mapProduct(raw);
      if (!mapped.images.length) {
        skipped += 1;
        continue;
      }

      const existing = await Product.findOne({
        $or: [
          { "source.externalId": mapped.source.externalId },
          { slug: mapped.slug },
        ],
      });

      if (existing) {
        await Product.updateOne({ _id: existing._id }, { $set: mapped });
        updated += 1;
      } else {
        try {
          await Product.create(mapped);
          imported += 1;
        } catch (err) {
          if (err.code === 11000) {
            skipped += 1;
          } else {
            console.error("Failed:", mapped.slug, err.message);
            skipped += 1;
          }
        }
      }
    }
  }

  console.log(JSON.stringify({ imported, updated, skipped }, null, 2));
  }

main().catch(async (err) => {
  console.error(err);
  try {
      } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
