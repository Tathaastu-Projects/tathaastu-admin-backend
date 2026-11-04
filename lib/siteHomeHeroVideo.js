/**
 * Full-screen homepage hero background video (Zomato-style).
 * Admin → Home Page → Hero video.
 * Stored in store_pages as slug "site-home-hero-video".
 */

const HOME_HERO_VIDEO_SLUG = "site-home-hero-video";

const DEFAULT_HOME_HERO_VIDEO = {
  enabled: true,
  videoUrl: "",
  posterUrl: "",
  headline: "Blessed crystals & sacred essentials",
  subheadline:
    "Authentic rudraksha, gemstones, and ritual pieces — energised with care for your intention.",
  ctaLabel: "Shop now",
  ctaHref: "/shop",
};

function parseHomeHeroVideo(raw) {
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

  const enabled =
    parsed.enabled === false || parsed.enabled === "false" || parsed.enabled === 0
      ? false
      : true;

  return {
    enabled,
    videoUrl: String(parsed.videoUrl || "").trim(),
    posterUrl: String(parsed.posterUrl || "").trim(),
    headline: String(parsed.headline || DEFAULT_HOME_HERO_VIDEO.headline).trim(),
    subheadline: String(parsed.subheadline || DEFAULT_HOME_HERO_VIDEO.subheadline).trim(),
    ctaLabel: String(parsed.ctaLabel || DEFAULT_HOME_HERO_VIDEO.ctaLabel).trim(),
    ctaHref: String(parsed.ctaHref || DEFAULT_HOME_HERO_VIDEO.ctaHref).trim() || DEFAULT_HOME_HERO_VIDEO.ctaHref,
  };
}

function serializeHomeHeroVideo(input = {}) {
  return JSON.stringify(parseHomeHeroVideo(input));
}

module.exports = {
  HOME_HERO_VIDEO_SLUG,
  DEFAULT_HOME_HERO_VIDEO,
  parseHomeHeroVideo,
  serializeHomeHeroVideo,
};
