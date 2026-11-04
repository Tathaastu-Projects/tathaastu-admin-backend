/**
 * 3D remedies explorer prices — editable from Admin → Home Page → 3D prices.
 * Stored in store_pages as slug "site-3d-prices".
 */

const SITE_3D_PRICES_SLUG = "site-3d-prices";

/** Seed from public/3d/Models/*.json (price fields only). */
const DEFAULT_3D_PRODUCTS = [
  {
    id: "dhanyog",
    name: "Dhanyog",
    title: "Dhan Yog Prosperity Bracelet",
    category: "Gemstones",
    sku: "GM_DYN_770",
    price: "₹2,499",
    originalPrice: "₹4,999",
    offer: "50% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "aries",
    name: "Aries",
    title: "Aries",
    category: "Gemstones",
    price: "₹1,499",
    originalPrice: "₹1,999",
    offer: "25% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "taurus-placeholder",
    name: "Taurus",
    title: "Taurus",
    category: "Gemstones",
    price: "₹1,599",
    originalPrice: "₹2,499",
    offer: "36% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "gemini-placeholder",
    name: "Gemini",
    title: "Gemini",
    category: "Gemstones",
    price: "₹1,399",
    originalPrice: "₹1,999",
    offer: "30% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "cancer-placeholder",
    name: "Cancer",
    title: "Cancer",
    category: "Gemstones",
    price: "₹1,699",
    originalPrice: "₹2,299",
    offer: "26% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "leo",
    name: "Leo",
    title: "Leo",
    category: "Gemstones",
    price: "₹1,899",
    originalPrice: "₹2,999",
    offer: "37% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "virgo-placeholder",
    name: "Virgo",
    title: "Virgo",
    category: "Gemstones",
    price: "₹1,449",
    originalPrice: "₹1,999",
    offer: "28% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "libra-placeholder",
    name: "Libra",
    title: "Libra",
    category: "Gemstones",
    price: "₹1,549",
    originalPrice: "₹2,199",
    offer: "30% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "scorpio-placeholder",
    name: "Scorpio",
    title: "Scorpio",
    category: "Gemstones",
    price: "₹1,799",
    originalPrice: "₹2,499",
    offer: "28% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "sagittarius-placeholder",
    name: "Sagittarius",
    title: "Sagittarius",
    category: "Gemstones",
    price: "₹1,649",
    originalPrice: "₹2,399",
    offer: "31% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "capricorn-placeholder",
    name: "Capricorn",
    title: "Capricorn",
    category: "Gemstones",
    price: "₹1,749",
    originalPrice: "₹2,699",
    offer: "35% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "pisces-placeholder",
    name: "Pisces",
    title: "Pisces",
    category: "Gemstones",
    price: "₹1,349",
    originalPrice: "₹1,899",
    offer: "29% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "citrine",
    name: "Citrine",
    title: "Citrine",
    category: "Crystals",
    price: "₹1,999",
    originalPrice: "₹2,799",
    offer: "29% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "rudraksha-placeholder",
    name: "Rudraksha",
    title: "Rudraksha",
    category: "Rudraksha",
    price: "₹999",
    originalPrice: "₹1,499",
    offer: "33% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "chakra-mix-placeholder",
    name: "Chakra mix",
    title: "Chakra mix",
    category: "Gemstones",
    price: "₹1,199",
    originalPrice: "₹1,799",
    offer: "33% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "turquoise-placeholder",
    name: "Turquoise",
    title: "Turquoise",
    category: "Gemstones",
    price: "₹1,849",
    originalPrice: "₹2,399",
    offer: "23% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "green-aventurine",
    name: "Green Aventurine",
    title: "Green Aventurine",
    category: "Gemstones",
    price: "₹1,299",
    originalPrice: "₹1,699",
    offer: "24% off",
    buyLabel: "Order Energized Bracelet",
  },
  {
    id: "money-magnet-pyramid",
    name: "Money Magnet Pyramid",
    title: "Money Magnet Pyramid",
    category: "Vastu",
    price: "₹2,199",
    originalPrice: "₹3,499",
    offer: "37% off",
    buyLabel: "Order Energized Pyramid",
  },
  {
    id: "4-mukhi-indonesia",
    name: "4 Mukhi Indonesia",
    title: "4 Mukhi Indonesia",
    category: "Rudraksha",
    price: "₹599",
    originalPrice: "₹799",
    offer: "25% off",
    buyLabel: "Order Energized Rudraksha",
  },
  {
    id: "4-mukhi-nepal",
    name: "4 Mukhi Nepal",
    title: "4 Mukhi Nepal",
    category: "Rudraksha",
    price: "₹899",
    originalPrice: "₹1,299",
    offer: "31% off",
    buyLabel: "Order Energized Rudraksha",
  },
  {
    id: "5-mukhi-nepal",
    name: "5 Mukhi Nepal",
    title: "5 Mukhi Nepal",
    category: "Rudraksha",
    price: "₹749",
    originalPrice: "₹999",
    offer: "25% off",
    buyLabel: "Order Energized Rudraksha",
  },
  {
    id: "6-mukhi-indonesia",
    name: "6 Mukhi Indonesia",
    title: "6 Mukhi Indonesia",
    category: "Rudraksha",
    price: "₹1,049",
    originalPrice: "₹1,599",
    offer: "34% off",
    buyLabel: "Order Energized Rudraksha",
  },
];

