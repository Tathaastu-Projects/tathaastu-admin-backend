const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");

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

async function streamStoredFile(filename, req, res) {
  const files = bucket();
  if (!files || !filename) return false;
  const [file] = await files.find({ filename }).limit(1).toArray();
  if (!file) return false;

  const size = file.length;
  const type = file.contentType || mimeFor(filename);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "public, max-age=86400");

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
    if (await hasStoredFile(name)) continue;
    await saveLocalFile(name, full);
    added += 1;
    console.log(`Stored in MongoDB: ${name}`);
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
