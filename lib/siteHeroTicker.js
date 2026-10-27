/**
 * Hero ticker (auto-scroll dark green strip under the hero).
 * Admin → Home Page → Hero ticker.
 * Stored in store_pages as slug "site-hero-ticker".
 */

const HERO_TICKER_SLUG = "site-hero-ticker";

const DEFAULT_ITEMS = [
  "💎 Energised Crystals by Dr. Priyanka Singh",
  "✅ X-Ray & Lab-Certified",
  "100% Natural & Authentic",
  "Energised Through Vedic Rituals",
  "📦 Free-Insured Worldwide Shipping",
  "Ships in 48 Hours",
  "Astrology-Guided",
  "Vedic Prana Pratishtha",
];

function parseHeroTicker(raw) {
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

  let items = [];
  if (Array.isArray(parsed.items)) {
    items = parsed.items.map((s) => String(s || "").trim()).filter(Boolean);
  }

  if (!items.length) items = [...DEFAULT_ITEMS];
  return { items: items.slice(0, 16) };
}

function serializeHeroTicker(input = {}) {
  let items = [];
  if (Array.isArray(input.items)) {
    items = input.items.map((s) => String(s || "").trim()).filter(Boolean);
  }
  if (!items.length) items = [...DEFAULT_ITEMS];
  return JSON.stringify({ items: items.slice(0, 16) });
}

module.exports = {
  HERO_TICKER_SLUG,
  DEFAULT_ITEMS,
  parseHeroTicker,
  serializeHeroTicker,
};
