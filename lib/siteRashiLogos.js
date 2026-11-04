/**
 * Homepage "Rashi Bracelets Collection" zodiac logos.
 * Managed in Admin → Home Page → Rashi bracelet logos.
 */
const RASHI_LOGOS_SLUG = "site-rashi-logos";

const RASHI_SIGNS = [
  { id: "aries", name: "Mesh", english: "Aries", hindi: "मेष" },
  { id: "taurus", name: "Vrishabha", english: "Taurus", hindi: "वृषभ" },
  { id: "gemini", name: "Mithun", english: "Gemini", hindi: "मिथुन" },
  { id: "cancer", name: "Karka", english: "Cancer", hindi: "कर्क" },
  { id: "leo", name: "Simha", english: "Leo", hindi: "सिंह" },
  { id: "virgo", name: "Kanya", english: "Virgo", hindi: "कन्या" },
  { id: "libra", name: "Tula", english: "Libra", hindi: "तुला" },
  { id: "scorpio", name: "Vrishchik", english: "Scorpio", hindi: "वृश्चिक" },
  { id: "sagittarius", name: "Dhanu", english: "Sagittarius", hindi: "धनु" },
  { id: "capricorn", name: "Makar", english: "Capricorn", hindi: "मकर" },
  { id: "aquarius", name: "Kumbh", english: "Aquarius", hindi: "कुम्भ" },
  { id: "pisces", name: "Meen", english: "Pisces", hindi: "मीन" },
];

function defaultLogoPath(id) {
  return `/uploads/zodiac/${id}-cut.webp`;
}

function signById(id) {
  return RASHI_SIGNS.find((sign) => sign.id === String(id || "").trim().toLowerCase()) || null;
}

function parseRashiLogos(raw) {
  let saved = {};
  if (raw) {
    try {
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(data)) {
        for (const item of data) {
          const id = String(item?.id || "").trim().toLowerCase();
          if (!id) continue;
          saved[id] = String(item?.logo || "").trim();
        }
      } else if (data && typeof data === "object") {
        const map = data.logos && typeof data.logos === "object" ? data.logos : data;
        for (const [key, value] of Object.entries(map)) {
          saved[String(key).trim().toLowerCase()] = String(value || "").trim();
        }
      }
    } catch (_error) {
      saved = {};
    }
  }

  return RASHI_SIGNS.map((sign) => {
    const custom = saved[sign.id] || "";
    return {
      ...sign,
      logo: custom,
      effectiveLogo: custom || defaultLogoPath(sign.id),
    };
  });
}

function serializeRashiLogos(items) {
  const logos = {};
  for (const item of items || []) {
    const id = String(item?.id || "").trim().toLowerCase();
    if (!signById(id)) continue;
    const logo = String(item?.logo || "").trim();
    if (logo) logos[id] = logo;
  }
  return JSON.stringify({ logos });
}

module.exports = {
  RASHI_LOGOS_SLUG,
  RASHI_SIGNS,
  defaultLogoPath,
  signById,
  parseRashiLogos,
  serializeRashiLogos,
};
