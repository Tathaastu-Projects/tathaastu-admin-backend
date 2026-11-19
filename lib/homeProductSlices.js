/**
 * Build homepage product slices from listed products in ONE pass.
 * Avoids Product.find({ status: "listed" }) dumping every field into the home payload path.
 */

const { slimCardProduct, slimCardProducts } = require("./slimProduct");
const { CATEGORIES, INTENTIONS } = require("./storeCatalog");

const RASHI_RE =
  /राशि|rashi|mesh|vrishabha|mithun|karka|simha|kanya|tula|vrishchik|dhanu|makar|kumbh|meen|aries|taurus|gemini|cancer|\bleo\b|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces|मेष|वृषभ|मिथुन|कर्क|सिंह|कन्या|तुला|वृश्चिक|धनु|मकर|कुम्भ|मीन/i;

function isRashiProduct(product) {
  const title = String(product.title || "");
  const zodiac = String(product.attributes?.zodiac || "");
  const tags = Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || "");
  const category = String(product.category || "");
  return (
    RASHI_RE.test(title) ||
    RASHI_RE.test(zodiac) ||
    /rashi|zodiac/i.test(tags) ||
    /rashi/i.test(category)
  );
}

function sortNewest(a, b) {
  const at = new Date(a.createdAt || 0).getTime();
  const bt = new Date(b.createdAt || 0).getTime();
  return bt - at;
}

/**
 * @param {object[]} listedProducts read-only listed products (newest-first preferred)
 * @param {{ categoryLabel?: (id: string) => string }} [opts]
 */
function buildHomeProductSlices(listedProducts, opts = {}) {
  const listed = Array.isArray(listedProducts) ? listedProducts.slice().sort(sortNewest) : [];

  const countMap = {};
  const sampleByCategory = {};
  const intentionProducts = {};
  const rashiRaw = [];
  const featuredRaw = [];
  const bestsellersRaw = [];
  const newArrivalsRaw = [];

  const intentionNeeded = new Set(INTENTIONS);

  for (const product of listed) {
    const cat = product.category || "other";
    countMap[cat] = (countMap[cat] || 0) + 1;
    if (!sampleByCategory[cat]) sampleByCategory[cat] = product;

    if (intentionNeeded.size && Array.isArray(product.intentions)) {
      for (const intention of product.intentions) {
        if (intentionNeeded.has(intention) && !intentionProducts[intention]) {
          intentionProducts[intention] = slimCardProduct(product);
          intentionNeeded.delete(intention);
        }
      }
    }

    if (rashiRaw.length < 12 && isRashiProduct(product)) {
      rashiRaw.push(product);
    }
    if (product.isFeatured && featuredRaw.length < 16) featuredRaw.push(product);
    if (product.isBestSeller && bestsellersRaw.length < 10) bestsellersRaw.push(product);
    if (product.isNewArrival && newArrivalsRaw.length < 16) newArrivalsRaw.push(product);
  }

  const latestProducts = slimCardProducts(listed.slice(0, 20));
  const featured = slimCardProducts(featuredRaw);
  const bestsellers = slimCardProducts(bestsellersRaw);
  const newArrivals = slimCardProducts(newArrivalsRaw);
  const rashiProducts = slimCardProducts(rashiRaw);

  const categoryCards = CATEGORIES.map((cat) => {
    const sample = sampleByCategory[cat];
    const label =
      (opts.categoryLabel && opts.categoryLabel(cat)) ||
      cat
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    return {
      id: cat,
      label,
      href: `/shop/${cat}`,
      productCount: countMap[cat] || 0,
      image:
        sample?.images?.find((i) => i.isPrimary)?.url ||
        sample?.images?.[0]?.url ||
        "",
    };
  });

  return {
    intentionProducts,
    rashiProducts,
    latestProducts,
    categoryCards,
    countMap,
    carousels: {
      featured: featured.length ? featured : latestProducts.slice(0, 16),
      bestsellers: bestsellers.length ? bestsellers : latestProducts.slice(0, 10),
      newArrivals: newArrivals.length ? newArrivals : latestProducts.slice(0, 16),
    },
    listedCount: listed.length,
  };
}

module.exports = {
  buildHomeProductSlices,
  isRashiProduct,
};
