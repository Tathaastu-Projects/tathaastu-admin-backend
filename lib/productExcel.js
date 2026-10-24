const XLSX = require("xlsx");

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
  "rudraksha": "Rudraksha",
  "crystal-anklets": "Crystal Anklets",
  "tumbles": "Tumbles",
  "crystal-trees": "Crystal Trees",
  "pyramids": "Pyramids",
  "loose-stones": "Loose Stones",
  "mala": "Mala",
  "photo-frames": "Photo Frames",
  "other": "Other",
};

const CATEGORY_LOOKUP = {
  "crystal-bracelets": "crystal-bracelets",
  "crystal bracelets": "crystal-bracelets",
  "crystal bracelet": "crystal-bracelets",
  "bracelet": "crystal-bracelets",
  "bracelets": "crystal-bracelets",

  "rudraksha": "rudraksha",
  "rudraksh": "rudraksha",
  "rudraksha beads": "rudraksha",

  "crystal-anklets": "crystal-anklets",
  "crystal anklets": "crystal-anklets",
  "crystal anklet": "crystal-anklets",
  "anklet": "crystal-anklets",
  "anklets": "crystal-anklets",

  "tumbles": "tumbles",
  "tumble": "tumbles",
  "tumbled stones": "tumbles",
  "crystal": "tumbles",

  "crystal-trees": "crystal-trees",
  "crystal trees": "crystal-trees",
  "crystal tree": "crystal-trees",
  "tree": "crystal-trees",
  "gemstone tree": "crystal-trees",

  "pyramids": "pyramids",
  "pyramid": "pyramids",

  "loose-stones": "loose-stones",
  "loose stones": "loose-stones",
  "gemstone": "loose-stones",
  "gemstones": "loose-stones",
  "stone": "loose-stones",
  "stones": "loose-stones",

  "mala": "mala",
  "malas": "mala",
  "jap mala": "mala",

  "photo-frames": "photo-frames",
  "photo frames": "photo-frames",
  "photo frame": "photo-frames",
  "frames": "photo-frames",
  "frame": "photo-frames",
  "yantra": "photo-frames",

  "other": "other",
};

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
    } catch (_e) {}
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

