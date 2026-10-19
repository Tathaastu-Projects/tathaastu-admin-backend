/** About Abhimantrit block. The right-hand picture comes from the admin, not a built-in file. */
const ABOUT_IMAGE = "";
const ABOUT_WIDTH = 900;
const ABOUT_HEIGHT = 720;

const ABOUT_INTRO =
  "Abhimantrit brings together authentic Rudraksha, crystals, and spiritual essentials, thoughtfully chosen for their astrological and spiritual significance. Each piece is carefully checked for authenticity and quality, then energised through traditional Vedic rituals with care and intention.";

const ABOUT_FEATURES = [
  {
    id: "lab",
    title: "Lab Certified",
    description: "Quality you can trust, backed by recognised laboratory certification.",
    icon: "badge",
    image: "",
  },
  {
    id: "ritual",
    title: "Abhimantrit",
    description: "Each piece is energised through traditional Vedic rituals with care and intention.",
    icon: "ritual",
    image: "",
  },
  {
    id: "quality",
    title: "Authenticity & Quality",
    description: "Carefully checked to ensure authenticity, purity, and quality in every piece.",
    icon: "check",
    image: "",
  },
  {
    id: "guided",
    title: "Astrologically Guided",
    description: "Selected with astrological guidance for a more personal experience.",
    icon: "star",
    image: "",
  },
];

const ABOUT_SLUG = "about-abhimantrit";

function aboutFeatureById(id) {
  return ABOUT_FEATURES.find((item) => item.id === String(id || "")) || null;
}

module.exports = {
  ABOUT_IMAGE,
  ABOUT_WIDTH,
  ABOUT_HEIGHT,
  ABOUT_INTRO,
  ABOUT_FEATURES,
  ABOUT_SLUG,
  aboutFeatureById,
};
