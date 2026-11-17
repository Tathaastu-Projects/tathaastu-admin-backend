/** Homepage “How Abhimantrit” — 4 circular step images after 3D explorer. */

const HOW_ABHIMANTRIT_SLUG = "how-abhimantrit";

const DEFAULT_HOW_STEPS = [
  {
    id: "thoughtfully-sourced",
    title: "Thoughtfully Sourced",
    image: "/uploads/how-abhimantrit/thoughtfully-sourced.png",
  },
  {
    id: "cleansed-carefully",
    title: "Cleansed Carefully",
    image: "/uploads/how-abhimantrit/cleansed-carefully.png",
  },
  {
    id: "energised-intentionally",
    title: "Energised Intentionally",
    image: "/uploads/how-abhimantrit/energised-intentionally.png",
  },
  {
    id: "delivered",
    title: "Delivered to Unlock Your Destiny",
    image: "/uploads/how-abhimantrit/delivered.png",
  },
];

const DEFAULT_HOW_SECTION = {
  enabled: true,
  title: "How Abhimantrit",
  steps: DEFAULT_HOW_STEPS,
};

function howStepById(id) {
  return DEFAULT_HOW_STEPS.find((item) => item.id === String(id || "")) || null;
}

module.exports = {
  HOW_ABHIMANTRIT_SLUG,
  DEFAULT_HOW_STEPS,
  DEFAULT_HOW_SECTION,
  howStepById,
};