function buildProductExcelTemplate() {
  const dummyRows = [
    {
      "Title *": "5 Mukhi Rudraksha Mala (108+1 Beads, Nepal)",
      "SKU / Product Code": "RUD_5M_NEP_108",
      "Category": "Rudraksha",
      "Status": "Draft",
      "MRP": 2499,
      "Sale Price": 1299,
      "Discount %": 48,
      "Quantity": 45,
      "Low stock alert at": 5,
      "Mouse hover details": "Authentic Nepal Beads | Lab Certified by Recognized Gem Lab | Energized with Vedic Mantras",
      "Short description": "Original 5 Mukhi Nepal Rudraksha Mala energized with Vedic mantras for peace and focus.",
      "Full description": "This sacred 5 Mukhi Rudraksha Mala is handcrafted with 108 carefully selected authentic Nepal beads. Promotes tranquility, mental clarity, and spiritual growth. Suitable for daily japa and wearing.",
      "Intention tags": "Peace, Spirituality, Health",
      "New badge": "Yes",
      "Featured": "Yes",
      "Best Seller": "Yes",
      "Primary Image URL": "https://images.unsplash.com/photo-1611591475836-8a0a9bc4ef90?w=800",
      "Image 2 URL": "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800",
      "Image 3 URL": "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "All Images (Comma Separated)": "https://images.unsplash.com/photo-1611591475836-8a0a9bc4ef90?w=800, https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800, https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800",
      "face": "Round",
      "stone": "",
      "shape": "Round Mukhi",
      "weight": "35g",
      "gender": "Unisex",
      "color": "Natural Brown",
      "occasion": "Daily Wear / Meditation",
      "zodiac": "All Zodiacs",
      "material": "Natural Rudraksha",
      "mukhi": "5 Mukhi",
      "jewelryType": "Mala",
      "planet": "Jupiter (Brihaspati)",
      "origin": "Nepal",
      "Variants (mukhi / size / material)": "Label: Standard (8mm), Mukhi: 5, Size: 8mm, Price: 1299, Stock: 30 | Label: Premium (10mm), Mukhi: 5, Size: 10mm, Price: 1699, Stock: 15",
      "Meta title": "Authentic 5 Mukhi Nepal Rudraksha Mala (108 Beads)",
      "Meta description": "Buy 100% original 5 Mukhi Nepal Rudraksha Mala energized with Vedic rituals. Free shipping & lab certificate.",
      "Link recommendation remedy (optional)": "5 Mukhi Rudraksha"
    },
    {
      "Title *": "Natural Rose Quartz Bracelet (8mm Stretchable)",
      "SKU / Product Code": "BRAC_RQ_8MM",
      "Category": "Crystal Bracelets",
      "Status": "Listed",
      "MRP": 1499,
      "Sale Price": 699,
      "Discount %": 53,
      "Quantity": 80,
      "Low stock alert at": 10,
      "Mouse hover details": "100% Natural Crystal | AAA Grade 8mm Beads | Pre-energized for Love & Harmony",
      "Short description": "Genuine Rose Quartz bead bracelet representing unconditional love, emotional healing and harmony.",
      "Full description": "Rose Quartz is the stone of universal love. It restores trust and harmony in relationships, encouraging unconditional love, inner healing and feelings of peace. Handcrafted with high quality durable elastic cord.",
      "Intention tags": "Relationship, Peace",
      "New badge": "Yes",
      "Featured": "Yes",
      "Best Seller": "Yes",
      "Primary Image URL": "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800",
      "Image 2 URL": "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=800",
      "Image 3 URL": "https://images.unsplash.com/photo-1611591475836-8a0a9bc4ef90?w=800",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "All Images (Comma Separated)": "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800, https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=800",
      "face": "Round Bead",
      "stone": "Rose Quartz",
      "shape": "Spherical",
      "weight": "22g",
      "gender": "Women",
      "color": "Soft Pink",
      "occasion": "Daily Wear / Gift",
      "zodiac": "Taurus, Libra",
      "material": "Natural Crystal",
      "mukhi": "",
      "jewelryType": "Bracelet",
      "planet": "Venus (Shukra)",
      "origin": "Madagascar",
      "Variants (mukhi / size / material)": "Label: 6mm Beads, Size: 6mm, Price: 599, Stock: 35 | Label: 8mm Beads, Size: 8mm, Price: 699, Stock: 45",
      "Meta title": "Natural Rose Quartz Crystal Bracelet - Love & Healing",
      "Meta description": "Shop natural Rose Quartz bead bracelet for emotional healing, relationship harmony and self-love.",
      "Link recommendation remedy (optional)": "Rose Quartz Crystal"
    },
    {
      "Title *": "Natural Amethyst Cluster Pyramid (Healing & Vastu)",
      "SKU / Product Code": "PYR_AMY_70MM",
      "Category": "Pyramids",
      "Status": "Listed",
      "MRP": 2999,
      "Sale Price": 1599,
      "Discount %": 47,
      "Quantity": 25,
      "Low stock alert at": 3,
      "Mouse hover details": "Natural Brazilian Amethyst | Vastu Harmonizer | Hand Polished Pyramid",
      "Short description": "Hand-cut natural Amethyst crystal pyramid for psychic protection, aura cleansing and positive energy.",
      "Full description": "Amethyst pyramid radiates calming vibrations, dispelling negative energies from homes and offices. Excellent for meditation rooms and work desks.",
      "Intention tags": "Protection, Spirituality, Peace",
      "New badge": "Yes",
      "Featured": "No",
      "Best Seller": "No",
      "Primary Image URL": "https://images.unsplash.com/photo-1567225557594-88d73e55f2cb?w=800",
      "Image 2 URL": "https://images.unsplash.com/photo-1615655406736-b37c4fabf923?w=800",
      "Image 3 URL": "",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "All Images (Comma Separated)": "https://images.unsplash.com/photo-1567225557594-88d73e55f2cb?w=800, https://images.unsplash.com/photo-1615655406736-b37c4fabf923?w=800",
      "face": "4-Sided Pyramid",
      "stone": "Amethyst",
      "shape": "Pyramid",
      "weight": "150g",
      "gender": "Unisex",
      "color": "Purple",
      "occasion": "Vastu / Meditation",
      "zodiac": "Aquarius, Pisces",
      "material": "Natural Amethyst Quartz",
      "mukhi": "",
      "jewelryType": "Pyramid",
      "planet": "Saturn (Shani)",
      "origin": "Brazil",
      "Variants (mukhi / size / material)": "",
      "Meta title": "Natural Amethyst Crystal Pyramid for Vastu & Positive Energy",
      "Meta description": "Authentic Brazilian Amethyst pyramid for meditation, psychic protection and home vastu.",
      "Link recommendation remedy (optional)": "Amethyst Stone"
    },
    {
      "Title *": "Dhan Yog Necklace - Attracts Wealth & Prosperity",
      "SKU / Product Code": "GM_DYN_770",
      "Category": "Crystal Bracelets",
      "Status": "Listed",
      "MRP": 1149,
      "Sale Price": 999,
      "Discount %": 13,
      "Quantity": 20,
      "Low stock alert at": 5,
      "Mouse hover details": "Sacred Multi-Gemstone Wealth Alignment | Energized with Lakshmi Mantras | Gold Finished Chain",
      "Short description": "Exquisite Dhan Yog necklace combining powerful wealth-attracting gemstones with sacred blessing.",
      "Full description": "Specially formulated for attracting abundance, luxury, and career growth. Worn close to the throat chakra to align intention with opportunity.",
      "Intention tags": "Wealth, Success",
      "New badge": "No",
      "Featured": "Yes",
      "Best Seller": "Yes",
      "Primary Image URL": "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800",
      "Image 2 URL": "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800",
      "Image 3 URL": "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800",
      "Image 4 URL": "",
      "Image 5 URL": "",
      "All Images (Comma Separated)": "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800, https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800, https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800",
      "face": "Round Gemstations",
      "stone": "Citrine, Tiger Eye, Green Aventurine",
      "shape": "Necklace Chain",
      "weight": "18g",
      "gender": "Women",
      "color": "Multi Color",
      "occasion": "Daily Wear / Festive",
      "zodiac": "All Zodiacs",
      "material": "Gold Plated Brass with Natural Stones",
      "mukhi": "",
      "jewelryType": "Necklace",
      "planet": "Jupiter & Mercury",
      "origin": "India",
      "Variants (mukhi / size / material)": "Label: Standard 18 Inch, Size: 18 Inch, Price: 999, Stock: 15 | Label: Long 22 Inch, Size: 22 Inch, Price: 1199, Stock: 5",
      "Meta title": "Dhan Yog Necklace for Wealth and Financial Abundance",
      "Meta description": "Attract wealth and financial prosperity with the energized Dhan Yog multi-gemstone necklace.",
      "Link recommendation remedy (optional)": "Dhan Yog Yantra"
    }
  ];

  const guideRows = [
    { "Field Name": "Title *", "Required": "YES", "Explanation & Examples": "Product Title (e.g. 5 Mukhi Rudraksha Mala, Rose Quartz Bracelet)" },
    { "Field Name": "SKU / Product Code", "Required": "NO", "Explanation & Examples": "Unique inventory SKU, e.g. RUD_5M_NEP_108, GM_DYN_770" },
    { "Field Name": "Category", "Required": "YES", "Explanation & Examples": "Rudraksha, Crystal Bracelets, Crystal Anklets, Tumbles, Crystal Trees, Pyramids, Loose Stones, Mala, Photo Frames, Other" },
    { "Field Name": "Status", "Required": "NO", "Explanation & Examples": "Draft, Listed (live on store), or Unlisted (default: Listed)" },
    { "Field Name": "MRP", "Required": "Recommended", "Explanation & Examples": "Maximum Retail Price in INR (e.g. 2499)" },
    { "Field Name": "Sale Price", "Required": "Recommended", "Explanation & Examples": "Selling price in INR (e.g. 1299). Auto-calculated if MRP & Discount % are provided." },
    { "Field Name": "Discount %", "Required": "NO", "Explanation & Examples": "Discount percentage (e.g. 50). If provided with MRP, Sale Price is automatically calculated!" },
    { "Field Name": "Quantity", "Required": "Recommended", "Explanation & Examples": "Available inventory stock quantity (e.g. 45)" },
    { "Field Name": "Low stock alert at", "Required": "NO", "Explanation & Examples": "Threshold to trigger low stock warning badge (default: 5)" },
    { "Field Name": "Mouse hover details", "Required": "NO", "Explanation & Examples": "Bullet lines shown on card hover, separated by pipe (|). Example: Lab Certified | Energized with Mantras | Nepal Origin" },
    { "Field Name": "Short description", "Required": "NO", "Explanation & Examples": "Brief 1-2 sentence product overview for search and catalog cards" },
    { "Field Name": "Full description", "Required": "NO", "Explanation & Examples": "Detailed full product description, benefits, rituals and usage guide" },
    { "Field Name": "Intention tags", "Required": "NO", "Explanation & Examples": "Comma-separated intentions: Peace, Wealth, Health, Protection, Relationship, Success, Spirituality" },
    { "Field Name": "New badge", "Required": "NO", "Explanation & Examples": "Yes or No (shows green 'NEW' badge on card)" },
    { "Field Name": "Featured", "Required": "NO", "Explanation & Examples": "Yes or No (promotes in featured carousels)" },
    { "Field Name": "Best Seller", "Required": "NO", "Explanation & Examples": "Yes or No (shows gold 'Best Seller' badge)" },
    { "Field Name": "Primary Image URL", "Required": "Recommended", "Explanation & Examples": "Main cover image. Direct image URL (https://...) or Google Drive share link (drive.google.com/file/d/...)" },
    { "Field Name": "Image 2 URL", "Required": "NO", "Explanation & Examples": "Second gallery image direct link or Google Drive link" },
    { "Field Name": "Image 3 URL", "Required": "NO", "Explanation & Examples": "Third gallery image direct link or Google Drive link" },
    { "Field Name": "Image 4 URL", "Required": "NO", "Explanation & Examples": "Fourth gallery image direct link or Google Drive link" },
    { "Field Name": "Image 5 URL", "Required": "NO", "Explanation & Examples": "Fifth gallery image direct link or Google Drive link" },
    { "Field Name": "All Images (Comma Separated)", "Required": "NO", "Explanation & Examples": "Alternative to multiple columns: paste all your photo links separated by comma (,). Drive links are auto-converted!" },
    { "Field Name": "face", "Required": "NO", "Explanation & Examples": "Facet description, e.g. Round, 5 Faced, Oval" },
    { "Field Name": "stone", "Required": "NO", "Explanation & Examples": "Gemstone name, e.g. Rose Quartz, Amethyst, Tiger Eye, Yellow Sapphire" },
    { "Field Name": "shape", "Required": "NO", "Explanation & Examples": "Shape, e.g. Spherical, Round Mukhi, Pyramid, Oval Cabochon" },
    { "Field Name": "weight", "Required": "NO", "Explanation & Examples": "Weight description, e.g. 35g, 5.25 Ratti, 10 Carats" },
    { "Field Name": "gender", "Required": "NO", "Explanation & Examples": "Unisex, Women, or Men" },
    { "Field Name": "color", "Required": "NO", "Explanation & Examples": "Color, e.g. Natural Brown, Soft Pink, Purple, Golden Yellow" },
    { "Field Name": "occasion", "Required": "NO", "Explanation & Examples": "e.g. Daily Wear, Meditation, Puja, Gift, Spiritual Healing" },
    { "Field Name": "zodiac", "Required": "NO", "Explanation & Examples": "Zodiac signs, e.g. Aries, Leo, Taurus, Libra, All Zodiacs" },
    { "Field Name": "material", "Required": "NO", "Explanation & Examples": "e.g. Natural Rudraksha, Crystal Quartz, Gold Plated Brass, Panchdhatu" },
    { "Field Name": "mukhi", "Required": "NO", "Explanation & Examples": "Mukhi count for Rudraksha, e.g. 5 Mukhi, 7 Mukhi, Gauri Shankar" },
    { "Field Name": "jewelryType", "Required": "NO", "Explanation & Examples": "Mala, Bracelet, Ring, Pendant, Pyramid, Loose Stone, Photo Frame" },
    { "Field Name": "planet", "Required": "NO", "Explanation & Examples": "Associated planet, e.g. Jupiter (Brihaspati), Venus (Shukra), Sun (Surya)" },
    { "Field Name": "origin", "Required": "NO", "Explanation & Examples": "Source country/region, e.g. Nepal, Brazil, Madagascar, Ceylon, India" },
    { "Field Name": "Variants (mukhi / size / material)", "Required": "NO", "Explanation & Examples": "Pipe-separated variants. Example: Label: Small, Size: 6mm, Price: 899, Stock: 20 | Label: Large, Size: 8mm, Price: 1099, Stock: 15" },
    { "Field Name": "Meta title", "Required": "NO", "Explanation & Examples": "SEO page title (auto-fills from Title if empty)" },
    { "Field Name": "Meta description", "Required": "NO", "Explanation & Examples": "SEO meta description snippet (auto-fills from short description)" },
    { "Field Name": "Link recommendation remedy (optional)", "Required": "NO", "Explanation & Examples": "Name or slug of remedy to link for personalized recommendations" }
  ];

  const wb = XLSX.utils.book_new();
  const wsProducts = XLSX.utils.json_to_sheet(dummyRows);
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);

  wsProducts["!cols"] = [
    { wch: 45 }, // Title
    { wch: 18 }, // SKU
    { wch: 18 }, // Category
    { wch: 10 }, // Status
    { wch: 10 }, // MRP
    { wch: 12 }, // Sale Price
    { wch: 12 }, // Discount %
    { wch: 10 }, // Quantity
    { wch: 18 }, // Low stock alert at
    { wch: 55 }, // Mouse hover details
    { wch: 45 }, // Short description
    { wch: 60 }, // Full description
    { wch: 30 }, // Intention tags
    { wch: 12 }, // New badge
    { wch: 12 }, // Featured
    { wch: 12 }, // Best Seller
    { wch: 45 }, // Primary Image URL
    { wch: 45 }, // Image 2 URL
    { wch: 45 }, // Image 3 URL
    { wch: 45 }, // Image 4 URL
    { wch: 45 }, // Image 5 URL
    { wch: 65 }, // All Images (Comma Separated)
    { wch: 14 }, // face
    { wch: 18 }, // stone
    { wch: 16 }, // shape
    { wch: 14 }, // weight
    { wch: 12 }, // gender
    { wch: 16 }, // color
    { wch: 20 }, // occasion
    { wch: 18 }, // zodiac
    { wch: 22 }, // material
    { wch: 14 }, // mukhi
    { wch: 16 }, // jewelryType
    { wch: 20 }, // planet
    { wch: 16 }, // origin
    { wch: 50 }, // Variants
    { wch: 35 }, // Meta title
    { wch: 50 }, // Meta description
    { wch: 35 }, // Link recommendation remedy
  ];

  wsGuide["!cols"] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 85 },
  ];

  XLSX.utils.book_append_sheet(wb, wsProducts, "Products");
  XLSX.utils.book_append_sheet(wb, wsGuide, "Instructions");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function cleanKey(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseProductsFromExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.find((s) => s.toLowerCase() !== "instructions") || wb.SheetNames[0];
  if (!sheetName) throw new Error("No sheet found in workbook");

  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rawRows || !rawRows.length) {
    throw new Error("The uploaded sheet is empty or has no data rows.");
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
      normalized["title"] ||
      normalized["producttitle"] ||
      normalized["productname"] ||
      normalized["name"] ||
      ""
    ).trim();

    if (!title) {
      errors.push({
        row: rowNumber,
        title: "(Untitled)",
        error: "Product Title is required",
      });
      return;
    }

    const rawCategory = normalized["category"] || normalized["productcategory"] || normalized["cat"] || "";
    const category = normalizeCategory(rawCategory);

    const sku = String(
      normalized["skuproductcode"] ||
      normalized["sku"] ||
      normalized["productcode"] ||
      normalized["itemcode"] ||
      ""
    ).trim();

    const mrp = Number(
      normalized["mrp"] ||
      normalized["originalprice"] ||
      normalized["regularprice"] ||
      normalized["pricemrp"]
    ) || 0;

    let salePrice = Number(
      normalized["saleprice"] ||
      normalized["sellingprice"] ||
      normalized["price"] ||
      normalized["offerprice"]
    );

    const discountPercent = Number(
      normalized["discount"] ||
      normalized["discountpercent"] ||
      normalized["discountpercentage"]
    );

    if ((isNaN(salePrice) || salePrice <= 0) && mrp > 0 && !isNaN(discountPercent) && discountPercent > 0) {
      salePrice = Math.round(mrp * (1 - Math.min(discountPercent, 100) / 100));
    } else if (isNaN(salePrice) || salePrice <= 0) {
      salePrice = mrp > 0 ? mrp : 0;
    }

    const quantity = Math.max(
      Number(
        normalized["quantity"] ||
        normalized["stock"] ||
        normalized["qty"] ||
        normalized["stockquantity"] ||
        normalized["inventory"] ||
        0
      ) || 0,
      0
    );

    const lowStockAlertRaw =
      normalized["lowstockalertat"] ||
      normalized["lowstockalert"] ||
      normalized["lowstockthreshold"] ||
      normalized["threshold"] ||
      normalized["lowstock"];
    const lowStockThreshold = Number(lowStockAlertRaw) || 5;

    const rawStatus = String(
      normalized["status"] ||
      normalized["productstatus"] ||
      normalized["publishstatus"] ||
      "listed"
    ).toLowerCase().trim();
    const status = ["listed", "unlisted", "draft"].includes(rawStatus) ? rawStatus : "draft";

    // --- MULTIPLE IMAGES COLLECTION ---
    const collectedImageUrls = [];

    // 1. Primary image
    const primaryRaw = formatImageUrl(
      normalized["primaryimageurl"] ||
      normalized["primaryimage"] ||
      normalized["image1url"] ||
      normalized["image1"] ||
      normalized["mainimage"] ||
      normalized["imageurl"] ||
      normalized["image"] ||
      normalized["photolink"] ||
      ""
    );
    if (primaryRaw) collectedImageUrls.push(primaryRaw);

    // 2. Numbered images (Image 2 through 10)
    for (let imgIdx = 2; imgIdx <= 10; imgIdx += 1) {
      const key1 = `image${imgIdx}url`;
      const key2 = `image${imgIdx}`;
      const urlVal = formatImageUrl(normalized[key1] || normalized[key2] || "");
      if (urlVal && !collectedImageUrls.includes(urlVal)) {
        collectedImageUrls.push(urlVal);
      }
    }

    // 3. Comma-separated or pipe-separated multiple images
    const bulkImagesRaw = String(
      normalized["allimagescommaseparated"] ||
      normalized["allimages"] ||
      normalized["additionalimages"] ||
      normalized["additionalimageurls"] ||
      normalized["otherimages"] ||
      normalized["images"] ||
      normalized["gallery"] ||
      ""
    );
    if (bulkImagesRaw) {
      bulkImagesRaw
        .split(/[,\n;|]+/)
        .map((u) => formatImageUrl(u.trim()))
        .filter(Boolean)
        .forEach((url) => {
          if (!collectedImageUrls.includes(url)) {
            collectedImageUrls.push(url);
          }
        });
    }

    const images = collectedImageUrls.map((url, idx) => ({
      url,
      alt: title,
      isPrimary: idx === 0,
    }));

    // Mouse hover details
    const rawHover = String(
      normalized["mousehoverdetails"] ||
      normalized["hoverdetails"] ||
      normalized["hoverlines"] ||
      normalized["highlights"] ||
      normalized["keyfeatures"] ||
      ""
    );
    const hoverDetails = rawHover
      .split(/[|\n]+/)
      .map((h) => ({ label: h.trim() }))
      .filter((h) => h.label)
      .slice(0, 8);

    const shortDescription = String(
      normalized["shortdescription"] ||
      normalized["summary"] ||
      normalized["subtitle"] ||
      ""
    ).trim();

    const description = String(
      normalized["fulldescription"] ||
      normalized["description"] ||
      normalized["details"] ||
      ""
    ).trim();

    // Intentions
    const rawIntentions = String(
      normalized["intentiontags"] ||
      normalized["intentions"] ||
      normalized["intention"] ||
      ""
    );
    const intentions = rawIntentions
      .split(/[,\n;|]+/)
      .map((item) => item.trim())
      .filter((item) => INTENTIONS.includes(item));

    // Badges
    const isNewArrival = parseBoolean(
      normalized["newbadge"] || normalized["isnewarrival"] || normalized["newarrival"] || normalized["new"],
      true
    );
    const isFeatured = parseBoolean(
      normalized["featured"] || normalized["isfeatured"],
      false
    );
    const isBestSeller = parseBoolean(
      normalized["bestseller"] || normalized["isbestseller"],
      false
    );

    // Attributes
    const face = String(normalized["face"] || "").trim();
    const stone = String(normalized["stone"] || normalized["gemstone"] || normalized["crystal"] || "").trim();
    const shape = String(normalized["shape"] || "").trim();
    const weight = String(normalized["weight"] || "").trim();
    const gender = String(normalized["gender"] || "").trim();
    const color = String(normalized["color"] || normalized["colour"] || "").trim();
    const occasion = String(normalized["occasion"] || "").trim();
    const zodiac = String(normalized["zodiac"] || normalized["rashi"] || "").trim();
    const material = String(normalized["material"] || "").trim();
    const mukhi = String(normalized["mukhi"] || "").trim();
    const jewelryType = String(normalized["jewelrytype"] || "").trim();
    const planet = String(normalized["planet"] || "").trim();
    const origin = String(normalized["origin"] || normalized["country"] || "").trim();

    // Variants
    const rawVariants =
      normalized["variantsmukhisizematerial"] ||
      normalized["variants"] ||
      normalized["variant"] ||
      "";
    const variants = parseVariants(rawVariants);

    // SEO
    const metaTitle = String(normalized["metatitle"] || title).trim();
    const metaDescription = String(normalized["metadescription"] || shortDescription || description.slice(0, 160)).trim();

    // Remedy
    const linkedRemedyName = String(
      normalized["linkrecommendationremedyoptional"] ||
      normalized["linkrecommendationremedy"] ||
      normalized["linkedremedyname"] ||
      normalized["remedy"] ||
      ""
    ).trim();

    const baseSlug = slugify(title);

    valid.push({
      row: rowNumber,
      payload: {
        title,
        slug: baseSlug,
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
  normalizeCategory,
  CATEGORIES,
  CATEGORY_NAME_MAP,
  INTENTIONS,
};
