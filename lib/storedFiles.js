/**
 * Local disk media helpers.
 * Images/videos live under uploads/ (and mirrored under storage/images).
 * No MongoDB / GridFS — everything is file-based.
 */
const fs = require("fs");
const path = require("path");
const { IMAGES_DIR, ensureStorageLayout } = require("./fileDb/paths");

ensureStorageLayout();

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

function mimeFor(filename, fallback) {
  return fallback || MIME[path.extname(filename).toLowerCase()] || "application/octet-stream";
}

function mirrorToStorage(relativeSubdir, filename, filePath) {
  try {
    const destDir = path.join(IMAGES_DIR, relativeSubdir || "misc");
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, filename);
    if (path.resolve(filePath) !== path.resolve(dest)) {
      fs.copyFileSync(filePath, dest);
    }
  } catch (err) {
    console.warn("[storedFiles] mirror failed:", err.message);
  }
}

/** @deprecated No-op compatibility — files stay on local disk only */
async function saveLocalFile(filename, filePath, contentType, relativeSubdir = "misc") {
  if (filename && filePath && fs.existsSync(filePath)) {
    mirrorToStorage(relativeSubdir, filename, filePath);
  }
  return filename;
}

async function hasStoredFile(filename) {
  if (!filename) return false;
  const uploadsRoot = path.join(__dirname, "..", "uploads");
  // Search common folders
  const dirs = ["", "products", "banners", "featured", "testimonials", "reels", "logo", "misc"];
  for (const dir of dirs) {
    const full = path.join(uploadsRoot, dir, filename);
    if (fs.existsSync(full)) return true;
    const mirrored = path.join(IMAGES_DIR, dir || "misc", filename);
    if (fs.existsSync(mirrored)) return true;
  }
  return false;
}

async function deleteStoredFile(filename) {
  if (!filename) return;
  const uploadsRoot = path.join(__dirname, "..", "uploads");
  const dirs = ["", "products", "banners", "featured", "testimonials", "reels", "logo", "misc"];
  for (const dir of dirs) {
    for (const root of [uploadsRoot, IMAGES_DIR]) {
      const full = path.join(root, dir || (root === IMAGES_DIR ? "misc" : ""), filename);
      if (fs.existsSync(full)) {
        try {
          fs.unlinkSync(full);
        } catch (_e) {
          /* ignore */
        }
      }
    }
  }
}

/** Delete a media file by public URL like `/uploads/products/abc.jpg` (disk + storage mirror). */
async function deleteUploadByUrl(fileUrl) {
  const raw = String(fileUrl || "").trim();
  if (!raw.startsWith("/uploads/")) return;
  const relative = raw.replace(/^\/+/, ""); // uploads/...
  const uploadsRoot = path.join(__dirname, "..");
  const diskPath = path.join(uploadsRoot, relative);
  if (fs.existsSync(diskPath)) {
    try {
      fs.unlinkSync(diskPath);
    } catch (_e) {
      /* ignore */
    }
  }
  // Mirror under storage/images/<subdir>/<filename>
  const parts = relative.split(/[/\\]/).filter(Boolean); // ["uploads", "products", "file.jpg"]
  if (parts.length >= 3 && parts[0] === "uploads") {
    const mirror = path.join(IMAGES_DIR, ...parts.slice(1));
    if (fs.existsSync(mirror)) {
      try {
        fs.unlinkSync(mirror);
      } catch (_e) {
        /* ignore */
      }
    }
  }
  await deleteStoredFile(path.basename(raw));
}

/** GridFS fallback removed — express.static serves /uploads */
async function streamStoredFile() {
  return false;
}

async function importUploadFolder() {
  return 0;
}

module.exports = {
  saveLocalFile,
  hasStoredFile,
  deleteStoredFile,
  deleteUploadByUrl,
  streamStoredFile,
  importUploadFolder,
  mimeFor,
  mirrorToStorage,
};
