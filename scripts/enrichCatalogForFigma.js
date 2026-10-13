/**
 * Enrich catalog so Figma homepage / PLP / PDP look filled:
 * - intentions on every listed product
 * - ratings
 * - featured / bestseller / new flags in healthy counts
 * - color, shape, origin, zodiac, material attributes
 * - ensure MRP > sale for discount badges
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Product = require("../models/Product");
const StoreReview = require("../models/StoreReview");
const { StoreBanner, StoreBlogPost, StorePage } = require("../models/StoreCms");
const StoreCoupon = require("../models/StoreCoupon");

const INTENTIONS = ["Peace", "Wealth", "Health", "Protection", "Relationship", "Success", "Spirituality"];
const ZODIAC = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];
const ORIGINS = ["Ceylon", "Bangkok", "African", "Australian", "Madagascar", "Mozambique", "Nepali", "Indonesian", "Indian"];
const COLORS = ["Red", "Yellow", "Green", "Blue", "White", "Purple", "Black", "Orange", "Pink", "Brown"];
const SHAPES = ["Oval", "Round", "Pear", "Cushion", "Square", "Trillion", "Raw", "Tumble"];

function pick(arr, i) {
  return arr[i % arr.length];
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i += 1) h = (h * 31 + String(s).charCodeAt(i)) >>> 0;
  return h;
}

function inferIntentions(product) {
  const tags = (product.tags || []).join(" ").toLowerCase();
  const title = `${product.title} ${product.category} ${tags}`.toLowerCase();
  const set = new Set(product.intentions || []);
  if (/wealth|money|citrine|pyrite|7 mukhi|lakshmi/.test(title)) set.add("Wealth");
  if (/peace|calm|amethyst|5 mukhi|shanti/.test(title)) set.add("Peace");
  if (/health|heal|emerald|panna|coral/.test(title)) set.add("Health");
  if (/protect|evil|tourmaline|black|neelam|sapphire/.test(title)) set.add("Protection");
  if (/love|relationship|rose|moonstone|pearl/.test(title)) set.add("Relationship");
  if (/career|success|ruby|manik|6 mukhi|12 mukhi/.test(title)) set.add("Success");
  if (/spiritual|yantra|rudraksha|mala|meditation/.test(title)) set.add("Spirituality");
  if (set.size === 0) {
    const h = hashStr(product._id || product.slug || product.title);
    set.add(pick(INTENTIONS, h));
    set.add(pick(INTENTIONS, h + 3));
  }
  return [...set].filter((i) => INTENTIONS.includes(i)).slice(0, 4);
}

function inferColor(product) {
  const t = `${product.title} ${product.attributes?.stone || ""} ${(product.tags || []).join(" ")}`.toLowerCase();
  if (/ruby|coral|manik|red/.test(t)) return "Red";
  if (/pukhraj|yellow|citrine|heliodor/.test(t)) return "Yellow";
  if (/emerald|panna|peridot|green/.test(t)) return "Green";
  if (/neelam|sapphire|blue|lapis|iolite/.test(t)) return "Blue";
  if (/pearl|moonstone|white|diamond|moissanite/.test(t)) return "White";
  if (/amethyst|purple/.test(t)) return "Purple";
  if (/black|tourmaline|obsidian|onyx/.test(t)) return "Black";
  if (/opal|pink|rose/.test(t)) return "Pink";
  if (/gomed|hessonite|brown|tiger/.test(t)) return "Brown";
  if (/orange|carnelian|sunela/.test(t)) return "Orange";
  return pick(COLORS, hashStr(product.slug || product.title));
}

function inferOrigin(product) {
  const t = `${product.title} ${(product.tags || []).join(" ")}`.toLowerCase();
  if (/ceylon|sri.?lanka/.test(t)) return "Ceylon";
  if (/bangkok|thai/.test(t)) return "Bangkok";
  if (/africa|african|mozambique|madagascar/.test(t)) return "African";
  if (/australia/.test(t)) return "Australian";
  if (/nepal|nepali/.test(t)) return "Nepali";
  if (/java|indonesia/.test(t)) return "Indonesian";
  if (product.category === "rudraksha") return pick(["Nepali", "Indonesian"], hashStr(product.slug));
  return pick(ORIGINS, hashStr(product.slug || product.title));
}

function inferZodiac(product) {
  if (product.attributes?.zodiac) return product.attributes.zodiac;
  return pick(ZODIAC, hashStr(product.slug || product.title));
}

function inferShape(product) {
  if (product.attributes?.shape) return product.attributes.shape;
  const t = `${product.title}`.toLowerCase();
  if (/oval/.test(t)) return "Oval";
  if (/round/.test(t)) return "Round";
  if (/pear/.test(t)) return "Pear";
  if (/cushion/.test(t)) return "Cushion";
  if (/raw/.test(t)) return "Raw";
  return pick(SHAPES, hashStr(product.slug || product.title));
}

async function seedHomeContent() {
  const banners = [
    {
      key: "home-hero",
      title: "Authentic Rudraksha & Gemstones",
      subtitle: "Lab-inspired curation for intention-led living. Shop certified spiritual essentials.",
      imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1600",
      ctaLabel: "Shop now",
      ctaHref: "/shop",
      sortOrder: 1,
      isActive: true,
    },
    {
      key: "home-hero-secondary",
      title: "Is Your Home Blocking Positive Energy?",
      subtitle: "Discover puja essentials, rudraksha and gemstones chosen for balance and protection.",
      imageUrl: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=1600",
      ctaLabel: "Explore collections",
      ctaHref: "/collections/all",
      sortOrder: 2,
      isActive: true,
    },
    {
      key: "consult",
      title: "Not sure what to buy? Talk to our experts",
      subtitle: "Get a free recommendation aligned to your intention or birth chart.",
      imageUrl: "",
      ctaLabel: "Consult Now",
      ctaHref: "/contact",
      sortOrder: 10,
      isActive: true,
    },
  ];
  for (const b of banners) {
    await StoreBanner.findOneAndUpdate({ key: b.key }, b, { upsert: true, new: true });
  }

  const blogs = [
    {
      slug: "how-to-choose-rudraksha",
      title: "How to Choose the Right Rudraksha",
      excerpt: "Match mukhi and intention — a simple starter guide for first-time buyers.",
      content:
        "Begin with your intention (peace, protection, wealth), then explore mukhi guidance. Prefer certified beads and consult an expert when unsure.",
      coverImage: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=1200",
      tags: ["rudraksha", "guide"],
      status: "published",
      publishedAt: new Date(),
    },
    {
      slug: "gemstone-wearing-guide",
      title: "Gemstone Wearing Guide",
      excerpt: "Metal, finger and day of week tips for planetary gemstones.",
      content:
        "Traditional Vedic practice pairs each gemstone with a planet, metal and finger. Always verify authenticity and energization before regular wear.",
      coverImage: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1200",
      tags: ["gemstone", "guide"],
      status: "published",
      publishedAt: new Date(),
    },
    {
      slug: "shop-by-intention",
      title: "Shop by Intention: A Calm Way to Browse",
      excerpt: "Why intention tags help you find spiritual products faster.",
      content:
        "Instead of endless scrolling, filter by Peace, Wealth, Protection and more — every Tathaastu listed product can carry intention tags.",
      coverImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200",
      tags: ["intention", "shopping"],
      status: "published",
      publishedAt: new Date(),
    },
  ];
  for (const post of blogs) {
    await StoreBlogPost.findOneAndUpdate({ slug: post.slug }, post, { upsert: true, new: true });
  }

  await StorePage.findOneAndUpdate(
    { slug: "home-faq" },
    {
      title: "Frequently Asked Questions",
      slug: "home-faq",
      isActive: true,
      content: JSON.stringify([
        {
          question: "Are your products authentic?",
          answer:
            "Yes. Listed products are curated for authenticity. Certificates are provided where applicable for gemstones and related items.",
        },
        {
          question: "Do you offer Cash on Delivery?",
          answer: "Yes, COD is available on eligible orders across India.",
        },
        {
          question: "How fast is shipping?",
          answer: "Orders are typically dispatched within 48 hours and delivered in 3–7 business days.",
        },
        {
          question: "Can I get a recommendation?",
          answer: "Yes. Use Shop by Intention or request a consultation from the homepage banner.",
        },
        {
          question: "What is your return policy?",
          answer: "Reach support within 7 days for eligible returns as per product condition guidelines.",
        },
      ]),
      seo: { metaTitle: "FAQ | Tathaastu", metaDescription: "Common questions about authenticity, shipping and COD." },
    },
    { upsert: true, new: true }
  );

  await StoreCoupon.findOneAndUpdate(
    { code: "WELCOME10" },
    {
      code: "WELCOME10",
      description: "10% off for new shoppers",
      type: "percent",
      value: 10,
      minOrderAmount: 999,
      maxDiscount: 500,
      isActive: true,
    },
    { upsert: true }
  );
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/tathasstu-admin");
  console.log("Enriching catalog for Figma-filled storefront...");

  const products = await Product.find({ status: "listed" });
  console.log(`Listed products: ${products.length}`);

  // Sort for stable flag assignment
  products.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));

  let updated = 0;
  for (let i = 0; i < products.length; i += 1) {
    const p = products[i];
    const h = hashStr(p.slug || p.title);

    p.intentions = inferIntentions(p);
    p.attributes = p.attributes || {};
    p.attributes.color = p.attributes.color || inferColor(p);
    p.attributes.shape = p.attributes.shape || inferShape(p);
    p.attributes.origin = p.attributes.origin || inferOrigin(p);
    p.attributes.zodiac = p.attributes.zodiac || inferZodiac(p);
    if (!p.attributes.material) {
      const t = `${p.title} ${(p.tags || []).join(" ")}`.toLowerCase();
      p.attributes.material = /silver|925/.test(t)
        ? "Silver"
        : /gold/.test(t)
          ? "Gold"
          : /panchdhatu/.test(t)
            ? "Panchdhatu"
            : p.category === "rudraksha"
              ? "Natural"
              : "";
    }
    if (!p.attributes.stone && p.category === "gemstone") {
      p.attributes.stone = p.attributes.stone || String(p.title).split("-")[0].trim().slice(0, 40);
    }
    if (!p.attributes.mukhi && p.category === "rudraksha") {
      const m = String(p.title).match(/(\d{1,2})\s*mukhi/i);
      if (m) {
        p.attributes.mukhi = m[1];
        p.attributes.face = `${m[1]} Mukhi`;
      }
    }

    // Discount badge: ensure mrp > sale when sale exists
    if (p.salePrice > 0 && (!p.mrp || p.mrp <= p.salePrice)) {
      p.mrp = Math.round(p.salePrice * (1.15 + (h % 20) / 100));
    }
    if (Array.isArray(p.variants)) {
      p.variants.forEach((v) => {
        if (v.salePrice > 0 && (!v.mrp || v.mrp <= v.salePrice)) {
          v.mrp = Math.round(v.salePrice * 1.2);
        }
      });
    }

    // Ratings for cards
    p.ratingAvg = Number((3.8 + (h % 13) / 10).toFixed(1)); // 3.8–5.0
    p.ratingCount = 12 + (h % 180);

    // Flags — enough for carousels
    p.isFeatured = i < 28 || Boolean(p.isFeatured);
    p.isBestSeller = i % 5 === 0 || i < 24 || Boolean(p.isBestSeller);
    // Keep new arrivals bounded so homepage carousel is distinct
    p.isNewArrival = i < 48;

    p.updatedBy = "enrich-figma";
    await p.save();
    updated += 1;
  }

  // Seed a handful of real review docs for PDP sections
  const reviewTargets = products.slice(0, 40);
  let reviewsCreated = 0;
  for (const p of reviewTargets) {
    const existing = await StoreReview.countDocuments({ productId: p._id });
    if (existing > 0) continue;
    const count = 2 + (hashStr(p.slug) % 3);
    for (let r = 0; r < count; r += 1) {
      await StoreReview.create({
        productId: p._id,
        productSlug: p.slug,
        name: pick(["Ananya", "Rahul", "Priya", "Vikram", "Sneha", "Amit"], hashStr(p.slug) + r),
        email: `devotee${hashStr(p.slug) + r}@example.com`,
        rating: 4 + ((hashStr(p.slug) + r) % 2),
        title: pick(["Beautiful quality", "As described", "Felt blessed", "Fast delivery"], r),
        body: "Quality looks genuine and packaging was careful. Would recommend for daily wear.",
        status: "approved",
      });
      reviewsCreated += 1;
    }
  }

  await seedHomeContent();

  const summary = {
    updated,
    reviewsCreated,
    listed: await Product.countDocuments({ status: "listed" }),
    featured: await Product.countDocuments({ status: "listed", isFeatured: true }),
    bestSeller: await Product.countDocuments({ status: "listed", isBestSeller: true }),
    newArrival: await Product.countDocuments({ status: "listed", isNewArrival: true }),
    withIntentions: await Product.countDocuments({
      status: "listed",
      intentions: { $exists: true, $not: { $size: 0 } },
    }),
    withRating: await Product.countDocuments({ status: "listed", ratingCount: { $gt: 0 } }),
    byCategory: await Product.aggregate([
      { $match: { status: "listed" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  };
  console.log(JSON.stringify(summary, null, 2));
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