function normalizeProduct(raw, fallback) {
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const src = raw && typeof raw === "object" ? raw : {};
  const id = String(src.id || base.id || "")
    .trim()
    .slice(0, 80);
  if (!id) return null;

  return {
    id,
    name: String(src.name || base.name || id).trim().slice(0, 120),
    title: String(src.title || base.title || src.name || base.name || id)
      .trim()
      .slice(0, 160),
    category: String(src.category || base.category || "").trim().slice(0, 80),
    /** Catalog SKU (or product slug) — used to open /product/... from the Buy button */
    sku: String(src.sku || base.sku || "")
      .trim()
      .slice(0, 160),
    price: String(src.price || base.price || "").trim().slice(0, 40),
    originalPrice: String(src.originalPrice || base.originalPrice || "")
      .trim()
      .slice(0, 40),
    offer: String(src.offer || base.offer || "").trim().slice(0, 40),
    buyLabel: String(src.buyLabel || base.buyLabel || "Buy Now").trim().slice(0, 80),
  };
}

function parse3dPrices(raw) {
  let parsed = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    parsed = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (_e) {
      parsed = {};
    }
  }

  const defaultsById = Object.fromEntries(DEFAULT_3D_PRODUCTS.map((p) => [p.id, p]));
  const incoming = Array.isArray(parsed.products) ? parsed.products : [];
  const byId = new Map();

  for (const item of incoming) {
    const id = String(item?.id || "").trim();
    if (!id) continue;
    const normalized = normalizeProduct(item, defaultsById[id]);
    if (normalized) byId.set(normalized.id, normalized);
  }

  // Always keep full catalog: merge missing defaults so new models appear in admin.
  for (const def of DEFAULT_3D_PRODUCTS) {
    if (!byId.has(def.id)) byId.set(def.id, { ...def });
  }

  const order = DEFAULT_3D_PRODUCTS.map((p) => p.id);
  const products = [
    ...order.map((id) => byId.get(id)).filter(Boolean),
    ...[...byId.values()].filter((p) => !order.includes(p.id)),
  ];

  return { products };
}

function serialize3dPrices(input = {}) {
  return JSON.stringify(parse3dPrices(input));
}

/** Map id → price fields for the explorer override script. */
function toOverrideMap(data, slugBySku = {}) {
  const { products } = parse3dPrices(data);
  const map = {};
  for (const p of products) {
    const key = String(p.sku || "").trim();
    const productSlug =
      (key && (slugBySku[key] || slugBySku[key.toLowerCase()])) ||
      (key.includes("-") ? key : "") ||
      "";
    map[p.id] = {
      price: p.price,
      originalPrice: p.originalPrice,
      offer: p.offer,
      buyLabel: p.buyLabel,
      title: p.title,
      name: p.name,
      sku: p.sku,
      productSlug,
    };
  }
  return map;
}

/**
 * Pick the best catalog product for a SKU (listed preferred, longer slug preferred).
 */
function pickProductForSku(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const listed = rows.filter((r) => r.status === "listed");
  const pool = listed.length ? listed : rows.slice();
  pool.sort((a, b) => {
    const len = String(b.slug || "").length - String(a.slug || "").length;
    if (len) return len;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
  return pool[0] || null;
}

module.exports = {
  SITE_3D_PRICES_SLUG,
  DEFAULT_3D_PRODUCTS,
  parse3dPrices,
  serialize3dPrices,
  toOverrideMap,
  pickProductForSku,
};
