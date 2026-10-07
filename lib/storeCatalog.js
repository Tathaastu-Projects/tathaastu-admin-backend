const Product = require("../models/Product");

const CATEGORIES = [
  "rudraksha",
  "crystal",
  "stone",
  "gemstone",
  "yantra",
  "bracelet",
  "combo",
  "other",
];

const INTENTIONS = [
  "Peace",
  "Wealth",
  "Health",
  "Protection",
  "Relationship",
  "Success",
  "Spirituality",
];

const ZODIAC_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

const SORT_OPTIONS = {
  featured: { isFeatured: -1, isBestSeller: -1, createdAt: -1 },
  best_selling: { isBestSeller: -1, isFeatured: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title_asc: { title: 1 },
  title_desc: { title: -1 },
  price_asc: { effectiveSalePrice: 1, createdAt: -1 },
  price_desc: { effectiveSalePrice: -1, createdAt: -1 },
  discount_desc: { effectiveDiscountPercent: -1, createdAt: -1 },
};

function toList(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => String(item).split(",")).map((s) => s.trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseCatalogQuery(query = {}) {
  const categories = toList(query.category || query.categories).filter((c) => CATEGORIES.includes(c));
  const intentions = toList(query.intention || query.intentions).filter((i) => INTENTIONS.includes(i));
  const zodiac = toList(query.zodiac);
  const stone = toList(query.stone);
  const color = toList(query.color);
  const shape = toList(query.shape);
  const gender = toList(query.gender);
  const material = toList(query.material || query.metal);
  const mukhi = toList(query.mukhi || query.face);
  const jewelryType = toList(query.jewelryType || query.type || query.form);
  const occasion = toList(query.occasion);
  const planet = toList(query.planet);
  const tags = toList(query.tag || query.tags);
  const origin = toList(query.origin);

  const minPrice = toNumber(query.minPrice ?? query.priceMin ?? query["filter.v.price.gte"], null);
  const maxPrice = toNumber(query.maxPrice ?? query.priceMax ?? query["filter.v.price.lte"], null);
  const minCarat = toNumber(query.minCarat ?? query.caratMin, null);
  const maxCarat = toNumber(query.maxCarat ?? query.caratMax, null);
  const minRatti = toNumber(query.minRatti ?? query.rattiMin, null);
  const maxRatti = toNumber(query.maxRatti ?? query.rattiMax, null);

  const inStock =
    query.inStock === "true" || query.availability === "in_stock"
      ? true
      : query.inStock === "false" || query.availability === "out_of_stock"
        ? false
        : null;

  const onSale = query.onSale === "true" || query.sale === "true" ? true : null;
  const featured = query.featured === "true" ? true : null;
  const bestSeller = query.bestSeller === "true" || query.best_selling === "true" ? true : null;
  const isNewArrival = query.isNewArrival === "true" || query.isNew === "true" || query.new === "true" ? true : null;

  const q = String(query.q || query.search || "").trim();
  const collection = String(query.collection || "").trim().toLowerCase();
  const sort = String(query.sort || "featured").trim();
  const page = Math.max(toNumber(query.page, 1) || 1, 1);
  const limit = Math.min(Math.max(toNumber(query.limit, 24) || 24, 1), 100);
  const includeFacets = query.includeFacets === "true" || query.facets === "true";

  return {
    categories,
    intentions,
    zodiac,
    stone,
    color,
    shape,
    gender,
    material,
    mukhi,
    jewelryType,
    occasion,
    planet,
    tags,
    origin,
    minPrice,
    maxPrice,
    minCarat,
    maxCarat,
    minRatti,
    maxRatti,
    inStock,
    onSale,
    featured,
    bestSeller,
    isNewArrival,
    q,
    collection,
    sort: SORT_OPTIONS[sort] ? sort : "featured",
    page,
    limit,
    includeFacets,
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function regexAny(values) {
  if (!values.length) return null;
  return new RegExp(`^(${values.map(escapeRegex).join("|")})$`, "i");
}

function containsAny(values) {
  if (!values.length) return null;
  return new RegExp(values.map(escapeRegex).join("|"), "i");
}

/**
 * Base Mongo match before computed price/stock fields.
 * Price/stock filters are applied after $addFields.
 */
function buildBaseMatch(params, { ignoreKeys = [] } = {}) {
  const ignore = new Set(ignoreKeys);
  const filter = { status: "listed" };
  const and = [];

  if (!ignore.has("categories") && params.categories.length === 1) {
    filter.category = params.categories[0];
  } else if (!ignore.has("categories") && params.categories.length > 1) {
    filter.category = { $in: params.categories };
  }

  if (!ignore.has("intentions") && params.intentions.length) {
    filter.intentions = { $in: params.intentions };
  }

  if (!ignore.has("featured") && params.featured) filter.isFeatured = true;
  if (!ignore.has("bestSeller") && params.bestSeller) filter.isBestSeller = true;
  if (!ignore.has("isNewArrival") && params.isNewArrival) filter.isNewArrival = true;

  const attrMap = [
    ["zodiac", "attributes.zodiac", !ignore.has("zodiac") ? params.zodiac : []],
    ["stone", "attributes.stone", !ignore.has("stone") ? params.stone : []],
    ["color", "attributes.color", !ignore.has("color") ? params.color : []],
    ["shape", "attributes.shape", !ignore.has("shape") ? params.shape : []],
    ["gender", "attributes.gender", !ignore.has("gender") ? params.gender : []],
    ["occasion", "attributes.occasion", !ignore.has("occasion") ? params.occasion : []],
    ["planet", "attributes.planet", !ignore.has("planet") ? params.planet : []],
    ["jewelryType", "attributes.jewelryType", !ignore.has("jewelryType") ? params.jewelryType : []],
    ["origin", "attributes.origin", !ignore.has("origin") ? params.origin : []],
  ];

  for (const [, path, values] of attrMap) {
    const rx = containsAny(values);
    if (rx) filter[path] = rx;
  }

  if (!ignore.has("material") && params.material.length) {
    const rx = containsAny(params.material);
    and.push({
      $or: [{ "attributes.material": rx }, { "variants.material": rx }],
    });
  }

  if (!ignore.has("mukhi") && params.mukhi.length) {
    const rx = containsAny(params.mukhi);
    and.push({
      $or: [{ "attributes.mukhi": rx }, { "attributes.face": rx }, { "variants.mukhi": rx }],
    });
  }

  if (!ignore.has("tags") && params.tags.length) {
    filter.tags = { $in: params.tags.map((t) => new RegExp(`^${escapeRegex(t)}$`, "i")) };
  }

  if (!ignore.has("q") && params.q) {
    and.push({
      $or: [
        { title: new RegExp(escapeRegex(params.q), "i") },
        { shortDescription: new RegExp(escapeRegex(params.q), "i") },
        { description: new RegExp(escapeRegex(params.q), "i") },
        { sku: new RegExp(escapeRegex(params.q), "i") },
        { "attributes.stone": new RegExp(escapeRegex(params.q), "i") },
      ],
    });
  }

  if (and.length) filter.$and = and;
  return filter;
}

const effectiveFieldsStage = {
  $addFields: {
    activeVariants: {
      $filter: {
        input: { $ifNull: ["$variants", []] },
        as: "v",
        cond: { $ne: ["$$v.isActive", false] },
      },
    },
  },
};

const effectivePriceStockStage = {
  $addFields: {
    effectiveSalePrice: {
      $cond: [
        { $gt: [{ $size: "$activeVariants" }, 0] },
        { $min: "$activeVariants.salePrice" },
        { $ifNull: ["$salePrice", 0] },
      ],
    },
    effectiveMrp: {
      $cond: [
        { $gt: [{ $size: "$activeVariants" }, 0] },
        { $min: "$activeVariants.mrp" },
        { $ifNull: ["$mrp", 0] },
      ],
    },
    effectiveStock: {
      $cond: [
        { $gt: [{ $size: "$activeVariants" }, 0] },
        { $sum: "$activeVariants.quantity" },
        { $ifNull: ["$quantity", 0] },
      ],
    },
  },
};

const discountStage = {
  $addFields: {
    effectiveDiscountPercent: {
      $cond: [
        {
          $and: [
            { $gt: ["$effectiveMrp", 0] },
            { $lt: ["$effectiveSalePrice", "$effectiveMrp"] },
          ],
        },
        {
          $round: [
            {
              $multiply: [
                {
                  $divide: [
                    { $subtract: ["$effectiveMrp", "$effectiveSalePrice"] },
                    "$effectiveMrp",
                  ],
                },
                100,
              ],
            },
          ],
        },
        0,
      ],
    },
  },
};

function buildPostMatch(params, { ignoreKeys = [] } = {}) {
  const ignore = new Set(ignoreKeys);
  const match = {};

  if (!ignore.has("minPrice") && params.minPrice != null) {
    match.effectiveSalePrice = { ...(match.effectiveSalePrice || {}), $gte: params.minPrice };
  }
  if (!ignore.has("maxPrice") && params.maxPrice != null) {
    match.effectiveSalePrice = { ...(match.effectiveSalePrice || {}), $lte: params.maxPrice };
  }
  if (!ignore.has("inStock") && params.inStock === true) {
    match.effectiveStock = { $gt: 0 };
  }
  if (!ignore.has("inStock") && params.inStock === false) {
    match.effectiveStock = { $lte: 0 };
  }
  if (!ignore.has("onSale") && params.onSale) {
    match.effectiveDiscountPercent = { $gt: 0 };
  }
  if (!ignore.has("minCarat") && params.minCarat != null) {
    match.weightCarat = { ...(match.weightCarat || {}), $gte: params.minCarat };
  }
  if (!ignore.has("maxCarat") && params.maxCarat != null) {
    match.weightCarat = { ...(match.weightCarat || {}), $lte: params.maxCarat };
  }
  if (!ignore.has("minRatti") && params.minRatti != null) {
    match.weightRatti = { ...(match.weightRatti || {}), $gte: params.minRatti };
  }
  if (!ignore.has("maxRatti") && params.maxRatti != null) {
    match.weightRatti = { ...(match.weightRatti || {}), $lte: params.maxRatti };
  }

  return Object.keys(match).length ? match : null;
}

function catalogPipeline(params, { ignoreKeys = [], forFacets = false } = {}) {
  const pipeline = [
    { $match: buildBaseMatch(params, { ignoreKeys }) },
    effectiveFieldsStage,
    effectivePriceStockStage,
    discountStage,
  ];

  const post = buildPostMatch(params, { ignoreKeys });
  if (post) pipeline.push({ $match: post });

  if (!forFacets) {
    pipeline.push({ $sort: SORT_OPTIONS[params.sort] || SORT_OPTIONS.featured });
    pipeline.push({
      $facet: {
        items: [
          { $skip: (params.page - 1) * params.limit },
          { $limit: params.limit },
          {
            $project: {
              activeVariants: 0,
              __v: 0,
            },
          },
        ],
        totalCount: [{ $count: "count" }],
        priceStats: [
          {
            $group: {
              _id: null,
              minPrice: { $min: "$effectiveSalePrice" },
              maxPrice: { $max: "$effectiveSalePrice" },
            },
          },
        ],
      },
    });
  }

  return pipeline;
}

async function queryCatalog(query) {
  const params = parseCatalogQuery(query);
  const pipeline = catalogPipeline(params);
  const [result] = await Product.aggregate(pipeline);
  const items = result?.items || [];
  const total = result?.totalCount?.[0]?.count || 0;
  const priceStats = result?.priceStats?.[0] || { minPrice: 0, maxPrice: 0 };

  return {
    params,
    items,
    pagination: {
      total,
      page: params.page,
      limit: params.limit,
      pages: Math.ceil(total / params.limit) || 1,
    },
    priceStats: {
      minPrice: priceStats.minPrice ?? 0,
      maxPrice: priceStats.maxPrice ?? 0,
    },
  };
}

function facetGroup(field, label) {
  return [
    {
      $group: {
        _id: `$${field}`,
        count: { $sum: 1 },
      },
    },
    { $match: { _id: { $nin: [null, ""] } } },
    { $sort: { count: -1, _id: 1 } },
    {
      $project: {
        _id: 0,
        value: "$_id",
        label: { $toString: "$_id" },
        count: 1,
      },
    },
  ];
}

async function queryFacets(query) {
  const params = parseCatalogQuery(query);

  // Facet counts are computed within the current collection/base scope,
  // excluding the facet's own selected values (standard e-commerce behavior).
  async function facetFor(ignoreKey, unwindOrGroupStages) {
    const pipeline = [
      ...catalogPipeline(params, { ignoreKeys: [ignoreKey], forFacets: true }),
      ...unwindOrGroupStages,
    ];
    return Product.aggregate(pipeline);
  }

  const [
    categories,
    intentions,
    stones,
    colors,
    shapes,
    genders,
    materials,
    mukhis,
    jewelryTypes,
    zodiacs,
    occasions,
    planets,
    availability,
    tags,
    origins,
  ] = await Promise.all([
    facetFor("categories", facetGroup("category")),
    facetFor("intentions", [
      { $unwind: "$intentions" },
      ...facetGroup("intentions"),
    ]),
    facetFor("stone", facetGroup("attributes.stone")),
    facetFor("color", facetGroup("attributes.color")),
    facetFor("shape", facetGroup("attributes.shape")),
    facetFor("gender", facetGroup("attributes.gender")),
    facetFor("material", [
      {
        $addFields: {
          _material: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ["$attributes.material", ""] } }, 0] },
              "$attributes.material",
              {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: { $ifNull: ["$variants.material", []] },
                      as: "m",
                      cond: { $gt: [{ $strLenCP: { $ifNull: ["$$m", ""] } }, 0] },
                    },
                  },
                  0,
                ],
              },
            ],
          },
        },
      },
      ...facetGroup("_material"),
    ]),
    facetFor("mukhi", [
      {
        $addFields: {
          _mukhi: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ["$attributes.mukhi", ""] } }, 0] },
              "$attributes.mukhi",
              {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ["$attributes.face", ""] } }, 0] },
                  "$attributes.face",
                  {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: { $ifNull: ["$variants.mukhi", []] },
                          as: "m",
                          cond: { $gt: [{ $strLenCP: { $ifNull: ["$$m", ""] } }, 0] },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      ...facetGroup("_mukhi"),
    ]),
    facetFor("jewelryType", facetGroup("attributes.jewelryType")),
    facetFor("zodiac", facetGroup("attributes.zodiac")),
    facetFor("occasion", facetGroup("attributes.occasion")),
    facetFor("planet", facetGroup("attributes.planet")),
    facetFor("inStock", [
      {
        $group: {
          _id: {
            $cond: [{ $gt: ["$effectiveStock", 0] }, "in_stock", "out_of_stock"],
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          value: "$_id",
          label: {
            $cond: [{ $eq: ["$_id", "in_stock"] }, "In stock", "Out of stock"],
          },
          count: 1,
        },
      },
    ]),
    facetFor("tags", [{ $unwind: "$tags" }, ...facetGroup("tags")]),
    facetFor("origin", facetGroup("attributes.origin")),
  ]);

  // Price range for the current filtered set (ignore price itself)
  const pricePipeline = [
    ...catalogPipeline(params, { ignoreKeys: ["minPrice", "maxPrice"], forFacets: true }),
    {
      $group: {
        _id: null,
        minPrice: { $min: "$effectiveSalePrice" },
        maxPrice: { $max: "$effectiveSalePrice" },
      },
    },
  ];
  const priceStats = (await Product.aggregate(pricePipeline))[0] || { minPrice: 0, maxPrice: 0 };

  // Weight ranges (ignore own bounds)
  const weightPipeline = [
    ...catalogPipeline(params, {
      ignoreKeys: ["minCarat", "maxCarat", "minRatti", "maxRatti"],
      forFacets: true,
    }),
    {
      $group: {
        _id: null,
        minCarat: { $min: "$weightCarat" },
        maxCarat: { $max: "$weightCarat" },
        minRatti: { $min: "$weightRatti" },
        maxRatti: { $max: "$weightRatti" },
      },
    },
  ];
  const weightStats = (await Product.aggregate(weightPipeline))[0] || {};

  return {
    params,
    facets: {
      category: categories,
      intention: intentions,
      stone: stones,
      color: colors,
      shape: shapes,
      gender: genders,
      material: materials,
      mukhi: mukhis,
      jewelryType: jewelryTypes,
      zodiac: zodiacs,
      occasion: occasions,
      planet: planets,
      availability,
      tags,
      origin: origins,
      price: {
        min: priceStats.minPrice ?? 0,
        max: priceStats.maxPrice ?? 0,
      },
      weightCarat: {
        min: weightStats.minCarat ?? null,
        max: weightStats.maxCarat ?? null,
      },
      weightRatti: {
        min: weightStats.minRatti ?? null,
        max: weightStats.maxRatti ?? null,
      },
    },
    sortOptions: Object.keys(SORT_OPTIONS).map((value) => ({
      value,
      label: value.replace(/_/g, " "),
    })),
  };
}

