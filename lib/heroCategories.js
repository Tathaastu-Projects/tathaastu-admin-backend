/** Categories the homepage banner button can open. */
const HERO_CATEGORIES = [
  { id: "rudraksha", label: "Rudraksha", href: "/shop/rudraksha" },
  { id: "gemstone", label: "Gemstones", href: "/shop/gemstone" },
  { id: "bracelet", label: "Bracelets & Malas", href: "/shop/bracelet" },
  { id: "crystal", label: "Crystals", href: "/shop/crystal" },
  { id: "tumbles", label: "Tumbles", href: "/shop?q=tumble" },
  { id: "pyramids", label: "Pyramids", href: "/shop?q=pyramid" },
  { id: "frame", label: "Photo Frame", href: "/shop?q=frame" },
  { id: "stones", label: "Loose Stones", href: "/shop/gemstone" },
  { id: "trees", label: "Crystal Trees", href: "/shop?q=tree" },
  { id: "anklets", label: "Anklets", href: "/shop?q=anklet" },
  { id: "yantra", label: "Yantra", href: "/shop/yantra" },
  { id: "sale", label: "Sale", href: "/shop?onSale=true" },
];

const HOME_SLIDER_KEY = "home-slider";

function categoryById(id) {
  return HERO_CATEGORIES.find((item) => item.id === String(id || "")) || null;
}

module.exports = {
  HERO_CATEGORIES,
  HOME_SLIDER_KEY,
  categoryById,
};
