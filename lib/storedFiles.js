const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");

let sharp = null;
try {
  sharp = require("sharp");
} catch (_error) {
  sharp = null;
}

const BUCKET = "uploads";

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

function bucket() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
  return new GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
}

function mimeFor(filename, fallback) {
  return fallback || MIME[path.extname(filename).toLowerCase()] || "application/octet-stream";
}

function saveLocalFile(filename, filePath, contentType) {
  return new Promise((resolve, reject) => {
    const files = bucket();
    if (!files) {
      reject(new Error("MongoDB is not connected"));
      return;
    }
    const upload = files.openUploadStream(filename, {
      contentType: mimeFor(filename, contentType),
    });
    fs.createReadStream(filePath)
      .pipe(upload)
      .on("error", reject)
      .on("finish", () => resolve(upload.id));
  });
}

async function hasStoredFile(filename) {
  const files = bucket();
  if (!files || !filename) return false;
  const found = await files.find({ filename }).limit(1).toArray();
  return found.length > 0;
}

async function deleteStoredFile(filename) {
  const files = bucket();
  if (!files || !filename) return;
  const matches = await files.find({ filename }).toArray();
  for (const file of matches) {
    await files.delete(file._id);
  }
}

function readGridFile(fileId) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    bucket()
      .openDownloadStream(fileId)
      .on("data", (chunk) => chunks.push(chunk))
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function compressedImage(file) {
  const type = file.contentType || mimeFor(file.filename);
  if (!sharp || !type.startsWith("image/") || type.includes("svg")) return null;
  if (file.length < 350 * 1024) return null;
  const cacheDir = path.join(__dirname, "..", "uploads", ".cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const out = path.join(cacheDir, `${file._id}.webp`);
  if (!fs.existsSync(out)) {
    const source = await readGridFile(file._id);
    await sharp(source).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 72 }).toFile(out);
  }
  return out;
}

async function streamStoredFile(filename, req, res, subpath) {
  const files = bucket();
  if (!files || !filename) return false;
  const [file] = await files.find({ filename }).limit(1).toArray();
  if (!file) return false;

  const size = file.length;
  const type = file.contentType || mimeFor(filename);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  // Asynchronously cache downloaded file to local disk for fast subsequent requests
  try {
    const uploadsDir = path.join(__dirname, "..", "uploads");
    const localTarget = subpath
      ? path.join(uploadsDir, subpath.replace(/^\/+/, ""))
      : path.join(uploadsDir, ".cache", filename);

    if (!fs.existsSync(localTarget)) {
      fs.mkdirSync(path.dirname(localTarget), { recursive: true });
      const tempPath = `${localTarget}.${Date.now()}.tmp`;
      files.openDownloadStream(file._id)
        .pipe(fs.createWriteStream(tempPath))
        .on("finish", () => {
          try {
            fs.renameSync(tempPath, localTarget);
          } catch (_e) {}
        })
        .on("error", () => {
          try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          } catch (_e) {}
        });
    }
  } catch (_e) {}

  if (req.method === "GET" && !req.headers.range) {
    try {
      const optimized = await compressedImage(file);
      if (optimized) {
        const body = fs.readFileSync(optimized);
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Content-Length", body.length);
        res.end(body);
        return true;
      }
    } catch (error) {
      console.error("Image compress failed:", error.message);
    }
  }

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", type);

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.status(416).end();
      return true;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : size - 1;
    if (start >= size || end >= size || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
      return true;
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", end - start + 1);
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    files.openDownloadStream(file._id, { start, end: end + 1 }).pipe(res);
    return true;
  }

  res.setHeader("Content-Length", size);
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  files.openDownloadStream(file._id).pipe(res);
  return true;
}

async function importUploadFolder(dir) {
  if (!fs.existsSync(dir)) return 0;
  let added = 0;
  const names = fs.readdirSync(dir);
  for (const name of names) {
    const full = path.join(dir, name);
    if (!fs.statSync(full).isFile()) continue;
    const files = bucket();
    if (!files) continue;
    const diskSize = fs.statSync(full).size;
    const [existing] = await files.find({ filename: name }).limit(1).toArray();
    if (existing && existing.length === diskSize) continue;
    if (existing) {
      await deleteStoredFile(name);
    }
    await saveLocalFile(name, full);
    added += 1;
    console.log(`Stored in MongoDB: ${name} (${(diskSize / 1024 / 1024).toFixed(2)} MB)`);
  }
  return added;
}

module.exports = {
  saveLocalFile,
  hasStoredFile,
  deleteStoredFile,
  streamStoredFile,
  importUploadFolder,
};
