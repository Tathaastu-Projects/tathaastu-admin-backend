const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

(async () => {
  const file = path.join(__dirname, "..", "..", "alldata", "Rudrakash Course.pdf");
  const outDir = path.join(__dirname, "..", "..", "alldata", "_extracted", "rudraksha_pages");
  fs.mkdirSync(outDir, { recursive: true });
  const buf = fs.readFileSync(file);
  const parser = new PDFParse({ data: buf });
  const info = await parser.getInfo();
  console.log("total pages", info.total, "outline", info.outline?.length);
  const shots = await parser.getScreenshot({ scale: 2 });
  console.log("screenshots", shots.total, shots.pages?.length);
  for (const page of shots.pages || []) {
    const dest = path.join(outDir, `page-${page.pageNumber}.png`);
    fs.writeFileSync(dest, Buffer.from(page.data));
    console.log("wrote", dest, page.width, page.height);
  }
  if (typeof parser.destroy === "function") await parser.destroy();
})().catch(console.error);