async function suggestSearch(q, limit = 8) {
  const term = String(q || "").trim();
  if (!term) return [];

  const rx = new RegExp(escapeRegex(term), "i");
  const products = await Product.find({
    status: "listed",
    $or: [{ title: rx }, { sku: rx }, { "attributes.stone": rx }, { shortDescription: rx }],
  })
    .select("title slug salePrice mrp images category intentions")
    .limit(Math.min(Math.max(Number(limit) || 8, 1), 20))
    .lean();

  return products.map((p) => ({
    type: "product",
    id: p._id,
    title: p.title,
    slug: p.slug,
    category: p.category,
    salePrice: p.salePrice,
    mrp: p.mrp,
    image: p.images?.find((i) => i.isPrimary)?.url || p.images?.[0]?.url || "",
  }));
}

async function relatedProducts(product, limit = 8) {
  if (!product) return [];
  const filter = {
    status: "listed",
    _id: { $ne: product._id },
    $or: [{ category: product.category }],
  };
  if (product.intentions?.length) {
    filter.$or.push({ intentions: { $in: product.intentions } });
  }
  if (product.attributes?.stone) {
    filter.$or.push({ "attributes.stone": new RegExp(escapeRegex(product.attributes.stone), "i") });
  }

  return Product.find(filter)
    .sort({ isFeatured: -1, isBestSeller: -1, createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 8, 1), 24));
}

