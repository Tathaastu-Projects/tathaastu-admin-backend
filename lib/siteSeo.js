/**
 * Site-wide SEO (meta title + description) managed from Admin → Home Page → SEO.
 * Stored in store_pages as slug "site-seo" (JSON in content).
 */

const SEO_SLUG = "site-seo";

const CATEGORY_SEO = [
  {
    key: "crystal-bracelets",
    label: "Crystal Bracelets",
    path: "/shop/crystal-bracelets",
    group: "Category pages",
  },
  {
    key: "rudraksha",
    label: "Rudraksha",
    path: "/shop/rudraksha",
    group: "Category pages",
  },
  {
    key: "crystal-anklets",
    label: "Crystal Anklets",
    path: "/shop/crystal-anklets",
    group: "Category pages",
  },
  {
    key: "tumbles",
    label: "Tumbles",
    path: "/shop/tumbles",
    group: "Category pages",
  },
  {
    key: "crystal-trees",
    label: "Crystal Trees",
    path: "/shop/crystal-trees",
    group: "Category pages",
  },
  {
    key: "pyramids",
    label: "Pyramids",
    path: "/shop/pyramids",
    group: "Category pages",
  },
  {
    key: "loose-stones",
    label: "Loose Stones",
    path: "/shop/loose-stones",
    group: "Category pages",
  },
  {
    key: "mala",
    label: "Mala",
    path: "/shop/mala",
    group: "Category pages",
  },
  {
    key: "photo-frames",
    label: "Photo Frames",
    path: "/shop/photo-frames",
    group: "Category pages",
  },
];

const SEO_PAGES = [
  { key: "home", label: "Home", path: "/", group: "Main pages" },
  { key: "shop", label: "Shop", path: "/shop", group: "Main pages" },
  { key: "about", label: "About", path: "/about", group: "Main pages" },
  { key: "blog", label: "Blog", path: "/blog", group: "Main pages" },
  { key: "contact", label: "Contact", path: "/contact", group: "Main pages" },
  { key: "cart", label: "Cart", path: "/cart", group: "Main pages" },
  { key: "account", label: "Account", path: "/account", group: "Main pages" },
  { key: "shipping", label: "Shipping Policy", path: "/policies/shipping", group: "Policies" },
  { key: "refund", label: "Refund Policy", path: "/policies/refund", group: "Policies" },
  { key: "privacy", label: "Privacy Policy", path: "/policies/privacy", group: "Policies" },
  { key: "terms", label: "Terms of Use", path: "/policies/terms", group: "Policies" },
  ...CATEGORY_SEO,
];

function categoryDefaults(label) {
  return {
    metaTitle: `${label} | Abhimantrit by Tathasstu`,
    metaDescription: `Shop energised ${label} from Abhimantrit by Tathasstu — X-ray & lab certified. Explore our ${label.toLowerCase()} collection and shop now.`,
  };
}

const DEFAULTS = {
  home: {
    metaTitle: "Abhimantrit by Tathasstu | Energised Rudraksha & Gemstones.",
    metaDescription:
      "Shop Energised Gemstones & Rudraksha by Abhimantrit by Tathasstu. Explore X-ray and lab certified crystal bracelets, crystal anklets, tumbles, crrystal trees and more. Shop now.",
  },
  shop: {
    metaTitle: "Shop | Abhimantrit by Tathasstu",
    metaDescription:
      "Shop energised Rudraksha, gemstones, crystal bracelets, anklets, tumbles, trees and more — X-ray & lab certified.",
  },
  about: {
    metaTitle: "About Us | Abhimantrit by Tathasstu",
    metaDescription:
      "About Abhimantrit by Tathasstu — energised crystals and Rudraksha curated by Dr. Priyanka Singh.",
  },
  blog: {
    metaTitle: "Blog | Abhimantrit by Tathasstu",
    metaDescription: "Guides, rituals and stories on Rudraksha, gemstones and spiritual jewellery.",
  },
  contact: {
    metaTitle: "Contact | Abhimantrit by Tathasstu",
    metaDescription: "Contact Abhimantrit by Tathasstu for product guidance and support.",
  },
  cart: {
    metaTitle: "Cart | Abhimantrit by Tathasstu",
    metaDescription: "Your Abhimantrit shopping cart.",
  },
  account: {
    metaTitle: "Account | Abhimantrit by Tathasstu",
    metaDescription: "Sign in to your Abhimantrit account.",
  },
  shipping: {
    metaTitle: "Shipping Policy | Abhimantrit by Tathasstu",
    metaDescription: "Order processing, delivery timelines, and shipping for Abhimantrit.",
  },
  refund: {
    metaTitle: "Refund Policy | Abhimantrit by Tathasstu",
    metaDescription: "Cancellations, returns, replacements, and refunds for Abhimantrit.",
  },
  privacy: {
    metaTitle: "Privacy Policy | Abhimantrit by Tathasstu",
    metaDescription: "How Abhimantrit collects, uses, and protects your personal information.",
  },
  terms: {
    metaTitle: "Terms of Use | Abhimantrit by Tathasstu",
    metaDescription: "Terms of use and sale for Abhimantrit by Tathasstu.",
  },
};

for (const cat of CATEGORY_SEO) {
  DEFAULTS[cat.key] = categoryDefaults(cat.label);
}

function emptyPage() {
  return { metaTitle: "", metaDescription: "" };
}

function normalizePage(raw, fallback) {
  const base = fallback || emptyPage();
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    metaTitle: String(src.metaTitle || base.metaTitle || "").trim(),
    metaDescription: String(src.metaDescription || base.metaDescription || "").trim(),
  };
}

function parseSeoContent(raw) {
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
  const pagesIn = parsed.pages && typeof parsed.pages === "object" ? parsed.pages : parsed;
  const pages = {};
  for (const def of SEO_PAGES) {
    pages[def.key] = normalizePage(pagesIn[def.key], DEFAULTS[def.key]);
  }
  return { pages };
}

function serializeSeo(pagesInput = {}) {
  const pages = {};
  for (const def of SEO_PAGES) {
    pages[def.key] = normalizePage(pagesInput[def.key], DEFAULTS[def.key]);
  }
  return JSON.stringify({ pages });
}

function getPageSeo(seoDoc, key) {
  const { pages } = parseSeoContent(seoDoc);
  return pages[key] || normalizePage(null, DEFAULTS[key] || emptyPage());
}

module.exports = {
  SEO_SLUG,
  SEO_PAGES,
  CATEGORY_SEO,
  DEFAULTS,
  parseSeoContent,
  serializeSeo,
  getPageSeo,
  normalizePage,
};
