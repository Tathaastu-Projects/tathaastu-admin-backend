const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const XLSX = require("xlsx");
const { mirrorToStorage } = require("./storedFiles");

const INTENTIONS = ["Peace", "Wealth", "Health", "Protection", "Relationship", "Success", "Spirituality"];
const CATEGORIES = [
  "crystal-bracelets",
  "rudraksha",
  "crystal-anklets",
  "tumbles",
  "crystal-trees",
  "pyramids",
  "loose-stones",
  "mala",
  "photo-frames",
  "other",
];

const CATEGORY_NAME_MAP = {
  "crystal-bracelets": "Crystal Bracelets",
  rudraksha: "Rudraksha",
  "crystal-anklets": "Crystal Anklets",
  tumbles: "Tumbles",
  "crystal-trees": "Crystal Trees",
  pyramids: "Pyramids",
  "loose-stones": "Loose Stones",
  mala: "Mala",
  "photo-frames": "Photo Frames",
  other: "Other",
};

const CATEGORY_LOOKUP = {
  "crystal-bracelets": "crystal-bracelets",
  "crystal bracelets": "crystal-bracelets",
  "crystal bracelet": "crystal-bracelets",
  bracelet: "crystal-bracelets",
  bracelets: "crystal-bracelets",
  rudraksha: "rudraksha",
  rudraksh: "rudraksha",
  "rudraksha beads": "rudraksha",
  "crystal-anklets": "crystal-anklets",
  "crystal anklets": "crystal-anklets",
  "crystal anklet": "crystal-anklets",
  anklet: "crystal-anklets",
  anklets: "crystal-anklets",
  tumbles: "tumbles",
  tumble: "tumbles",
  "tumbled stones": "tumbles",
  crystal: "tumbles",
  "crystal-trees": "crystal-trees",
  "crystal trees": "crystal-trees",
  "crystal tree": "crystal-trees",
  tree: "crystal-trees",
  "gemstone tree": "crystal-trees",
  pyramids: "pyramids",
  pyramid: "pyramids",
  "loose-stones": "loose-stones",
  "loose stones": "loose-stones",
  gemstone: "loose-stones",
  gemstones: "loose-stones",
  stone: "loose-stones",
  stones: "loose-stones",
  mala: "mala",
  malas: "mala",
  "jap mala": "mala",
  "photo-frames": "photo-frames",
  "photo frames": "photo-frames",
  "photo frame": "photo-frames",
  frames: "photo-frames",
  frame: "photo-frames",
  yantra: "photo-frames",
  other: "other",
};

/** Ordered columns for Products sheet (matches admin product form). */
const PRODUCT_COLUMNS = [
  "Title *",
  "SKU / Product Code",
  "Category",
  "Status",
  "MRP",
  "Sale Price",
  "Discount %",
  "Quantity",
  "Low stock alert at",
  "Short description",
  "Full description",
  "Mouse hover details",
  "Intention tags",
  "New badge",
  "Featured",
  "Best Seller",
  "Primary Image URL",
  "Image 2 URL",
  "Image 3 URL",
  "Image 4 URL",
  "Image 5 URL",
  "Image 6 URL",
  "Image 7 URL",
  "Image 8 URL",
  "All Images (Comma Separated)",
  "face",
  "stone",
  "shape",
  "weight",
  "gender",
  "color",
  "occasion",
  "zodiac",
  "material",
  "mukhi",
  "jewelryType",
  "planet",
  "origin",
  "Variants (mukhi / size / material)",
  "Meta title",
  "Meta description",
  "Link recommendation remedy (optional)",
];

function normalizeCategory(val) {
  if (!val) return "crystal-bracelets";
  const str = String(val).trim().toLowerCase();
  const slug = str.replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (CATEGORY_LOOKUP[str]) return CATEGORY_LOOKUP[str];
  if (CATEGORY_LOOKUP[slug]) return CATEGORY_LOOKUP[slug];
  if (CATEGORIES.includes(slug)) return slug;
  return "crystal-bracelets";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatImageUrl(url) {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a" || trimmed === "-") return "";
  const matchDrive = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchDrive) {
    return `https://lh3.googleusercontent.com/d/${matchDrive[1]}`;
  }
  const matchId = trimmed.match(/drive\.google\.com\/.*?id=([a-zA-Z0-9_-]+)/);
  if (matchId) {
    return `https://lh3.googleusercontent.com/d/${matchId[1]}`;
  }
  return trimmed;
}

function parseBoolean(val, defaultVal = false) {
  if (val === undefined || val === null || val === "") return defaultVal;
  const str = String(val).trim().toLowerCase();
  return ["true", "yes", "1", "y", "enable", "enabled"].includes(str);
}

function parseVariants(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const str = String(raw).trim();
  if (!str) return [];
  if (str.startsWith("[") && str.endsWith("]")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed;
    } catch (_e) {
      /* ignore */
    }
  }
  const items = str.split("|").map((s) => s.trim()).filter(Boolean);
  const variants = [];
  for (const item of items) {
    const parts = item.split(",").map((p) => p.trim()).filter(Boolean);
    const v = { label: "", mrp: 0, salePrice: 0, quantity: 0, isActive: true };
    for (const part of parts) {
      const idx = part.indexOf(":");
      if (idx === -1) {
        if (!v.label) v.label = part;
        continue;
      }
      const key = part.slice(0, idx).trim().toLowerCase().replace(/[^a-z]/g, "");
      const val = part.slice(idx + 1).trim();
      if (key === "label" || key === "name") v.label = val;
      else if (key === "sku") v.sku = val;
      else if (key === "mukhi") v.mukhi = val;
      else if (key === "size") v.size = val;
      else if (key === "weight") v.weight = val;
      else if (key === "material") v.material = val;
      else if (key === "color") v.color = val;
      else if (key === "mrp") v.mrp = Number(val) || 0;
      else if (key === "price" || key === "saleprice") v.salePrice = Number(val) || 0;
      else if (key === "stock" || key === "quantity" || key === "qty") v.quantity = Number(val) || 0;
    }
    if (v.label) variants.push(v);
  }
  return variants;
}

