/**
 * Top utility header bar phrases — Admin → Home Page → Top header bar.
 * Stored in store_pages as slug "site-header-bar".
 */

const HEADER_BAR_SLUG = "site-header-bar";

const DEFAULT_ITEMS = [
  "💎 Energised Crystals by Dr. Priyanka Singh",
  "✅ X-Ray & Lab-Certified",
  "📦 Free-Insured Worldwide Shipping",
];

function parseHeaderBar(raw) {
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
  } else if (typeof parsed.text === "string" && parsed.text.trim()) {
    items = parsed.text
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (!items.length) items = [...DEFAULT_ITEMS];
  return { items: items.slice(0, 6) };
}

function serializeHeaderBar(input = {}) {
  let items = [];
  if (Array.isArray(input.items)) {
    items = input.items.map((s) => String(s || "").trim()).filter(Boolean);
  } else if (typeof input.text === "string") {
    items = input.text
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!items.length) items = [...DEFAULT_ITEMS];
  return JSON.stringify({ items: items.slice(0, 6) });
}

module.exports = {
  HEADER_BAR_SLUG,
  DEFAULT_ITEMS,
  parseHeaderBar,
  serializeHeaderBar,
};
