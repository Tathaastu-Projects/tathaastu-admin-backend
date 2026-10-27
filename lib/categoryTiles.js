/**
 * Homepage "Shop by Category" frames.
 * Images are managed in admin and stored under /uploads/categories/ (backend disk).
 * Sizes match the desktop mosaic at a 1920×1000 artboard, including the 10px gaps.
 * href must match storefront routes in /shop/[category] (FALLBACK_CATEGORIES).
 */
const CATEGORY_TILES = [
  {
    id: "rudraksha",
    label: "Rudraksha",
    href: "/shop/rudraksha",
    category: "rudraksha",
    image: "/uploads/categories/rudraksha.webp",
    area: "rudraksha",
    underline: true,
    width: 644,
    height: 225,
  },
  {
    id: "tumbles",
    label: "Tumbles",
    href: "/shop/tumbles",
    category: "tumbles",
    image: "/uploads/categories/tumbles.webp",
    area: "tumbles",
    underline: true,
    width: 644,
    height: 225,
  },
  {
    id: "bracelets",
    label: "Crystal Bracelets",
    href: "/shop/crystal-bracelets",
    category: "crystal-bracelets",
    image: "/uploads/categories/bracelets.webp",
    area: "bracelets",
    underline: true,
    width: 705,
    height: 460,
  },
  {
    id: "pyramids",
    label: "Pyramids",
    href: "/shop/pyramids",
    category: "pyramids",
    image: "/uploads/categories/pyramids.webp",
    area: "pyramids",
    underline: true,
    width: 552,
    height: 460,
  },
  {
    id: "frame",
    label: "Photo Frames",
    href: "/shop/photo-frames",
    category: "photo-frames",
    image: "/uploads/categories/photo-frame.webp",
    area: "frame",
    underline: false,
    width: 644,
    height: 530,
  },
  {
    id: "stones",
    label: "Loose Stones",
    href: "/shop/loose-stones",
    category: "loose-stones",
    image: "/uploads/categories/loose-stones.webp",
    area: "stones",
    underline: false,
    width: 705,
    height: 530,
  },
  {
    id: "trees",
    label: "Crystal Trees",
    href: "/shop/crystal-trees",
    category: "crystal-trees",
    image: "/uploads/categories/crystal-trees.webp",
    area: "trees",
    underline: false,
    width: 552,
    height: 296,
  },
  {
    id: "anklets",
    label: "Crystal Anklets",
    href: "/shop/crystal-anklets",
    category: "crystal-anklets",
    image: "/uploads/categories/anklets.webp",
    area: "anklets",
    underline: false,
    width: 552,
    height: 224,
  },
];

const TILE_SLUG = "shop-category-tiles";

function tileById(id) {
  return CATEGORY_TILES.find((tile) => tile.id === String(id || "")) || null;
}

module.exports = {
  CATEGORY_TILES,
  TILE_SLUG,
  tileById,
};