function emptyImageCols() {
  return {
    "Primary Image URL": "",
    "Image 2 URL": "",
    "Image 3 URL": "",
    "Image 4 URL": "",
    "Image 5 URL": "",
    "Image 6 URL": "",
    "Image 7 URL": "",
    "Image 8 URL": "",
    "All Images (Comma Separated)": "",
  };
}

function sampleRows() {
  return [
    {
      "Title *": "5 Mukhi Rudraksha Mala (108+1 Beads, Nepal)",
      "SKU / Product Code": "RUD_5M_NEP_108",
      Category: "Rudraksha",
      Status: "Draft",
      MRP: 2499,
      "Sale Price": 1299,
      "Discount %": 48,
      Quantity: 45,
      "Low stock alert at": 5,
      "Short description":
        "Original 5 Mukhi Nepal Rudraksha Mala energized with Vedic mantras for peace and focus.",
      "Full description":
        "This sacred 5 Mukhi Rudraksha Mala is handcrafted with 108 carefully selected authentic Nepal beads. Promotes tranquility, mental clarity, and spiritual growth. Suitable for daily japa and wearing.",
      "Mouse hover details":
        "Authentic Nepal Beads | Lab Certified by Recognized Gem Lab | Energized with Vedic Mantras",
      "Intention tags": "Peace, Spirituality, Health",
      "New badge": "Yes",
      Featured: "Yes",
      "Best Seller": "Yes",
      "Primary Image URL":
        "https://images.unsplash.com/photo-1611591475836-8a0a9bc4ef90?w=800",
      "Image 2 URL": "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800",
      "Image 3 URL": "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "Image 6 URL": "",
      "Image 7 URL": "",
      "Image 8 URL": "",
      "All Images (Comma Separated)": "",
      face: "Round",
      stone: "",
      shape: "Round Mukhi",
      weight: "35g",
      gender: "Unisex",
      color: "Natural Brown",
      occasion: "Daily Wear / Meditation",
      zodiac: "All Zodiacs",
      material: "Natural Rudraksha",
      mukhi: "5 Mukhi",
      jewelryType: "Mala",
      planet: "Jupiter (Brihaspati)",
      origin: "Nepal",
      "Variants (mukhi / size / material)":
        "Label: Standard (8mm), Mukhi: 5, Size: 8mm, Price: 1299, Stock: 30 | Label: Premium (10mm), Mukhi: 5, Size: 10mm, Price: 1699, Stock: 15",
      "Meta title": "Authentic 5 Mukhi Nepal Rudraksha Mala (108 Beads)",
      "Meta description":
        "Buy 100% original 5 Mukhi Nepal Rudraksha Mala energized with Vedic rituals. Free shipping & lab certificate.",
      "Link recommendation remedy (optional)": "5 Mukhi Rudraksha",
    },
    {
      "Title *": "Natural Rose Quartz Bracelet (8mm Stretchable)",
      "SKU / Product Code": "BRAC_RQ_8MM",
      Category: "Crystal Bracelets",
      Status: "Listed",
      MRP: 1499,
      "Sale Price": 699,
      "Discount %": 53,
      Quantity: 80,
      "Low stock alert at": 10,
      "Short description":
        "Genuine Rose Quartz bead bracelet representing unconditional love, emotional healing and harmony.",
      "Full description":
        "Rose Quartz is the stone of universal love. It restores trust and harmony in relationships, encouraging unconditional love, inner healing and feelings of peace.",
      "Mouse hover details":
        "100% Natural Crystal | AAA Grade 8mm Beads | Pre-energized for Love & Harmony",
      "Intention tags": "Relationship, Peace",
      "New badge": "Yes",
      Featured: "Yes",
      "Best Seller": "Yes",
      "Primary Image URL":
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800",
      "Image 2 URL": "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=800",
      "Image 3 URL": "",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "Image 6 URL": "",
      "Image 7 URL": "",
      "Image 8 URL": "",
      "All Images (Comma Separated)":
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800, https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=800",
      face: "Round Bead",
      stone: "Rose Quartz",
      shape: "Spherical",
      weight: "22g",
      gender: "Women",
      color: "Soft Pink",
      occasion: "Daily Wear / Gift",
      zodiac: "Taurus, Libra",
      material: "Natural Crystal",
      mukhi: "",
      jewelryType: "Bracelet",
      planet: "Venus (Shukra)",
      origin: "Madagascar",
      "Variants (mukhi / size / material)":
        "Label: 6mm Beads, Size: 6mm, Price: 599, Stock: 35 | Label: 8mm Beads, Size: 8mm, Price: 699, Stock: 45",
      "Meta title": "Natural Rose Quartz Crystal Bracelet - Love & Healing",
      "Meta description":
        "Shop natural Rose Quartz bead bracelet for emotional healing, relationship harmony and self-love.",
      "Link recommendation remedy (optional)": "Rose Quartz Crystal",
    },
    {
      "Title *": "Natural Amethyst Cluster Pyramid (Healing & Vastu)",
      "SKU / Product Code": "PYR_AMY_70MM",
      Category: "Pyramids",
      Status: "Listed",
      MRP: 2999,
      "Sale Price": 1599,
      "Discount %": 47,
      Quantity: 25,
      "Low stock alert at": 3,
      "Short description":
        "Hand-cut natural Amethyst crystal pyramid for psychic protection, aura cleansing and positive energy.",
      "Full description":
        "Amethyst pyramid radiates calming vibrations, dispelling negative energies from homes and offices. Excellent for meditation rooms and work desks.",
      "Mouse hover details":
        "Natural Brazilian Amethyst | Vastu Harmonizer | Hand Polished Pyramid",
      "Intention tags": "Protection, Spirituality, Peace",
      "New badge": "Yes",
      Featured: "No",
      "Best Seller": "No",
      ...emptyImageCols(),
      face: "4-Sided Pyramid",
      stone: "Amethyst",
      shape: "Pyramid",
      weight: "150g",
      gender: "Unisex",
      color: "Purple",
      occasion: "Vastu / Meditation",
      zodiac: "Aquarius, Pisces",
      material: "Natural Amethyst Quartz",
      mukhi: "",
      jewelryType: "Pyramid",
      planet: "Saturn (Shani)",
      origin: "Brazil",
      "Variants (mukhi / size / material)": "",
      "Meta title": "Natural Amethyst Crystal Pyramid for Vastu & Positive Energy",
      "Meta description":
        "Authentic Brazilian Amethyst pyramid for meditation, psychic protection and home vastu.",
      "Link recommendation remedy (optional)": "Amethyst Stone",
    },
    {
      "Title *": "Citrine Tumbled Stones Pack (Set of 7)",
      "SKU / Product Code": "TUM_CIT_7PC",
      Category: "Tumbles",
      Status: "Listed",
      MRP: 899,
      "Sale Price": 449,
      "Discount %": 50,
      Quantity: 120,
      "Low stock alert at": 15,
      "Short description":
        "Polished natural Citrine tumbles for wealth, confidence and sunny positive energy.",
      "Full description":
        "Each pack includes 7 hand-selected Citrine tumbled stones. Ideal for crystal grids, pockets, or office desks. Attracts abundance and clears stagnant energy.",
      "Mouse hover details":
        "Natural Citrine | Pocket Size | Ready for Gridding",
      "Intention tags": "Wealth, Success, Peace",
      "New badge": "Yes",
      Featured: "Yes",
      "Best Seller": "No",
      "Primary Image URL":
        "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800",
      "Image 2 URL": "",
      "Image 3 URL": "",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "Image 6 URL": "",
      "Image 7 URL": "",
      "Image 8 URL": "",
      "All Images (Comma Separated)": "",
      face: "Smooth",
      stone: "Citrine",
      shape: "Tumbled",
      weight: "80g pack",
      gender: "Unisex",
      color: "Golden Yellow",
      occasion: "Daily / Vastu",
      zodiac: "Leo, Aries",
      material: "Natural Quartz",
      mukhi: "",
      jewelryType: "Tumble",
      planet: "Sun (Surya)",
      origin: "Brazil",
      "Variants (mukhi / size / material)":
        "Label: Small Pack (5 pcs), Price: 349, Stock: 50 | Label: Standard Pack (7 pcs), Price: 449, Stock: 70",
      "Meta title": "Citrine Tumbled Stones Pack - Wealth & Abundance",
      "Meta description":
        "Buy natural Citrine tumbled stone packs for prosperity rituals and crystal healing.",
      "Link recommendation remedy (optional)": "Citrine Crystal",
    },
    {
      "Title *": "7 Chakra Crystal Tree (Silver Wire, 300 Beads)",
      "SKU / Product Code": "TREE_7CHK_300",
      Category: "Crystal Trees",
      Status: "Listed",
      MRP: 3499,
      "Sale Price": 1899,
      "Discount %": 46,
      Quantity: 35,
      "Low stock alert at": 5,
      "Short description":
        "Handcrafted 7 chakra gemstone tree with natural crystal chips for harmony and vastu.",
      "Full description":
        "This decorative healing tree features chips of Amethyst, Carnelian, Yellow Jade, Green Aventurine, Lapis, Sodalite and Clear Quartz on a silver-tone wire trunk with agate base.",
      "Mouse hover details":
        "7 Chakra Stones | Vastu Decor | Handmade Wire Tree",
      "Intention tags": "Spirituality, Peace, Health",
      "New badge": "Yes",
      Featured: "Yes",
      "Best Seller": "Yes",
      "Primary Image URL":
        "https://images.unsplash.com/photo-1602928298849-325cec8771c0?w=800",
      "Image 2 URL": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800",
      "Image 3 URL": "",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "Image 6 URL": "",
      "Image 7 URL": "",
      "Image 8 URL": "",
      "All Images (Comma Separated)": "",
      face: "Tree Form",
      stone: "Multi Chakra Mix",
      shape: "Tree",
      weight: "450g",
      gender: "Unisex",
      color: "Multicolor",
      occasion: "Home Decor / Gift",
      zodiac: "All Zodiacs",
      material: "Natural Crystal Chips + Wire",
      mukhi: "",
      jewelryType: "Tree",
      planet: "All",
      origin: "India",
      "Variants (mukhi / size / material)":
        "Label: 200 Beads, Price: 1499, Stock: 15 | Label: 300 Beads, Price: 1899, Stock: 20",
      "Meta title": "7 Chakra Crystal Tree for Home Vastu & Healing",
      "Meta description":
        "Shop handmade 7 chakra gemstone tree for positive energy, meditation space and gifts.",
      "Link recommendation remedy (optional)": "Seven Chakra Set",
    },
    {
      "Title *": "Black Tourmaline Anklet (Protection, Adjustable)",
      "SKU / Product Code": "ANK_BT_ADJ",
      Category: "Crystal Anklets",
      Status: "Listed",
      MRP: 1299,
      "Sale Price": 649,
      "Discount %": 50,
      Quantity: 60,
      "Low stock alert at": 8,
      "Short description":
        "Grounding Black Tourmaline anklet for psychic protection and EMF shielding.",
      "Full description":
        "Wear this adjustable Black Tourmaline anklet daily to absorb negativity and stay grounded. Natural beads with strong elastic / extender chain.",
      "Mouse hover details":
        "Natural Black Tourmaline | Adjustable Fit | EMF Protection",
      "Intention tags": "Protection, Health",
      "New badge": "No",
      Featured: "No",
      "Best Seller": "Yes",
      "Primary Image URL":
        "https://images.unsplash.com/photo-1617038260897-41db9b9ba2b2?w=800",
      "Image 2 URL": "",
      "Image 3 URL": "",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "Image 6 URL": "",
      "Image 7 URL": "",
      "Image 8 URL": "",
      "All Images (Comma Separated)": "",
      face: "Round Bead",
      stone: "Black Tourmaline",
      shape: "Spherical",
      weight: "18g",
      gender: "Unisex",
      color: "Black",
      occasion: "Daily Wear",
      zodiac: "Capricorn, Scorpio",
      material: "Natural Crystal",
      mukhi: "",
      jewelryType: "Anklet",
      planet: "Saturn (Shani)",
      origin: "Brazil",
      "Variants (mukhi / size / material)":
        "Label: Regular, Size: Adjustable, Price: 649, Stock: 40 | Label: Kids, Size: Small, Price: 549, Stock: 20",
      "Meta title": "Black Tourmaline Protection Anklet - Adjustable",
      "Meta description":
        "Buy natural Black Tourmaline anklet for grounding, protection and daily wear.",
      "Link recommendation remedy (optional)": "Black Tourmaline",
    },
    {
      "Title *": "Raw Clear Quartz Point (Healing Wand, 70-90mm)",
      "SKU / Product Code": "STONE_CQ_POINT",
      Category: "Loose Stones",
      Status: "Draft",
      MRP: 1799,
      "Sale Price": 999,
      "Discount %": 44,
      Quantity: 40,
      "Low stock alert at": 5,
      "Short description":
        "Natural Clear Quartz crystal point for amplification, clarity and energy cleansing.",
      "Full description":
        "Each piece is a unique raw-to-polished Clear Quartz point. Use in meditation, reiki sessions, or as a desk crystal to clear mental fog.",
      "Mouse hover details":
        "Natural Clear Quartz | Amplifies Intentions | Unique Piece",
      "Intention tags": "Spirituality, Success, Peace",
      "New badge": "Yes",
      Featured: "No",
      "Best Seller": "No",
      ...emptyImageCols(),
      face: "Pointed",
      stone: "Clear Quartz",
      shape: "Crystal Point",
      weight: "90-140g",
      gender: "Unisex",
      color: "Transparent",
      occasion: "Meditation / Healing",
      zodiac: "All Zodiacs",
      material: "Natural Quartz",
      mukhi: "",
      jewelryType: "Loose Stone",
      planet: "Moon (Chandra)",
      origin: "Himalayan Belt",
      "Variants (mukhi / size / material)":
        "Label: Small (50-70mm), Price: 699, Stock: 15 | Label: Medium (70-90mm), Price: 999, Stock: 25",
      "Meta title": "Natural Clear Quartz Crystal Point Wand",
      "Meta description":
        "Shop authentic Clear Quartz points for healing, meditation and intention work.",
      "Link recommendation remedy (optional)": "Clear Quartz",
    },
    {
      "Title *": "Sphatik (Clear Quartz) Jap Mala 108 Beads",
      "SKU / Product Code": "MALA_SPH_108",
      Category: "Mala",
      Status: "Listed",
      MRP: 2199,
      "Sale Price": 1199,
      "Discount %": 45,
      Quantity: 55,
      "Low stock alert at": 6,
      "Short description":
        "Pure Sphatik / Clear Quartz jap mala with 108+1 beads for mantra sadhana.",
      "Full description":
        "Cool-to-touch Sphatik beads help calm the mind during japa. Comes with guru bead and cotton tassel. Ideal for chanting and daily spiritual practice.",
      "Mouse hover details":
        "108+1 Beads | Cool Sphatik | Cotton Tassel",
      "Intention tags": "Spirituality, Peace, Health",
      "New badge": "No",
      Featured: "Yes",
      "Best Seller": "Yes",
      "Primary Image URL":
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800",
      "Image 2 URL": "https://images.unsplash.com/photo-1611591475836-8a0a9bc4ef90?w=800",
      "Image 3 URL": "",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "Image 6 URL": "",
      "Image 7 URL": "",
      "Image 8 URL": "",
      "All Images (Comma Separated)": "",
      face: "Round",
      stone: "Sphatik / Clear Quartz",
      shape: "Round Bead",
      weight: "40g",
      gender: "Unisex",
      color: "Clear / White",
      occasion: "Puja / Japa",
      zodiac: "All Zodiacs",
      material: "Natural Quartz",
      mukhi: "",
      jewelryType: "Mala",
      planet: "Moon (Chandra)",
      origin: "India",
      "Variants (mukhi / size / material)":
        "Label: 6mm Beads, Size: 6mm, Price: 999, Stock: 25 | Label: 8mm Beads, Size: 8mm, Price: 1199, Stock: 30",
      "Meta title": "Sphatik Clear Quartz Jap Mala 108 Beads",
      "Meta description":
        "Buy authentic Sphatik jap mala for mantra chanting, meditation and spiritual practice.",
      "Link recommendation remedy (optional)": "Sphatik Mala",
    },
    {
      "Title *": "Shri Yantra Photo Frame (Golden Foil, Wall Ready)",
      "SKU / Product Code": "FRAME_SY_GOLD",
      Category: "Photo Frames",
      Status: "Listed",
      MRP: 1599,
      "Sale Price": 799,
      "Discount %": 50,
      Quantity: 70,
      "Low stock alert at": 10,
      "Short description":
        "Sacred Shri Yantra framed print for wealth, harmony and positive vastu at home or office.",
      "Full description":
        "High-quality printed Shri Yantra with golden foil accents in a ready-to-hang photo frame. Place in the north or northeast for abundance energy.",
      "Mouse hover details":
        "Golden Foil Finish | Wall Ready | Vastu Compatible",
      "Intention tags": "Wealth, Success, Protection",
      "New badge": "Yes",
      Featured: "No",
      "Best Seller": "No",
      "Primary Image URL":
        "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800",
      "Image 2 URL": "",
      "Image 3 URL": "",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "Image 6 URL": "",
      "Image 7 URL": "",
      "Image 8 URL": "",
      "All Images (Comma Separated)": "",
      face: "Square Frame",
      stone: "",
      shape: "Rectangle",
      weight: "350g",
      gender: "Unisex",
      color: "Gold / Cream",
      occasion: "Home / Office Vastu",
      zodiac: "All Zodiacs",
      material: "Print + Wooden Frame",
      mukhi: "",
      jewelryType: "Frame",
      planet: "Venus (Shukra)",
      origin: "India",
      "Variants (mukhi / size / material)":
        "Label: 8x10 inch, Size: 8x10, Price: 799, Stock: 40 | Label: A4, Size: A4, Price: 999, Stock: 30",
      "Meta title": "Shri Yantra Golden Photo Frame for Vastu",
      "Meta description":
        "Shop Shri Yantra wall frame for prosperity, harmony and sacred home decor.",
      "Link recommendation remedy (optional)": "Shri Yantra",
    },
    {
      "Title *": "Tiger Eye Bracelet for Courage & Focus",
      "SKU / Product Code": "BRAC_TE_8MM",
      Category: "Crystal Bracelets",
      Status: "Unlisted",
      MRP: 1399,
      "Sale Price": 649,
      "Discount %": 54,
      Quantity: 90,
      "Low stock alert at": 12,
      "Short description":
        "Golden Tiger Eye bracelet to boost confidence, willpower and mental clarity.",
      "Full description":
        "Tiger Eye is known as a stone of courage and protection. Smooth 8mm beads on stretch cord — perfect everyday wear for professionals and students.",
      "Mouse hover details":
        "Natural Tiger Eye | Stretch Fit | Confidence Stone",
      "Intention tags": "Success, Protection, Wealth",
      "New badge": "No",
      Featured: "Yes",
      "Best Seller": "Yes",
      "Primary Image URL":
        "https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=800",
      "Image 2 URL": "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800",
      "Image 3 URL": "",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "Image 6 URL": "",
      "Image 7 URL": "",
      "Image 8 URL": "",
      "All Images (Comma Separated)":
        "https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=800, https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800",
      face: "Round Bead",
      stone: "Tiger Eye",
      shape: "Spherical",
      weight: "24g",
      gender: "Men",
      color: "Golden Brown",
      occasion: "Daily Wear / Office",
      zodiac: "Leo, Capricorn",
      material: "Natural Crystal",
      mukhi: "",
      jewelryType: "Bracelet",
      planet: "Sun (Surya)",
      origin: "South Africa",
      "Variants (mukhi / size / material)":
        "Label: 8mm, Size: 8mm, Price: 649, Stock: 50 | Label: 10mm, Size: 10mm, Price: 749, Stock: 40",
      "Meta title": "Tiger Eye Crystal Bracelet for Courage & Focus",
      "Meta description":
        "Buy natural Tiger Eye bracelet for confidence, protection and everyday grounding.",
      "Link recommendation remedy (optional)": "Tiger Eye Stone",
    },
  ];
}

