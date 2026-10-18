const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { saveLocalFile, deleteStoredFile } = require("../lib/storedFiles");

const uploadRoot = path.join(__dirname, "..", "uploads", "products");
fs.mkdirSync(uploadRoot, { recursive: true });

function mongoDiskStorage(rootDir) {
  return {
    _handleFile(_req, file, cb) {
      fs.mkdirSync(rootDir, { recursive: true });
      const safe = String(file.originalname || "file")
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, "-");
      const filename = `${Date.now()}-${safe}`;
      const fullPath = path.join(rootDir, filename);
      const out = fs.createWriteStream(fullPath);
      file.stream.pipe(out);
      out.on("error", cb);
      out.on("finish", () => {
        saveLocalFile(filename, fullPath, file.mimetype)
          .then(() => {
            cb(null, {
              destination: rootDir,
              filename,
              path: fullPath,
              size: out.bytesWritten,
            });
          })
          .catch((error) => {
            fs.unlink(fullPath, () => {});
            cb(error);
          });
      });
    },
    _removeFile(_req, file, cb) {
      if (file.path) fs.unlink(file.path, () => {});
      deleteStoredFile(file.filename)
        .catch(() => {})
        .finally(() => cb(null));
    },
  };
}

const storage = mongoDiskStorage(uploadRoot);

function fileFilter(_req, file, cb) {
  if (!file.mimetype?.startsWith("image/")) {
    return cb(new Error("Only image uploads are allowed"));
  }
  cb(null, true);
}

const uploadProductImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
});

const bannerRoot = path.join(__dirname, "..", "uploads", "banners");
fs.mkdirSync(bannerRoot, { recursive: true });

const bannerStorage = mongoDiskStorage(bannerRoot);

function bannerFileFilter(_req, file, cb) {
  const name = String(file.originalname || "");
  const image = file.mimetype?.startsWith("image/") || /\.svg$/i.test(name);
  if (!image) return cb(new Error("Only image uploads are allowed"));
  cb(null, true);
}

const uploadBannerImage = multer({
  storage: bannerStorage,
  fileFilter: bannerFileFilter,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

const featuredRoot = path.join(__dirname, "..", "uploads", "featured");
fs.mkdirSync(featuredRoot, { recursive: true });

const featuredStorage = mongoDiskStorage(featuredRoot);

function featuredFileFilter(_req, file, cb) {
  const name = String(file.originalname || "");
  const image = file.mimetype?.startsWith("image/") || /\.svg$/i.test(name);
  const video = file.mimetype?.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(name);
  if (!image && !video) return cb(new Error("Upload an image or a video"));
  cb(null, true);
}

const uploadFeaturedMedia = multer({
  storage: featuredStorage,
  fileFilter: featuredFileFilter,
  limits: { fileSize: 40 * 1024 * 1024, files: 2 },
});

module.exports = {
  uploadProductImages,
  uploadBannerImage,
  uploadFeaturedMedia,
  uploadRoot,
  bannerRoot,
  featuredRoot,
};
