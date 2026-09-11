const express = require("express");
const Remedy = require("../models/Remedy");
const { buildAllRemedies } = require("../data/buildRemedies");

const router = express.Router();

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "my",
  "me",
  "i",
  "is",
  "are",
  "have",
  "has",
  "with",
  "from",
  "about",
  "please",
  "help",
  "need",
  "want",
  "problem",
  "problems",
  "issue",
  "issues",
  "related",
  "any",
  "kind",
  "very",
  "due",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function cleanMeta(value) {
  return String(value || "")
    .replace(/^[\s➢❖•:\-–—]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeProblemTitle(value) {
  return /^(for|to|while|reduce|protect|looking|positive|make|name|heal|recover|remove|sell|normal)\b/i.test(
    String(value || "").trim()
  );
}

function extractWriteText(item) {
  const meta = item.meta || {};
  const candidates = [
    meta.writeText,
    meta.mantraOrScript,
    String(item.howToUse || "").match(/Write\s*\/\s*chant this Vedic switch word:\s*"([^"]+)"/i)?.[1],
    String(item.description || "").match(/Write\/chant:\s*([^.\n]+)/i)?.[1],
    String(item.description || "").match(/^([अ-हA-Za-z][अ-हA-Za-z0-9\s''-]{0,60}?)\s*➢\s*LORD/i)?.[1],
    String(item.description || "").match(/\b([अ-ह]{1,30}|[A-Z]{2,30})\b/)?.[1],
  ]
    .map(cleanMeta)
    .filter(Boolean);

  for (const candidate of candidates) {
    if (!looksLikeProblemTitle(candidate) && !/LORD|ISSUES|COLOUR|PEN/i.test(candidate)) {
      return candidate;
    }
  }

  const name = cleanMeta(item.name);
  if (name && !looksLikeProblemTitle(name) && !/LORD|ISSUES|COLOUR/i.test(name)) {
    return name;
  }
  return candidates[0] || name || "";
}

function normalizeRemedyForClient(item) {
  if (item.category !== "switchword") return item;

  const writeText = extractWriteText(item);
  const penColor =
    cleanMeta(item.meta?.penColor) ||
    cleanMeta(String(item.description || item.howToUse || "").match(/COLOUR OF THE PEN\s*[:-]\s*([^\n➢❖]+)/i)?.[1]) ||
    cleanMeta(String(item.howToUse || "").match(/pen colour:\s*([^.]+)/i)?.[1]);
  const lord =
    cleanMeta(item.meta?.lord) ||
    cleanMeta(String(item.description || "").match(/LORD\s*[:-]\s*([^\n➢❖]+)/i)?.[1]);
  const purpose =
    cleanMeta(item.meta?.purpose) ||
    cleanMeta((item.problems || []).find((p) => p && !/^etc$/i.test(p))) ||
    "";

  const howToUse = writeText
    ? [
        `Write / chant this Vedic switch word: "${writeText}"`,
        penColor ? `Use pen colour: ${penColor}` : null,
        "You can write it on body, paper or wall; chant it; or use water therapy",
      ]
        .filter(Boolean)
        .join(". ") + "."
    : item.howToUse;

  return {
    ...item,
    name: writeText || item.name,
    description: purpose ? `Helps with: ${purpose}` : `Write/chant: ${writeText}`,
    howToUse,
    meta: {
      ...(item.meta || {}),
      writeText,
      mantraOrScript: writeText,
      penColor,
      lord,
      purpose,
    },
  };
}

function scoreRemedy(remedy, tokens, phrase) {
  const hay = `${remedy.name} ${(remedy.problems || []).join(" ")} ${(remedy.keywords || []).join(" ")} ${
    remedy.description || ""
  } ${remedy.searchText || ""}`.toLowerCase();

  let score = 0;
  const matched = new Set();

  if (phrase && hay.includes(phrase)) {
    score += 12;
    matched.add(phrase);
  }

  for (const token of tokens) {
    if (hay.includes(token)) {
      score += 3;
      matched.add(token);
    }
    for (const problem of remedy.problems || []) {
      const p = String(problem).toLowerCase();
      if (p.includes(token) || token.includes(p)) {
        score += 4;
        matched.add(problem);
      }
    }
  }

  return { score, matched: [...matched].slice(0, 8) };
}

router.get("/", async (req, res) => {
  try {
    const { category, q, limit = 50 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (q) {
      filter.$or = [
        { name: new RegExp(q, "i") },
        { problems: new RegExp(q, "i") },
        { keywords: new RegExp(q, "i") },
        { searchText: new RegExp(q, "i") },
      ];
    }

    const data = await Remedy.find(filter).sort({ name: 1 }).limit(Number(limit) || 50);
    const counts = await Remedy.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]);
    res.json({
      success: true,
      data,
      counts: counts.reduce((acc, row) => {
        acc[row._id] = row.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error("List remedies error:", error);
    res.status(500).json({ success: false, message: "Failed to load remedies" });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const counts = await Remedy.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]);
    const total = await Remedy.countDocuments();
    res.json({
      success: true,
      data: {
        total,
        byCategory: counts.reduce((acc, row) => {
          acc[row._id] = row.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to load stats" });
  }
});

router.post("/recommend", async (req, res) => {
  try {
    const problem = String(req.body?.problem || "").trim();
    if (!problem) {
      return res.status(400).json({ success: false, message: "Please describe the problem" });
    }

    const tokens = tokenize(problem);
    const phrase = problem.toLowerCase().trim();
    const all = await Remedy.find({}).lean();

    const scored = all
      .map((item) => {
        const { score, matched } = scoreRemedy(item, tokens, phrase);
        return { ...normalizeRemedyForClient(item), score, matchedTerms: matched };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const group = (category) =>
      scored.filter((item) => item.category === category).slice(0, 8);

    const recommendations = {
      rudraksha: group("rudraksha"),
      stones: group("stone"),
      crystals: group("crystal"),
      switchwords: group("switchword"),
    };

    // If one category is empty, soften match with broader token presence
    if (
      !recommendations.rudraksha.length &&
      !recommendations.stones.length &&
      !recommendations.crystals.length &&
      !recommendations.switchwords.length
    ) {
      return res.json({
        success: true,
        data: {
          problem,
          tokens,
          recommendations,
          totalMatches: 0,
          message: "No strong matches found. Try more specific symptoms like money, anxiety, marriage, thyroid.",
        },
      });
    }

    res.json({
      success: true,
      data: {
        problem,
        tokens,
        recommendations,
        totalMatches: scored.length,
      },
    });
  } catch (error) {
    console.error("Recommend error:", error);
    res.status(500).json({ success: false, message: "Failed to generate recommendations" });
  }
});

router.post("/seed", async (_req, res) => {
  try {
    const remedies = buildAllRemedies();
    await Remedy.deleteMany({});
    await Remedy.insertMany(remedies);
    const counts = await Remedy.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]);
    res.json({
      success: true,
      message: `Seeded ${remedies.length} remedies`,
      data: {
        total: remedies.length,
        byCategory: counts.reduce((acc, row) => {
          acc[row._id] = row.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Seed error:", error);
    res.status(500).json({ success: false, message: error.message || "Seed failed" });
  }
});

module.exports = router;