function guideRows() {
  return [
    {
      "Field Name": "DUMMY DATA (start here)",
      Required: "Info",
      "Explanation & Examples":
        "Fill_Here and Sample_Products already contain 10 dummy products across categories (Rudraksha, Bracelets, Anklets, Tumbles, Trees, Pyramids, Loose Stones, Mala, Frames). Edit or delete them, then add your real products before Upload Excel.",
    },
    {
      "Field Name": "PHOTOS — Option A",
      Required: "Optional",
      "Explanation & Examples":
        "Paste image links in Primary Image URL + Image 2…8 URL. Use direct https:// image links OR Google Drive share links (Anyone with the link). On import, images are downloaded into /uploads/products/.",
    },
    {
      "Field Name": "PHOTOS — Option B",
      Required: "Optional",
      "Explanation & Examples":
        "Put all photo links in All Images (Comma Separated): url1, url2, url3. Drive links are auto-converted.",
    },
    {
      "Field Name": "PHOTOS — Option C (manual)",
      Required: "Optional",
      "Explanation & Examples":
        "Leave ALL image columns EMPTY. Import products with full text/price details, then open each product in Admin → Products and upload photos one by one.",
    },
    {
      "Field Name": "Title *",
      Required: "YES",
      "Explanation & Examples": "Product title (required). Example: 5 Mukhi Rudraksha Mala",
    },
    {
      "Field Name": "SKU / Product Code",
      Required: "NO",
      "Explanation & Examples": "Unique code, e.g. RUD_5M_NEP_108",
    },
    {
      "Field Name": "Category",
      Required: "YES",
      "Explanation & Examples":
        "Rudraksha | Crystal Bracelets | Crystal Anklets | Tumbles | Crystal Trees | Pyramids | Loose Stones | Mala | Photo Frames | Other",
    },
    {
      "Field Name": "Status",
      Required: "NO",
      "Explanation & Examples": "Draft | Listed | Unlisted (default Draft if blank/invalid)",
    },
    {
      "Field Name": "MRP / Sale Price / Discount %",
      Required: "Recommended",
      "Explanation & Examples":
        "MRP + Discount % auto-calculates Sale Price if Sale Price is blank. Or fill Sale Price directly.",
    },
    {
      "Field Name": "Quantity / Low stock alert at",
      Required: "Recommended",
      "Explanation & Examples": "Stock qty and low-stock warning threshold (default alert: 5)",
    },
    {
      "Field Name": "Short / Full description",
      Required: "NO",
      "Explanation & Examples": "Card/search blurb + full product story",
    },
    {
      "Field Name": "Mouse hover details",
      Required: "NO",
      "Explanation & Examples":
        "Pipe-separated lines shown on product card hover. Example: Lab Certified | Energized | Nepal Origin",
    },
    {
      "Field Name": "Intention tags",
      Required: "NO",
      "Explanation & Examples":
        "Comma-separated: Peace, Wealth, Health, Protection, Relationship, Success, Spirituality",
    },
    {
      "Field Name": "New badge / Featured / Best Seller",
      Required: "NO",
      "Explanation & Examples": "Yes or No",
    },
    {
      "Field Name": "Attributes (face…origin)",
      Required: "NO",
      "Explanation & Examples":
        "face, stone, shape, weight, gender, color, occasion, zodiac, material, mukhi, jewelryType, planet, origin — same as Admin product form",
    },
    {
      "Field Name": "Variants (mukhi / size / material)",
      Required: "NO",
      "Explanation & Examples":
        "Pipe | separated. Example: Label: 8mm, Size: 8mm, Price: 699, Stock: 40 | Label: 10mm, Size: 10mm, Price: 899, Stock: 20",
    },
    {
      "Field Name": "Meta title / Meta description",
      Required: "NO",
      "Explanation & Examples": "SEO fields (auto-fill from title/short description if empty)",
    },
    {
      "Field Name": "Link recommendation remedy (optional)",
      Required: "NO",
      "Explanation & Examples": "Remedy name to link for recommendations",
    },
  ];
}

