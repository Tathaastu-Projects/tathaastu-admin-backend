/**
 * Orchestrates a fresh local file-DB seed for admin + store:
 * 1) remedies  2) sample products  3) store collections  4) CMS + coupons
 *
 * For a full catalog import, also run:
 *   npm run import:gemsmantra
 *   npm run import:gemsmantra:collections
 */
const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { ensureStorageLayout } = require("../lib/fileDb");
const StoreCollection = require("../models/StoreCollection");
const StoreCoupon = require("../models/StoreCoupon");
const { StoreBanner, StoreBlogPost, StorePage } = require("../models/StoreCms");
const { storeCollectionsSeed } = require("../data/storeCollectionsSeed");

function runNodeScript(relPath) {
  const script = path.join(__dirname, relPath);
  console.log(`\n▶ Running ${relPath}…`);
  const result = spawnSync(process.execPath, [script], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${relPath} failed with exit code ${result.status}`);
  }
}

async function seedStoreExtras() {
  ensureStorageLayout();
  console.log("\n▶ Seeding store collections + CMS…");

  for (const item of storeCollectionsSeed) {
    await StoreCollection.findOneAndUpdate({ slug: item.slug }, item, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  }
  console.log(`  Collections upserted: ${storeCollectionsSeed.length}`);

  const banners = [
    {
      key: "home-hero",
      title: "Authentic Rudraksha & Gemstones",
      subtitle: "Lab-inspired curation for intention-led living",
      imageUrl: "",
      ctaLabel: "Shop Collection",
      ctaHref: "/shop",
      sortOrder: 1,
      isActive: true,
    },
    {
      key: "home-promo",
      title: "Shop by Intention",
      subtitle: "Wealth · Peace · Protection · Health",
      ctaLabel: "Explore",
      ctaHref: "/intention/Wealth",
      sortOrder: 2,
      isActive: true,
    },
  ];
  for (const b of banners) {
    await StoreBanner.findOneAndUpdate({ key: b.key, title: b.title }, b, { upsert: true });
  }

  await StoreBlogPost.findOneAndUpdate(
    { slug: "how-to-choose-rudraksha" },
    {
      title: "How to Choose the Right Rudraksha",
      slug: "how-to-choose-rudraksha",
      excerpt: "A simple guide to mukhi, intention and daily wear.",
      content:
        "Start with your intention — peace, protection, wealth or health — then match mukhi guidance and consult an expert when unsure.",
      coverImage: "",
      tags: ["rudraksha", "guide"],
      status: "published",
      publishedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  for (const page of [
    {
      slug: "shipping-policy",
      title: "Shipping Policy",
      content: "Orders are typically dispatched within 48 hours across India. COD available on eligible orders.",
    },
    {
      slug: "refund-policy",
      title: "Refund Policy",
      content: "Reach support within 7 days for eligible returns as per product condition guidelines.",
    },
    {
      slug: "privacy-policy",
      title: "Privacy Policy",
      content: "We use your contact details only to fulfill orders and support requests.",
    },
  ]) {
    await StorePage.findOneAndUpdate(
      { slug: page.slug },
      { ...page, isActive: true },
      { upsert: true }
    );
  }

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
  await StoreCoupon.findOneAndUpdate(
    { code: "FLAT200" },
    {
      code: "FLAT200",
      description: "Flat ₹200 off",
      type: "flat",
      value: 200,
      minOrderAmount: 1499,
      isActive: true,
    },
    { upsert: true }
  );

  console.log("  CMS banners, blog, pages, coupons upserted into storage/data/");
}

async function main() {
  ensureStorageLayout();
  runNodeScript("seedRemedies.js");
  runNodeScript("seedProducts.js");
  await seedStoreExtras();
  console.log("\n✅ Seed complete. Storefront should load catalog + home CMS from file storage.");
  console.log("   Optional full import: npm run import:gemsmantra");
  console.log("   Upload product/banner images via Admin Panel — they save under uploads/ + storage/images/");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
