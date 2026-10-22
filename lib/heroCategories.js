/** Categories the homepage banner button can open. */
const HERO_CATEGORIES = [
  { id: "crystal-bracelets", label: "Crystal Bracelets", href: "/shop/crystal-bracelets" },
  { id: "rudraksha", label: "Rudraksha", href: "/shop/rudraksha" },
  { id: "crystal-anklets", label: "Crystal Anklets", href: "/shop/crystal-anklets" },
  { id: "tumbles", label: "Tumbles", href: "/shop/tumbles" },
  { id: "crystal-trees", label: "Crystal Trees", href: "/shop/crystal-trees" },
  { id: "pyramids", label: "Pyramids", href: "/shop/pyramids" },
  { id: "loose-stones", label: "Loose Stones", href: "/shop/loose-stones" },
  { id: "mala", label: "Mala", href: "/shop/mala" },
  { id: "photo-frames", label: "Photo Frames", href: "/shop/photo-frames" },
  { id: "other", label: "Other", href: "/shop/other" },
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
