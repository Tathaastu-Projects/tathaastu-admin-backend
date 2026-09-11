const fs = require("fs");
const path = require("path");

const STONE_NAMES = new Set(
  [
    "Black Obsidian",
    "Black Tourmaline",
    "Bloodstone",
    "Blue Aventurine",
    "Bumblebee Jasper",
    "Green Aventurine",
    "Hematite",
    "Howlite",
    "Kambaba Jasper",
    "Larvikite",
    "Moss Agate",
    "Pink Chalcedony",
    "Pyrite",
    "Red Jasper",
    "Tiger's Eye",
    "Tiger’s Eye",
  ].map((n) => n.toLowerCase())
);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function unique(list) {
  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
}

function splitProblems(text) {
  return unique(
    String(text || "")
      .split(/[,;/|•❖➢\n]+/)
      .map((part) => part.replace(/^for\s+/i, "").replace(/\s+/g, " ").trim())
      .filter((part) => part.length > 2 && part.length < 80)
  );
}

function parseCrystals(text) {
  const chunks = text.split(/Healing Properties of /g).slice(1);
  const items = [];

  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/);
    const name = (lines[0] || "").replace(/\s+/g, " ").trim();
    if (!name || name.toLowerCase() === "crystals") continue;
    if (/^contents$/i.test(name)) continue;
    if (name.length > 60) continue;

    const keywordsMatch = chunk.match(/Keywords\s*([\s\S]*?)(?:Associations|Page Content|Source URL)/i);
    const associationsMatch = chunk.match(/Associations\s*([\s\S]*?)(?:Page Content|Keywords|Source URL)/i);
    const pageContentMatch = chunk.match(/Page Content\s*([\s\S]*?)(?:The best way to use|In the physical body|Images|Amethyst Affirmations|Amazonite Affirmations|-- \d+ of)/i);
    const howToMatch = chunk.match(/The best way to use[\s\S]*?:\s*([\s\S]*?)(?:Affirmations|Images|-- \d+ of)/i);
    const affirmationsMatch = chunk.match(/Affirmations\s*([\s\S]*?)(?:Images|-- \d+ of|$)/i);
    const physicalMatch = chunk.match(/In the physical body\s*([\s\S]*?)(?:The best way|Chakras|Affirmations|-- \d+ of)/i);

    const keywords = splitProblems((keywordsMatch?.[1] || "").replace(/\n/g, ", "));
    const physical = splitProblems((physicalMatch?.[1] || "").replace(/\n/g, ", "));
    const associations = (associationsMatch?.[1] || "").replace(/\s+/g, " ").trim();
    const description = (pageContentMatch?.[1] || chunk.slice(0, 900))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
    const howToUse = (howToMatch?.[1] || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);
    const affirmations = unique(
      String(affirmationsMatch?.[1] || "")
        .split(/\n|•/)
        .map((line) => line.replace(/^[-•]\s*/, "").trim())
        .filter((line) => line.startsWith("I ") || line.length > 20)
    ).slice(0, 8);

    const problems = unique([
      ...keywords,
      ...physical,
      ...splitProblems(description.slice(0, 400)),
    ]).slice(0, 40);

    const category = STONE_NAMES.has(name.toLowerCase()) ? "stone" : "crystal";

    // Skip TOC-only fragments without real page body
    if ((description || "").length < 80 && keywords.length < 3) continue;

    items.push({
      category,
      name,
      slug: `${category}-${slugify(name)}`,
      problems,
      keywords,
      benefits: problems.slice(0, 12),
      description,
      howToUse,
      affirmations,
      meta: { associations },
      source: "Healing_Properties_of_Crystals.pdf",
    });
  }

  // Deduplicate by slug (Pink Chalcedony appears twice in TOC)
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.slug) || (item.description || "").length > (map.get(item.slug).description || "").length) {
      map.set(item.slug, item);
    }
  }
  return [...map.values()];
}