function buildMegaMenu() {
  return {
    primary: [
      {
        id: "rudraksha",
        label: "Rudraksha",
        href: "/shop/rudraksha",
        columns: [
          {
            title: "Shop by Mukhi",
            links: Array.from({ length: 14 }, (_, i) => ({
              label: `${i + 1} Mukhi`,
              href: `/shop/rudraksha?mukhi=${i + 1}`,
            })),
          },
          {
            title: "By Intention",
            links: INTENTIONS.map((intention) => ({
              label: intention,
              href: `/intention/${intention}`,
            })),
          },
          {
            title: "By Price",
            links: [
              { label: "Under ₹1,000", href: "/shop/rudraksha?maxPrice=1000" },
              { label: "₹1,000 – ₹5,000", href: "/shop/rudraksha?minPrice=1000&maxPrice=5000" },
              { label: "₹5,000 – ₹20,000", href: "/shop/rudraksha?minPrice=5000&maxPrice=20000" },
              { label: "₹20,000 & Above", href: "/shop/rudraksha?minPrice=20000" },
            ],
          },
        ],
      },
      {
        id: "gemstone",
        label: "Gemstones",
        href: "/shop/gemstone",
        columns: [
          {
            title: "By Stone",
            links: [
              { label: "All Gemstones", href: "/shop/gemstone" },
              { label: "Blue Sapphire", href: "/shop/gemstone?stone=Neelam" },
              { label: "Yellow Sapphire", href: "/shop/gemstone?stone=Pukhraj" },
              { label: "Emerald", href: "/shop/gemstone?stone=Panna" },
              { label: "Ruby", href: "/shop/gemstone?stone=Manik" },
            ],
          },
          {
            title: "By Zodiac",
            links: ZODIAC_SIGNS.map((sign) => ({
              label: sign,
              href: `/shop/gemstone?zodiac=${encodeURIComponent(sign)}`,
            })),
          },
          {
            title: "By Price",
            links: [
              { label: "Under ₹10,000", href: "/shop/gemstone?maxPrice=10000" },
              { label: "₹10,000 – ₹25,000", href: "/shop/gemstone?minPrice=10000&maxPrice=25000" },
              { label: "₹25,000 – ₹50,000", href: "/shop/gemstone?minPrice=25000&maxPrice=50000" },
              { label: "₹50,000 & Above", href: "/shop/gemstone?minPrice=50000" },
            ],
          },
        ],
      },
      {
        id: "bracelet",
        label: "Bracelets & Malas",
        href: "/shop/bracelet",
        columns: [
          {
            title: "By Intention",
            links: INTENTIONS.map((intention) => ({
              label: intention,
              href: `/shop/bracelet?intention=${intention}`,
            })),
          },
          {
            title: "Categories",
            links: [
              { label: "Bracelets", href: "/shop/bracelet" },
              { label: "Crystals", href: "/shop/crystal" },
              { label: "Combos", href: "/shop/combo" },
              { label: "Yantras", href: "/shop/yantra" },
            ],
          },
        ],
      },
      {
        id: "intentions",
        label: "Shop by Intention",
        href: "/shop?sort=featured",
        columns: [
          {
            title: "Intentions",
            links: INTENTIONS.map((intention) => ({
              label: intention,
              href: `/intention/${intention}`,
            })),
          },
        ],
      },
      {
        id: "sale",
        label: "Sale",
        href: "/shop?onSale=true",
        columns: [
          {
            title: "Offers",
            links: [
              { label: "All Sale Items", href: "/shop?onSale=true" },
              { label: "Bestsellers", href: "/shop?bestSeller=true" },
              { label: "New Arrivals", href: "/shop?isNewArrival=true" },
            ],
          },
        ],
      },
    ],
    utility: [
      { label: "Track Order", href: "/track-order" },
      { label: "Contact", href: "/contact" },
      { label: "Consultation", href: "/consultation" },
    ],
  };
}

module.exports = {
  CATEGORIES,
  INTENTIONS,
  ZODIAC_SIGNS,
  SORT_OPTIONS,
  parseCatalogQuery,
  queryCatalog,
  queryFacets,
  suggestSearch,
  relatedProducts,
  buildMegaMenu,
};
