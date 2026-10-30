const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "storage", "data", "store_pages.json");
const j = JSON.parse(fs.readFileSync(file, "utf8"));
const doc = (j.docs || []).find((d) => d.slug === "home-screen-to-space");
if (!doc) {
  console.error("home-screen-to-space not found");
  process.exit(1);
}

const c = JSON.parse(doc.content);
c.items = (c.items || []).map((i) => {
  const slug = String(i.categorySlug || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^shop\//, "");
  return {
    ...i,
    categorySlug: slug,
    categoryHref: slug ? `/shop/${slug}` : "/shop",
  };
});

doc.content = JSON.stringify(c);
doc.updatedAt = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(j));
console.log(JSON.stringify(c.items, null, 2));
