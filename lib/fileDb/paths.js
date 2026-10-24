const path = require("path");
const fs = require("fs");

const STORAGE_ROOT = path.join(__dirname, "..", "..", "storage");
const DATA_DIR = path.join(STORAGE_ROOT, "data");
const IMAGES_DIR = path.join(STORAGE_ROOT, "images");

const IMAGE_SUBDIRS = [
  "products",
  "banners",
  "featured",
  "testimonials",
  "reels",
  "logo",
  "about",
  "blogs",
  "categories",
  "zodiac",
  "misc",
];

function ensureStorageLayout() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const sub of IMAGE_SUBDIRS) {
    fs.mkdirSync(path.join(IMAGES_DIR, sub), { recursive: true });
  }
  // Legacy path used by existing URL contracts (/uploads/...)
  const legacyUploads = path.join(__dirname, "..", "..", "uploads");
  for (const sub of IMAGE_SUBDIRS) {
    fs.mkdirSync(path.join(legacyUploads, sub), { recursive: true });
  }
}

function dataFile(collectionName) {
  return path.join(DATA_DIR, `${collectionName}.json`);
}

function imagesPath(...parts) {
  return path.join(IMAGES_DIR, ...parts);
}

module.exports = {
  STORAGE_ROOT,
  DATA_DIR,
  IMAGES_DIR,
  IMAGE_SUBDIRS,
  ensureStorageLayout,
  dataFile,
  imagesPath,
};
