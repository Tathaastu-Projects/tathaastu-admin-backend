const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

(async () => {
  const file = path.join(__dirname, "..", "..", "alldata", "Rudrakash Course.pdf");
  const buf = fs.readFileSync(file);
  const parser = new PDFParse({ data: buf });
  const info = await parser.getInfo?.().catch?.(() => null);
  const screenshots = await parser.getScreenshot?.({ scale: 1 }).catch?.((e) => ({ error: String(e) }));
  console.log("info keys", info && Object.keys(info));
  console.log("screenshot type", typeof screenshots, screenshots && Object.keys(screenshots));
  if (screenshots?.pages) console.log("pages", screenshots.pages.length, screenshots.pages[0] && Object.keys(screenshots.pages[0]));
  if (screenshots?.error) console.log("ss error", screenshots.error);
  // try getImage
  const images = await parser.getImage?.().catch?.((e) => ({ error: String(e) }));
  console.log("images", images && (images.error || Object.keys(images)));
  if (typeof parser.destroy === "function") await parser.destroy();
})().catch(console.error);
