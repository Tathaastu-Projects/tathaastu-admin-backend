/**
 * Homepage "Shop by Category" frames.
 * Sizes match the desktop mosaic at a 1920×1000 artboard, including the 10px gaps.
 */
const CATEGORY_TILES = [
  {
    id: "rudraksha",
    label: "Rudraksha",
    href: "/shop/rudraksha",
    image: "/categories/rudraksha.webp",
    area: "rudraksha",
    underline: true,
    width: 644,
    height: 225,
  },
  {
    id: "tumbles",
    label: "Tumbles",
    href: "/shop?q=tumble",
    image: "/categories/tumbles.webp",
    area: "tumbles",
    underline: true,
    width: 644,
    height: 225,
  },
  {
    id: "bracelets",
    label: "Premium Crystal Bracelets",
    href: "/shop/bracelet",
    image: "/categories/bracelets.webp",
    area: "bracelets",
    underline: true,
    width: 705,
    height: 460,
  },
  {
    id: "pyramids",
    label: "Pyramids",
    href: "/shop?q=pyramid",
    image: "/categories/pyramids.webp",
    area: "pyramids",
    underline: true,
    width: 552,
    height: 460,
  },
  {
    id: "frame",
    label: "Photo Frame",
    href: "/shop?q=frame",
    image: "/categories/photo-frame.webp",
    area: "frame",
    underline: false,
    width: 644,
    height: 530,
  },
  {
    id: "stones",
    label: "Loose Stones",
    href: "/shop/gemstone",
    image: "/categories/loose-stones.webp",
    area: "stones",
    underline: false,
    width: 705,
    height: 530,
  },
  {
    id: "trees",
    label: "Crystal Trees",
    href: "/shop?q=tree",
    image: "/categories/crystal-trees.webp",
    area: "trees",
    underline: false,
    width: 552,
    height: 296,
  },
  {
    id: "anklets",
    label: "Anklets",
    href: "/shop?q=anklet",
    image: "/categories/anklets.webp",
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
