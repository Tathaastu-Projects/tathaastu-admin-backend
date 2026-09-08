const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const TEMPLATE_PATH = path.join(__dirname, "..", "assets", "ppt-template", "tathasstu-template.pptx");

const DEFAULT_DOSHAS = [
  { label: "Kaal sarp dosh", value: "", note: "" },
  { label: "Mangal Dosh", value: "", note: "" },
  { label: "Pitra Dosh", value: "", note: "" },
  { label: "Bandhan yog", value: "", note: "" },
  { label: "Pishach yog", value: "", note: "" },
  { label: "Tona totka", value: "", note: "" },
  { label: "Nazar dosh", value: "", note: "" },
  { label: "Positivity", value: "", note: "" },
];

const DEFAULT_PLANETS = [
  { name: "Sun", strength: "", remedy: "" },
  { name: "Moon", strength: "", remedy: "" },
  { name: "Mercury", strength: "", remedy: "" },
  { name: "Venus", strength: "", remedy: "" },
  { name: "Jupiter", strength: "", remedy: "" },
  { name: "Saturn", strength: "", remedy: "" },
  { name: "Rahu", strength: "", remedy: "" },
  { name: "Ketu", strength: "", remedy: "" },
  { name: "Mangal", strength: "", remedy: "" },
];

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatReadingDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getDate()).padStart(2, "0")}/${months[date.getMonth()]}/${date.getFullYear()}`;
}

function formatDisplayDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function toLines(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-•]\s+/, "").trim())
    .filter(Boolean);
}

function chunk(items, size) {
  const groups = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups.length ? groups : [[]];
}

function extractParagraphs(bodyXml) {
  return bodyXml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || [];
}

function firstMatch(xml, patterns) {
  if (!xml) return "";
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[0];
  }
  return "";
}

function contentTemplates(bodyXml) {
  const paragraphs = extractParagraphs(bodyXml);
  const withRuns = paragraphs.filter((item) => /<a:r\b/.test(item) && /<a:t\b/.test(item));
  return withRuns.length ? withRuns : paragraphs;
}

function applyTextToParagraph(pXml, text) {
  const safe = escapeXml(text || " ");
  const pPr = firstMatch(pXml, [/<a:pPr\b[^>]*\/>/, /<a:pPr\b[\s\S]*?<\/a:pPr>/]);
  const endPara = firstMatch(pXml, [/<a:endParaRPr\b[^>]*\/>/, /<a:endParaRPr\b[\s\S]*?<\/a:endParaRPr>/]);
  const firstRun = firstMatch(pXml, [/<a:r\b[\s\S]*?<\/a:r>/]);

  if (firstRun) {
    const nextText = `<a:t xml:space="preserve">${safe}</a:t>`;
    const run = /<a:t\b/.test(firstRun)
      ? firstRun.replace(/<a:t\b[^>]*>[\s\S]*?<\/a:t>/, nextText)
      : firstRun.replace(/<\/a:r>/, `${nextText}</a:r>`);
    return `<a:p>${pPr}${run}${endPara}</a:p>`;
  }

  const rPr = endPara ? endPara.replace(/endParaRPr/g, "rPr") : `<a:rPr lang="en-IN" dirty="0"/>`;
  return `<a:p>${pPr}<a:r>${rPr}<a:t xml:space="preserve">${safe}</a:t></a:r>${endPara}</a:p>`;
}

function isWellFormedXml(xml) {
  const tags = xml.match(/<\/?[A-Za-z0-9:_-]+(?:\s[^<>]*?)?>/g) || [];
  const stack = [];
  for (const raw of tags) {
    if (raw.startsWith("<?") || raw.startsWith("<!")) continue;
    if (raw.endsWith("/>")) continue;
    if (raw.startsWith("</")) {
      const name = raw.slice(2, -1).trim();
      if (stack.pop() !== name) return false;
      continue;
    }
    const name = raw.slice(1).split(/[\s>]/)[0];
    stack.push(name);
  }
  return stack.length === 0;
}

function fillLargestTxBody(xml, lines) {
  const matches = [...xml.matchAll(/<p:txBody>[\s\S]*?<\/p:txBody>/g)];
  if (!matches.length) return xml;
  const best = matches.reduce((max, item) => (item[0].length > max[0].length ? item : max));
  const body = best[0];
  const templates = contentTemplates(body);
  if (!templates.length) return xml;

  const safeLines = lines.length ? lines : [" "];
  const newParas = safeLines.map((line, index) =>
    applyTextToParagraph(templates[Math.min(index, templates.length - 1)], line)
  );

  const start = body.search(/<a:p\b/);
  const end = body.lastIndexOf("</a:p>");
  if (start === -1 || end === -1) return xml;
  const rebuilt = body.slice(0, start) + newParas.join("") + body.slice(end + 6);
  const nextXml = xml.slice(0, best.index) + rebuilt + xml.slice(best.index + body.length);
  return isWellFormedXml(nextXml) ? nextXml : xml;
}

function replaceTitleText(xml, searchPrefix, newTitle) {
  return xml.replace(
    new RegExp(`(<a:t>)${searchPrefix}[^<]*(</a:t>)`),
    `$1${escapeXml(newTitle)}$2`
  );
}

function normalizeData(data = {}) {
  const clientInfo = data.clientInfo || {};
  const queryInfo = data.queryInfo || {};
  const kundli = data.kundli || {};
  const problems = toLines(queryInfo.problems);
  const predictions = toLines(data.predictions || data.solutionInfo?.recommendations);
  const scannerUpay = toLines(data.scannerUpay || data.solutionInfo?.notes);
  const kundliUpay = toLines(data.kundliUpay || data.solutionInfo?.recommendations);

  return {
    clientInfo: {
      name: clientInfo.name || "Client",
      email: clientInfo.email || "",
      phone: clientInfo.phone || "",
      dateOfBirth: clientInfo.dateOfBirth || "",
      placeOfBirth: clientInfo.placeOfBirth || "",
      timeOfBirth: clientInfo.timeOfBirth || "",
    },
    queryInfo: {
      queryType: queryInfo.queryType || "Astrology",
      date: queryInfo.date || "",
      problems,
    },
    scannerReading: {
      readingDate: data.scannerReading?.readingDate || queryInfo.date || "",
      doshas: (data.scannerReading?.doshas?.length ? data.scannerReading.doshas : DEFAULT_DOSHAS).map((item, index) => ({
        ...(DEFAULT_DOSHAS[index] || {}),
        ...item,
      })),
      planets: (data.scannerReading?.planets?.length ? data.scannerReading.planets : DEFAULT_PLANETS).map((item, index) => ({
        ...(DEFAULT_PLANETS[index] || {}),
        ...item,
      })),
    },
    scannerUpay,
    kundli: {
      lagan: kundli.lagan || "",
      rashi: kundli.rashi || "",
      dasha: kundli.dasha || "",
      shaniSadeSatti: kundli.shaniSadeSatti || "",
      personalityNotes: kundli.personalityNotes || "",
      rinNotes: kundli.rinNotes || "",
    },
    predictions,
    kundliUpay,
  };
}

async function updateSlide(zip, slideName, updater) {
  const file = zip.file(`ppt/slides/${slideName}`);
  if (!file) return;
  const xml = await file.async("string");
  zip.file(`ppt/slides/${slideName}`, updater(xml));
}

async function buildSolutionPPT(queryId, rawData) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error("Tathasstu PPT template is missing");
  }

  const data = normalizeData(rawData);
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE_PATH));

  const profileLines = [
    `Name – ${data.clientInfo.name}`,
    `Date of birth – ${formatDisplayDate(data.clientInfo.dateOfBirth)}`,
    `Birth of place – ${data.clientInfo.placeOfBirth || "N/A"}`,
    `Birth time – ${data.clientInfo.timeOfBirth || "N/A"}`,
    `Issue – ${data.queryInfo.problems.join(", ") || "N/A"}`,
  ];

  const readingLines = [
    ...data.scannerReading.doshas.map((item) => {
      const value = item.value ? ` – ${item.value}` : "";
      const note = item.note ? `, ${item.note}` : "";
      return `${item.label}${value}${note}`.trim();
    }),
    ...data.scannerReading.planets
      .filter((item) => item.strength || item.remedy)
      .map((item) => {
        const strength = item.strength ? ` – ${item.strength}` : "";
        const remedy = item.remedy ? ` – ${item.remedy}` : "";
        return `${item.name}${strength}${remedy}`;
      }),
  ];

  const kundliLines = [
    data.kundli.lagan ? `Lagan – ${data.kundli.lagan}` : null,
    data.kundli.rashi ? `Rashi – ${data.kundli.rashi}` : null,
    data.kundli.dasha ? `Dasha – ${data.kundli.dasha}` : null,
    data.kundli.shaniSadeSatti ? `Shani ki sade Satti – ${data.kundli.shaniSadeSatti}` : null,
    data.kundli.personalityNotes || null,
    data.kundli.rinNotes || null,
  ].filter(Boolean);

  const predictionGroups = chunk(data.predictions.length ? data.predictions : ["Predictions to be added."], 12);
  const scannerUpay = data.scannerUpay.length ? data.scannerUpay : ["Details to be added."];
  const kundliUpay = data.kundliUpay.length ? data.kundliUpay : ["Details to be added."];

  await updateSlide(zip, "slide3.xml", (xml) => fillLargestTxBody(xml, profileLines));
  await updateSlide(zip, "slide4.xml", (xml) => {
    const withTitle = replaceTitleText(
      xml,
      "Reading on ",
      `Reading on ${formatReadingDate(data.scannerReading.readingDate) || "consultation date"}`
    );
    return fillLargestTxBody(withTitle, readingLines.length ? readingLines : ["Details to be added."]);
  });
  await updateSlide(zip, "slide5.xml", (xml) => fillLargestTxBody(xml, scannerUpay));
  await updateSlide(zip, "slide7.xml", (xml) =>
    fillLargestTxBody(xml, kundliLines.length ? kundliLines : ["Kundli details to be added."])
  );
  await updateSlide(zip, "slide8.xml", (xml) => fillLargestTxBody(xml, predictionGroups[0]));
  await updateSlide(zip, "slide9.xml", (xml) =>
    fillLargestTxBody(xml, predictionGroups[1] && predictionGroups[1].length ? predictionGroups[1] : [" "])
  );
  await updateSlide(zip, "slide10.xml", (xml) => fillLargestTxBody(xml, kundliUpay));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

module.exports = {
  buildSolutionPPT,
  DEFAULT_DOSHAS,
  DEFAULT_PLANETS,
};