function cleanMetaValue(value) {
  return String(value || "")
    .replace(/^[\s➢❖•:\-–—]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isProblemTitle(line) {
  return /^(for|to|while|reduce|protect|looking|positive|make|name|heal|recover|remove|sell|normal|almony|live)\b/i.test(
    String(line || "").trim()
  );
}

function isNoiseLine(line) {
  return /^(PEN|LORD|ISSUES|COLOUR|CONNECTION|HEALING|THE BATRAA|VEDIC SWITCH)/i.test(String(line || "").trim());
}

function pickSwitchText(wordCandidates, problemTitle) {
  // Prefer clear uppercase switch words / mantras (not "FOR COURT CASE" titles)
  const latinMantra = wordCandidates.find(
    (line) =>
      /^[A-Z][A-Z0-9\s'\-]{1,60}$/.test(line) &&
      !isProblemTitle(line) &&
      !isNoiseLine(line) &&
      line.length >= 2
  );
  if (latinMantra) return latinMantra.trim();

  // Hindi / Devanagari mantra lines
  const hindi = wordCandidates.find((line) => /[अ-ह]/.test(line) && line.length >= 3);
  if (hindi) return hindi.trim();

  // Mixed case mantra like "Dharmadev Dharmaaditya..."
  const mixed = wordCandidates.find(
    (line) =>
      /^[A-Za-z][A-Za-z0-9\s'\-]{3,80}$/.test(line) &&
      !isProblemTitle(line) &&
      !isNoiseLine(line) &&
      line !== problemTitle
  );
  if (mixed) return mixed.trim();

  return "";
}

function buildSwitchHowTo({ writeText, penColor, extra = "" }) {
  const parts = [];
  if (writeText) {
    parts.push(`Write / chant this Vedic switch word: "${writeText}"`);
  } else {
    parts.push("Write / chant the switch word shown on this card");
  }
  if (penColor) parts.push(`Use pen colour: ${penColor}`);
  parts.push("You can write it on body, paper or wall; chant it; or use water therapy.");
  if (extra) parts.push(extra);
  return parts.join(". ").replace(/\.\./g, ".");
}

function parseSwitchwordBlocks(text) {
  const pages = text.split(/--\s*\d+\s*of\s*\d+\s*--/g);
  const items = [];

  for (const page of pages) {
    const cleaned = page
      .replace(/THE BATRAA NUMEROLOGY/g, "")
      .replace(/VEDIC SWITCHWORD/g, "")
      .trim();
    if (!cleaned || cleaned.length < 20) continue;

    const issuesMatch = cleaned.match(/ISSUES?\s*[:-]\s*([\s\S]*?)(?:HOW TO|THING TO|Write it|--|$)/i);
    const lordMatch = cleaned.match(/(?:LORD|CONNECTION|HEALING)\s*[:-]\s*([^\n➢]+)/i);
    const colourMatch = cleaned.match(/COLOUR OF THE PEN\s*[:-]\s*([^\n➢]+)/i);

    const wordCandidates = cleaned
      .split(/\n/)
      .map((line) => line.replace(/[➢❖•]/g, "").trim())
      .filter(Boolean);

    const purposeLine =
      wordCandidates.find((line) => isProblemTitle(line) && line.length < 70) ||
      "";

    let word = "";
    for (const line of wordCandidates.slice(0, 12)) {
      if (isProblemTitle(line) || isNoiseLine(line)) continue;
      if (/^[A-Z][A-Z0-9\s'\-]{1,40}$/.test(line)) {
        word = line.trim();
        break;
      }
    }

    if (!word) {
      const beej = wordCandidates.find(
        (line) => /^[A-Z]{2,16}$/.test(line) && !isNoiseLine(line)
      );
      if (beej) word = beej;
    }

    const switchText = pickSwitchText(wordCandidates, purposeLine) || word;
    if (!switchText && !purposeLine) continue;

    if (
      /^(how to use|thing to remember|what are|kalyug|vedic switch|the batraa|contents)/i.test(
        switchText || purposeLine
      )
    ) {
      continue;
    }

    const problemSource = [
      issuesMatch?.[1] || "",
      purposeLine,
      ...wordCandidates.filter((line) => isProblemTitle(line)).slice(0, 3),
    ].join("\n");

    const problems = splitProblems(
      String(problemSource)
        .replace(/[❖➢•]/g, ",")
        .replace(/\n/g, ",")
    );

    const finalProblems = problems.length
      ? problems
      : purposeLine
      ? splitProblems(purposeLine.replace(/^(for|to)\s+/i, ""))
      : [];

    if (!finalProblems.length && !issuesMatch) continue;
    if (!finalProblems.length) continue;

    const lord = cleanMetaValue(lordMatch?.[1] || "");
    const penColor = cleanMetaValue(colourMatch?.[1] || "");
    const displayName = (switchText || purposeLine).replace(/\s+/g, " ").trim();
    const purpose = issuesMatch
      ? cleanMetaValue(finalProblems[0] || purposeLine || "")
      : cleanMetaValue(purposeLine || finalProblems[0] || "");

    // Hindi/script companion if different from main write text
    const scriptLine = wordCandidates.find(
      (line) =>
        /[अ-ह]/.test(line) &&
        line !== switchText &&
        line.length >= 3
    );

    items.push({
      category: "switchword",
      name: displayName,
      slug: `switchword-${slugify(displayName)}-${slugify(purpose || lord || penColor || "item")}`,
      problems: finalProblems.slice(0, 25),
      keywords: finalProblems.slice(0, 25),
      benefits: finalProblems.slice(0, 12),
      description: purpose
        ? `Purpose: ${purpose}. Write/chant: ${displayName}${scriptLine ? ` / ${scriptLine}` : ""}.`
        : `Write/chant: ${displayName}.`,
      howToUse: buildSwitchHowTo({
        writeText: displayName,
        penColor,
        extra: scriptLine ? `Also available in script: ${scriptLine}` : "",
      }),
      meta: {
        lord,
        penColor,
        purpose,
        writeText: displayName,
        mantraOrScript: cleanMetaValue(scriptLine || displayName),
      },
      source: "pdf vedic new switchword.pdf",
    });
  }

  return dedupeSwitchwords(items);
}

function parseWebinarSwitchwords(text) {
  const pages = text.split(/--\s*\d+\s*of\s*\d+\s*--/g).slice(1);
  const items = [];
  for (const page of pages) {
    const lines = page
      .split(/\n/)
      .map((line) => line.replace(/^[•\s]+/, "").trim())
      .filter(Boolean);
    if (lines.length < 2) continue;
    const problemLine = lines.find((line) => isProblemTitle(line)) || lines[0];
    const word =
      lines.find((line) => /^[A-Z][A-Z\s]{2,}$/.test(line) && !isProblemTitle(line)) ||
      lines.find((line) => /^[A-Z]{2,}$/.test(line)) ||
      "";
    const hindi = lines.find((line) => /[अ-ह]/.test(line)) || "";
    const writeText = (word || hindi || "").trim();
    if (!writeText) continue;
    const problems = splitProblems(problemLine);
    items.push({
      category: "switchword",
      name: writeText,
      slug: `switchword-webinar-${slugify(writeText)}`,
      problems,
      keywords: problems,
      benefits: problems,
      description: `Purpose: ${problemLine}. Write/chant: ${writeText}${hindi && hindi !== writeText ? ` / ${hindi}` : ""}.`,
      howToUse: buildSwitchHowTo({
        writeText,
        penColor: "",
        extra: hindi && hindi !== writeText ? `Script form: ${hindi}` : "",
      }),
      meta: {
        lord: "",
        penColor: "",
        purpose: problemLine,
        writeText,
        mantraOrScript: hindi || writeText,
        sourceType: "webinar",
      },
      source: "NEW VEDIC SWITCHWORD -1 - Copy (2).pdf",
    });
  }
  return items;
}

function dedupeSwitchwords(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.slug;
    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }
    const prev = map.get(key);
    map.set(key, {
      ...prev,
      problems: unique([...(prev.problems || []), ...(item.problems || [])]),
      keywords: unique([...(prev.keywords || []), ...(item.keywords || [])]),
      benefits: unique([...(prev.benefits || []), ...(item.benefits || [])]),
      description: (item.description || "").length > (prev.description || "").length ? item.description : prev.description,
    });
  }
  return [...map.values()];
}

function buildSearchText(item) {
  return [
    item.name,
    item.category,
    ...(item.problems || []),
    ...(item.keywords || []),
    ...(item.benefits || []),
    item.description,
    item.howToUse,
    JSON.stringify(item.meta || {}),
  ]
    .join(" ")
    .toLowerCase();
}

function loadRudraksha(rudrakshaSeed) {
  return rudrakshaSeed.map((item) => ({
    category: "rudraksha",
    name: item.name,
    slug: `rudraksha-${item.mukhi}-mukhi`,
    problems: item.problems,
    keywords: item.problems,
    benefits: item.problems,
    description: `${item.name} is ruled by ${item.rulingGod}, associated with ${item.chakra} and planet ${item.rulingPlanet}.`,
    howToUse: `Chant beeja mantra: ${item.beejaMantra}. Wear or keep as guided by your consultant.`,
    meta: {
      mukhi: item.mukhi,
      rulingGod: item.rulingGod,
      chakra: item.chakra,
      rulingPlanet: item.rulingPlanet,
      beejaMantra: item.beejaMantra,
    },
    source: "Rudrakash Course.pdf",
  }));
}

function buildAllRemedies() {
  const extractedDir = path.join(__dirname, "..", "..", "alldata", "_extracted");
  const crystalsText = fs.readFileSync(
    path.join(extractedDir, "Healing_Properties_of_Crystals.pdf.txt"),
    "utf8"
  );
  const switchText = fs.readFileSync(
    path.join(extractedDir, "pdf_vedic_new_switchword.pdf.txt"),
    "utf8"
  );
  const webinarText = fs.readFileSync(
    path.join(extractedDir, "NEW_VEDIC_SWITCHWORD_-1_-_Copy_2_.pdf.txt"),
    "utf8"
  );
  const rudrakshaSeed = require("./rudrakshaSeed");

  const all = [
    ...loadRudraksha(rudrakshaSeed),
    ...parseCrystals(crystalsText),
    ...parseSwitchwordBlocks(switchText),
    ...parseWebinarSwitchwords(webinarText),
  ].map((item) => ({
    ...item,
    problems: unique(item.problems || []),
    keywords: unique(item.keywords || []),
    benefits: unique(item.benefits || []),
    searchText: buildSearchText(item),
  }));

  return all;
}

module.exports = {
  buildAllRemedies,
  slugify,
  unique,
  buildSearchText,
};