function blankHeaderRow() {
  const row = {};
  for (const col of PRODUCT_COLUMNS) row[col] = "";
  return row;
}

function buildProductExcelTemplate() {
  const dummyRows = sampleRows();
  const guide = guideRows();
  // Fill_Here also includes dummy examples so the format opens with ready-to-edit sample data
  const fillRows = dummyRows.map((row) => ({ ...row }));

  const wb = XLSX.utils.book_new();
  const wsProducts = XLSX.utils.json_to_sheet(dummyRows, { header: PRODUCT_COLUMNS });
  const wsBlank = XLSX.utils.json_to_sheet(fillRows, { header: PRODUCT_COLUMNS });
  const wsGuide = XLSX.utils.json_to_sheet(guide);

  const cols = PRODUCT_COLUMNS.map((name) => {
    if (name.includes("Title") || name.includes("description") || name.includes("Images"))
      return { wch: 42 };
    if (name.includes("URL") || name.includes("Variants") || name.includes("Meta"))
      return { wch: 36 };
    if (name.includes("hover")) return { wch: 48 };
    return { wch: 16 };
  });
  wsProducts["!cols"] = cols;
  wsBlank["!cols"] = cols;
  wsGuide["!cols"] = [{ wch: 36 }, { wch: 14 }, { wch: 95 }];

  XLSX.utils.book_append_sheet(wb, wsBlank, "Fill_Here");
  XLSX.utils.book_append_sheet(wb, wsProducts, "Sample_Products");
  XLSX.utils.book_append_sheet(wb, wsGuide, "Instructions");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function cleanKey(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function guessExt(url, contentType) {
  const fromUrl = path.extname(String(url || "").split("?")[0]).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(fromUrl)) return fromUrl;
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("gif")) return ".gif";
  return ".jpg";
}

function downloadRemoteImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const lib = String(url).startsWith("https") ? https : http;
    const req = lib.get(url, { timeout: 8000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadRemoteImage(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const type = String(res.headers["content-type"] || "");
      if (type && !type.startsWith("image/") && !type.includes("octet-stream")) {
        res.resume();
        reject(new Error(`Not an image (${type})`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => resolve({ contentType: type }));
      });
      file.on("error", reject);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.on("error", reject);
  });
}

/**
 * Download remote/Drive image URLs into /uploads/products and return local paths.
 * Existing /uploads/... paths are kept as-is. Failures keep the original URL.
 */
async function materializeProductImages(images = [], title = "product") {
  const uploadRoot = path.join(__dirname, "..", "uploads", "products");
  fs.mkdirSync(uploadRoot, { recursive: true });
  const out = [];
  let i = 0;
  // Cap remote downloads so background jobs cannot stall the API for long
  const MAX_REMOTE = 4;
  let remoteDone = 0;
  for (const img of images) {
    i += 1;
    const url = String(img?.url || "").trim();
    if (!url) continue;
    if (url.startsWith("/uploads/")) {
      out.push({ url, alt: img.alt || title, isPrimary: out.length === 0 });
      continue;
    }
    if (!/^https?:\/\//i.test(url)) {
      out.push({ url, alt: img.alt || title, isPrimary: out.length === 0 });
      continue;
    }
    if (remoteDone >= MAX_REMOTE) {
      out.push({ url, alt: img.alt || title, isPrimary: out.length === 0 });
      continue;
    }
    remoteDone += 1;
    try {
      const tempExt = guessExt(url, "");
      const tempName = `${Date.now()}-${i}-${slugify(title).slice(0, 40) || "img"}${tempExt}`;
      const tempPath = path.join(uploadRoot, tempName);
      const { contentType } = await downloadRemoteImage(url, tempPath);
      const finalExt = guessExt(url, contentType);
      let finalName = tempName;
      if (finalExt !== tempExt) {
        finalName = tempName.replace(/\.[^.]+$/, finalExt);
        fs.renameSync(tempPath, path.join(uploadRoot, finalName));
      }
      try {
        mirrorToStorage("products", finalName, path.join(uploadRoot, finalName));
      } catch (_e) {
        /* ignore mirror errors */
      }
      out.push({
        url: `/uploads/products/${finalName}`,
        alt: img.alt || title,
        isPrimary: out.length === 0,
      });
    } catch (_err) {
      // Keep original remote URL so product still has a photo reference
      out.push({ url, alt: img.alt || title, isPrimary: out.length === 0 });
    }
  }
  if (out.length) out[0].isPrimary = true;
  return out;
}

function parseProductsFromExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const preferred = wb.SheetNames.find((s) => {
    const n = s.toLowerCase();
    return n === "fill_here" || n === "products" || n.includes("product");
  });
  const sheetName =
    preferred ||
    wb.SheetNames.find((s) => {
      const n = s.toLowerCase();
      return n !== "instructions" && n !== "sample_products";
    }) ||
    wb.SheetNames[0];
  if (!sheetName) throw new Error("No sheet found in workbook");

  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rawRows || !rawRows.length) {
    throw new Error("The uploaded sheet is empty or has no data rows. Use the Fill_Here sheet.");
  }

  const valid = [];
  const errors = [];

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const normalized = {};

    Object.keys(row).forEach((k) => {
      normalized[cleanKey(k)] = row[k];
    });

    const title = String(
      normalized.title ||
        normalized.producttitle ||
        normalized.productname ||
        normalized.name ||
        "",
    ).trim();

    // Skip fully empty template header leftover rows
    const anyValue = Object.values(normalized).some((v) => String(v || "").trim());
    if (!title) {
      if (!anyValue) return;
      errors.push({
        row: rowNumber,
        title: "(Untitled)",
        error: "Product Title is required",
      });
      return;
    }

    const rawCategory = normalized.category || normalized.productcategory || normalized.cat || "";
    const category = normalizeCategory(rawCategory);

    const sku = String(
      normalized.skuproductcode ||
        normalized.sku ||
        normalized.productcode ||
        normalized.itemcode ||
        "",
    ).trim();

    const mrp =
      Number(
        normalized.mrp ||
          normalized.originalprice ||
          normalized.regularprice ||
          normalized.pricemrp,
      ) || 0;

    let salePrice = Number(
      normalized.saleprice ||
        normalized.sellingprice ||
        normalized.price ||
        normalized.offerprice,
    );

    const discountPercent = Number(
      normalized.discount || normalized.discountpercent || normalized.discountpercentage,
    );

    if (
      (Number.isNaN(salePrice) || salePrice <= 0) &&
      mrp > 0 &&
      !Number.isNaN(discountPercent) &&
      discountPercent > 0
    ) {
      salePrice = Math.round(mrp * (1 - Math.min(discountPercent, 100) / 100));
    } else if (Number.isNaN(salePrice) || salePrice <= 0) {
      salePrice = mrp > 0 ? mrp : 0;
    }

    const quantity = Math.max(
      Number(
        normalized.quantity ||
          normalized.stock ||
          normalized.qty ||
          normalized.stockquantity ||
          normalized.inventory ||
          0,
      ) || 0,
      0,
    );

    const lowStockAlertRaw =
      normalized.lowstockalertat ||
      normalized.lowstockalert ||
      normalized.lowstockthreshold ||
      normalized.threshold ||
      normalized.lowstock;
    const lowStockThreshold = Number(lowStockAlertRaw) || 5;

    const rawStatus = String(
      normalized.status || normalized.productstatus || normalized.publishstatus || "draft",
    )
      .toLowerCase()
      .trim();
    const status = ["listed", "unlisted", "draft"].includes(rawStatus) ? rawStatus : "draft";

    const collectedImageUrls = [];

    const primaryRaw = formatImageUrl(
      normalized.primaryimageurl ||
        normalized.primaryimage ||
        normalized.image1url ||
        normalized.image1 ||
        normalized.mainimage ||
        normalized.imageurl ||
        normalized.image ||
        normalized.photolink ||
        "",
    );
    if (primaryRaw) collectedImageUrls.push(primaryRaw);

    for (let imgIdx = 2; imgIdx <= 12; imgIdx += 1) {
      const urlVal = formatImageUrl(
        normalized[`image${imgIdx}url`] || normalized[`image${imgIdx}`] || "",
      );
      if (urlVal && !collectedImageUrls.includes(urlVal)) collectedImageUrls.push(urlVal);
    }

    const bulkImagesRaw = String(
      normalized.allimagescommaseparated ||
        normalized.allimages ||
        normalized.additionalimages ||
        normalized.additionalimageurls ||
        normalized.otherimages ||
        normalized.images ||
        normalized.gallery ||
        "",
    );
    if (bulkImagesRaw) {
      bulkImagesRaw
        .split(/[,\n;|]+/)
        .map((u) => formatImageUrl(u.trim()))
        .filter(Boolean)
        .forEach((url) => {
          if (!collectedImageUrls.includes(url)) collectedImageUrls.push(url);
        });
    }

    const images = collectedImageUrls.map((url, idx) => ({
      url,
      alt: title,
      isPrimary: idx === 0,
    }));

    const rawHover = String(
      normalized.mousehoverdetails ||
        normalized.hoverdetails ||
        normalized.hoverlines ||
        normalized.highlights ||
        normalized.keyfeatures ||
        "",
    );
    const hoverDetails = rawHover
      .split(/[|\n]+/)
      .map((h) => ({ label: h.trim() }))
      .filter((h) => h.label)
      .slice(0, 8);

    const shortDescription = String(
      normalized.shortdescription || normalized.summary || normalized.subtitle || "",
    ).trim();

    const description = String(
      normalized.fulldescription || normalized.description || normalized.details || "",
    ).trim();

    const rawIntentions = String(
      normalized.intentiontags || normalized.intentions || normalized.intention || "",
    );
    const intentions = rawIntentions
      .split(/[,\n;|]+/)
      .map((item) => item.trim())
      .filter((item) => INTENTIONS.includes(item));

    const isNewArrival = parseBoolean(
      normalized.newbadge || normalized.isnewarrival || normalized.newarrival || normalized.new,
      false,
    );
    const isFeatured = parseBoolean(normalized.featured || normalized.isfeatured, false);
    const isBestSeller = parseBoolean(normalized.bestseller || normalized.isbestseller, false);

    const face = String(normalized.face || "").trim();
    const stone = String(
      normalized.stone || normalized.gemstone || normalized.crystal || "",
    ).trim();
    const shape = String(normalized.shape || "").trim();
    const weight = String(normalized.weight || "").trim();
    const gender = String(normalized.gender || "").trim();
    const color = String(normalized.color || normalized.colour || "").trim();
    const occasion = String(normalized.occasion || "").trim();
    const zodiac = String(normalized.zodiac || normalized.rashi || "").trim();
    const material = String(normalized.material || "").trim();
    const mukhi = String(normalized.mukhi || "").trim();
    const jewelryType = String(normalized.jewelrytype || "").trim();
    const planet = String(normalized.planet || "").trim();
    const origin = String(normalized.origin || normalized.country || "").trim();

    const rawVariants =
      normalized.variantsmukhisizematerial || normalized.variants || normalized.variant || "";
    const variants = parseVariants(rawVariants);

    const metaTitle = String(normalized.metatitle || title).trim();
    const metaDescription = String(
      normalized.metadescription || shortDescription || description.slice(0, 160),
    ).trim();

    const linkedRemedyName = String(
      normalized.linkrecommendationremedyoptional ||
        normalized.linkrecommendationremedy ||
        normalized.linkedremedyname ||
        normalized.remedy ||
        "",
    ).trim();

    valid.push({
      row: rowNumber,
      payload: {
        title,
        slug: slugify(title),
        sku,
        category,
        mrp,
        salePrice,
        quantity,
        lowStockThreshold,
        status,
        images,
        shortDescription,
        description,
        intentions,
        isFeatured,
        isBestSeller,
        isNewArrival,
        hoverDetails,
        variants,
        attributes: {
          face,
          stone,
          shape,
          weight,
          gender,
          color,
          occasion,
          zodiac,
          material,
          mukhi,
          jewelryType,
          planet,
          origin,
        },
        seo: {
          metaTitle,
          metaDescription,
        },
        linkedRemedyName,
      },
    });
  });

  return { valid, errors, totalParsed: rawRows.length };
}

module.exports = {
  buildProductExcelTemplate,
  parseProductsFromExcel,
  materializeProductImages,
  normalizeCategory,
  CATEGORIES,
  CATEGORY_NAME_MAP,
  INTENTIONS,
  PRODUCT_COLUMNS,
};
