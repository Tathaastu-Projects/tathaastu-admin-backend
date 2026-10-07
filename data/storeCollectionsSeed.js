const DEFAULT_TRUST = [
  { id: "lab", label: "Lab Certified", description: "Authenticated & verifiable" },
  { id: "origin", label: "Origin Verified", description: "Natural sourced materials" },
  { id: "ship", label: "Insured Shipping", description: "Pan-India delivery" },
  { id: "returns", label: "Easy Returns", description: "Hassle-free support" },
];

const collections = [
  {
    slug: "all",
    title: "All Products",
    subtitle: "Explore the full Tathaastu collection",
    description:
      "Browse certified Rudraksha, gemstones, crystals, yantras, bracelets and spiritual combos curated for intention-led living.",
    defaultFilters: {},
    sortOrder: 0,
    faqs: [
      {
        question: "Are your products authentic?",
        answer: "Yes. Listed products are curated for authenticity and quality. Certificates are provided where applicable.",
      },
      {
        question: "Do you offer Cash on Delivery?",
        answer: "Yes, COD is available on eligible orders across India.",
      },
    ],
  },
  {
    slug: "rudraksha",
    title: "Rudraksha",
    subtitle: "Original beads for devotion and balance",
    description:
      "Shop 1–14 Mukhi Rudraksha and sacred combinations. Filter by mukhi, intention, and price to find the right bead.",
    defaultFilters: { categories: ["rudraksha"] },
    sortOrder: 1,
    faqs: [
      {
        question: "How do I choose the right Mukhi?",
        answer: "Use intention filters or book a consultation. Each Mukhi is traditionally associated with different benefits.",
      },
    ],
  },
  {
    slug: "gemstone",
    title: "Gemstones",
    subtitle: "Natural stones for planetary remedies",
    description:
      "Explore natural gemstones with filters for stone type, zodiac, weight/shape attributes, and price range.",
    defaultFilters: { categories: ["gemstone", "stone"] },
    sortOrder: 2,
  },
  {
    slug: "crystal",
    title: "Crystals",
    subtitle: "Healing crystals for everyday energy",
    description: "Crystal collection for peace, protection, focus and spiritual practice.",
    defaultFilters: { categories: ["crystal"] },
    sortOrder: 3,
  },
  {
    slug: "bracelet",
    title: "Bracelets & Malas",
    subtitle: "Wearable spiritual jewellery",
    description:
      "Bracelets and malas filtered by intention, material, and price — inspired by modern spiritual jewellery collections.",
    defaultFilters: { categories: ["bracelet"] },
    sortOrder: 4,
    comparisonTable: {
      title: "Why choose authentic spiritual jewellery?",
      headers: ["Factor", "Tathaastu", "Unverified sellers"],
      rows: [
        ["Authenticity", "Curated & listed by admin", "Often unclear"],
        ["Intention tagging", "Peace, Wealth, Protection…", "Rarely structured"],
        ["Returns support", "Clear store policies", "Varies"],
      ],
    },
    faqs: [
      {
        question: "Can I filter by metal or material?",
        answer: "Yes. Use the material filter (e.g. silver, panchdhatu) on the collection page.",
      },
    ],
  },
  {
    slug: "yantra",
    title: "Yantras",
    subtitle: "Sacred geometry for home and altar",
    description: "Yantras for spiritual practice, vastu and focused intention.",
    defaultFilters: { categories: ["yantra"] },
    sortOrder: 5,
  },
  {
    slug: "combo",
    title: "Combos & Kavach",
    subtitle: "Curated sets for stronger intentions",
    description: "Combination products and remedy sets selected for complementary energy.",
    defaultFilters: { categories: ["combo"] },
    sortOrder: 6,
  },
  {
    slug: "sale",
    title: "Sale",
    subtitle: "Discounted spiritual essentials",
    description: "Products currently on sale with MRP vs sale price clearly shown.",
    defaultFilters: { onSale: true },
    sortOrder: 7,
  },
  {
    slug: "bestsellers",
    title: "Bestsellers",
    subtitle: "Most loved by devotees",
    description: "Our bestselling listed products.",
    defaultFilters: { bestSeller: true },
    sortOrder: 8,
  },
  {
    slug: "new-arrivals",
    title: "New Arrivals",
    subtitle: "Fresh listings from the catalog",
    description: "Recently listed products.",
    defaultFilters: { isNewArrival: true },
    sortOrder: 9,
  },
];

function withDefaults(item) {
  return {
    ...item,
    trustBadges: item.trustBadges || DEFAULT_TRUST,
    seo: {
      metaTitle: item.seo?.metaTitle || `${item.title} | Tathaastu Store`,
      metaDescription:
        item.seo?.metaDescription ||
        (item.description || "").slice(0, 155) ||
        `Shop ${item.title} at Tathaastu.`,
    },
    isActive: true,
  };
}

module.exports = {
  DEFAULT_TRUST,
  storeCollectionsSeed: collections.map(withDefaults),
};
