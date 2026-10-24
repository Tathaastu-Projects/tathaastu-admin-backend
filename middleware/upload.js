const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { mirrorToStorage } = require("../lib/storedFiles");
const { ensureStorageLayout } = require("../lib/fileDb/paths");
const { compressVideoFile, isVideoFile } = require("../lib/compressVideo");

ensureStorageLayout();

function diskStorage(rootDir, storageSubdir) {
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
        const finishUpload = (finalPath, finalName, finalSize) => {
          try {
            mirrorToStorage(storageSubdir, finalName, finalPath);
          } catch (_e) {
            /* ignore mirror errors */
          }
          cb(null, {
            destination: rootDir,
            filename: finalName,
            path: finalPath,
            size: finalSize,
          });
        };

        // Auto-compress videos after upload (smaller file, near-same quality)
        if (isVideoFile(fullPath, file.mimetype)) {
          compressVideoFile(fullPath, { mimetype: file.mimetype })
            .then((result) => {
              finishUpload(result.path, result.filename, result.size || out.bytesWritten);
            })
            .catch(() => {
              finishUpload(fullPath, filename, out.bytesWritten);
            });
          return;
        }

        finishUpload(fullPath, filename, out.bytesWritten);
      });
    },
    _removeFile(_req, file, cb) {
      if (file.path) fs.unlink(file.path, () => {});
      cb(null);
    },
  };
}

const uploadRoot = path.join(__dirname, "..", "uploads", "products");
fs.mkdirSync(uploadRoot, { recursive: true });
const storage = diskStorage(uploadRoot, "products");

function fileFilter(_req, file, cb) {
  if (!file.mimetype?.startsWith("image/")) {
    return cb(new Error("Only image uploads are allowed"));
  }
  cb(null, true);
}

const uploadProductImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
});

const bannerRoot = path.join(__dirname, "..", "uploads", "banners");
fs.mkdirSync(bannerRoot, { recursive: true });
const bannerStorage = diskStorage(bannerRoot, "banners");

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

const uploadTestimonialImages = multer({
  storage: bannerStorage,
  fileFilter: bannerFileFilter,
  limits: { fileSize: 8 * 1024 * 1024, files: 20 },
});

const featuredRoot = path.join(__dirname, "..", "uploads", "featured");
fs.mkdirSync(featuredRoot, { recursive: true });
const featuredStorage = diskStorage(featuredRoot, "featured");

function featuredFileFilter(_req, file, cb) {
  const name = String(file.originalname || "");
  const image = file.mimetype?.startsWith("image/") || /\.svg$/i.test(name);
  const video = file.mimetype?.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(name);
  if (!image && !video) return cb(new Error("Upload an image or a video"));
  cb(null, true);
}

// Higher upload ceiling — files are auto-compressed after save
const VIDEO_UPLOAD_MAX = 120 * 1024 * 1024; // 120 MB

const uploadFeaturedMedia = multer({
  storage: featuredStorage,
  fileFilter: featuredFileFilter,
  limits: { fileSize: VIDEO_UPLOAD_MAX, files: 2 },
});

const reelsRoot = path.join(__dirname, "..", "uploads", "reels");
fs.mkdirSync(reelsRoot, { recursive: true });
const reelsStorage = diskStorage(reelsRoot, "reels");

const uploadReelsMedia = multer({
  storage: reelsStorage,
  fileFilter: featuredFileFilter,
  limits: { fileSize: VIDEO_UPLOAD_MAX, files: 5 },
});

const aboutRoot = path.join(__dirname, "..", "uploads", "about");
fs.mkdirSync(aboutRoot, { recursive: true });
const aboutStorage = diskStorage(aboutRoot, "about");

const uploadAboutMedia = multer({
  storage: aboutStorage,
  fileFilter: featuredFileFilter,
  limits: { fileSize: VIDEO_UPLOAD_MAX, files: 2 },
});

const blogsRoot = path.join(__dirname, "..", "uploads", "blogs");
fs.mkdirSync(blogsRoot, { recursive: true });
const blogsStorage = diskStorage(blogsRoot, "blogs");

const uploadBlogMedia = multer({
  storage: blogsStorage,
  fileFilter: featuredFileFilter,
  limits: { fileSize: VIDEO_UPLOAD_MAX, files: 20 },
});

module.exports = {
  uploadProductImages,
  uploadBannerImage,
  uploadTestimonialImages,
  uploadFeaturedMedia,
  uploadReelsMedia,
  uploadAboutMedia,
  uploadBlogMedia,
  uploadRoot,
  bannerRoot,
  featuredRoot,
  reelsRoot,
  aboutRoot,
  blogsRoot,
};
