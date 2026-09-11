const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

const alldata = path.join(__dirname, "..", "..", "alldata");
const outDir = path.join(__dirname, "..", "..", "alldata", "_extracted");
fs.mkdirSync(outDir, { recursive: true });

const files = [
  "Healing_Properties_of_Crystals.pdf",
  "NEW VEDIC SWITCHWORD -1 - Copy (2).pdf",
  "Rudrakash Course.pdf",
  "pdf vedic new switchword.pdf",
];

(async () => {
  for (const file of files) {
    const full = path.join(alldata, file);
    const buf = fs.readFileSync(full);
    console.log("Parsing", file, "bytes", buf.length);
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    const text = result?.text || "";
    const pages = result?.pages?.length || result?.total || "?";
    const safe = file.replace(/[^\w.-]+/g, "_");
    const out = path.join(outDir, `${safe}.txt`);
    fs.writeFileSync(out, text, "utf8");
    console.log(" ->", out, "chars", text.length, "pages", pages);
    console.log("--- HEAD ---");
    console.log(text.slice(0, 1800));
    console.log("--- END ---\n");
    if (typeof parser.destroy === "function") await parser.destroy();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
