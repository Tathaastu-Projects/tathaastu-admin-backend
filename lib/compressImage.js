/**
 * Resize + recompress uploaded images with sharp (WebP when possible).
 * Keeps delivery size small without changing how the storefront loads URLs.
 */
const fs = require("fs");
const path = require("path");

const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?|avif)$/i;
const SKIP_EXT = /\.(svg|gif)$/i;
/** Skip tiny already-optimized files */
const MIN_BYTES = 120 * 1024;
const MAX_EDGE = 1600;
const THUMB_EDGE = 480;

function isImageFile(filePath, mimetype) {
  if (mimetype && String(mimetype).startsWith("image/")) {
    if (/svg|gif/i.test(mimetype)) return false;
    return true;
  }
  const name = String(filePath || "");
  if (SKIP_EXT.test(name)) return false;
  return IMAGE_EXT.test(name);
}

function thumbName(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  return `${base}-thumb.webp`;
}

async function loadSharp() {
  try {
    return require("sharp");
  } catch {
    return null;
  }
}

/**
 * Compress an image on disk. Prefer WebP output (new filename) when beneficial.
 * Also writes a card thumb (`*-thumb.webp`) beside the file.
 * Returns { path, filename, size, compressed, thumbFilename }.
 */
async function writeThumb(sharp, input, outThumb) {
  await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: THUMB_EDGE,
      height: THUMB_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 72, effort: 4 })
    .toFile(outThumb);
}

async function compressImageFile(filePath, options = {}) {
  const input = path.resolve(filePath);
  if (!fs.existsSync(input)) {
    return { path: input, filename: path.basename(input), size: 0, compressed: false };
  }

  const mimetype = options.mimetype || "";
  const keepExtension = Boolean(options.keepExtension);
  if (!isImageFile(input, mimetype)) {
    const size = fs.statSync(input).size;
    return { path: input, filename: path.basename(input), size, compressed: false };
  }

  const before = fs.statSync(input).size;
  const sharp = await loadSharp();
  if (!sharp) {
    return { path: input, filename: path.basename(input), size: before, compressed: false };
  }

  const dir = path.dirname(input);
  const originalName = path.basename(input);
  const base = path.basename(originalName, path.extname(originalName));
  const outWebp = path.join(dir, `${base}.webp`);
  const outThumb = path.join(dir, `${base}-thumb.webp`);

  try {
    // Existing-file migration: keep same path/extension so CMS URLs stay valid
    if (keepExtension) {
      if (before < MIN_BYTES) {
        try {
          await writeThumb(sharp, input, outThumb);
        } catch (_e) {
          /* ignore */
        }
        return {
          path: input,
          filename: originalName,
          size: before,
          compressed: false,
          thumbFilename: fs.existsSync(outThumb) ? path.basename(outThumb) : undefined,
        };
      }
      const tmp = path.join(dir, `${base}.opt-tmp${path.extname(originalName)}`);
      const ext = path.extname(originalName).toLowerCase();
      let writer = sharp(input, { failOn: "none" }).rotate().resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });
      if (ext === ".png") writer = writer.png({ compressionLevel: 9, quality: 80 });
      else if (ext === ".webp") writer = writer.webp({ quality: 78, effort: 4 });
      else writer = writer.jpeg({ quality: 78, mozjpeg: true });
      await writer.toFile(tmp);
      const mid = fs.statSync(tmp).size;
      if (mid > 0 && mid < before) {
        fs.renameSync(tmp, input);
        try {
          await writeThumb(sharp, input, outThumb);
        } catch (_e) {
          /* ignore */
        }
        return {
          path: input,
          filename: originalName,
          size: mid,
          compressed: true,
          thumbFilename: fs.existsSync(outThumb) ? path.basename(outThumb) : undefined,
        };
      }
      try {
        fs.unlinkSync(tmp);
      } catch (_e) {
        /* ignore */
      }
      return { path: input, filename: originalName, size: before, compressed: false };
    }

    const pipeline = sharp(input, { failOn: "none" }).rotate().resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });

    await pipeline.webp({ quality: 78, effort: 4 }).toFile(outWebp);

    await writeThumb(sharp, input, outThumb);

    const after = fs.statSync(outWebp).size;
    const keepWebp = after > 0 && (after < before * 0.92 || before > MIN_BYTES);

    if (keepWebp) {
      if (path.resolve(outWebp) !== path.resolve(input) && fs.existsSync(input)) {
        try {
          fs.unlinkSync(input);
        } catch (_e) {
          /* ignore */
        }
      }
      return {
        path: outWebp,
        filename: path.basename(outWebp),
        size: after,
        compressed: true,
        thumbFilename: path.basename(outThumb),
      };
    }

    // WebP not smaller — keep original, still keep thumb if useful
    try {
      if (fs.existsSync(outWebp) && path.resolve(outWebp) !== path.resolve(input)) {
        fs.unlinkSync(outWebp);
      }
    } catch (_e) {
      /* ignore */
    }

    if (before >= MIN_BYTES) {
      // In-place recompress same format
      const tmp = path.join(dir, `${base}.opt-tmp${path.extname(originalName)}`);
      const ext = path.extname(originalName).toLowerCase();
      let writer = sharp(input, { failOn: "none" }).rotate().resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      });
      if (ext === ".png") writer = writer.png({ compressionLevel: 8, palette: true });
      else if (ext === ".webp") writer = writer.webp({ quality: 78, effort: 4 });
      else writer = writer.jpeg({ quality: 78, mozjpeg: true });
      await writer.toFile(tmp);
      const mid = fs.statSync(tmp).size;
      if (mid > 0 && mid < before) {
        fs.renameSync(tmp, input);
        return {
          path: input,
          filename: originalName,
          size: mid,
          compressed: true,
          thumbFilename: path.basename(outThumb),
        };
      }
      try {
        fs.unlinkSync(tmp);
      } catch (_e) {
        /* ignore */
      }
    }

    return {
      path: input,
      filename: originalName,
      size: fs.statSync(input).size,
      compressed: false,
      thumbFilename: fs.existsSync(outThumb) ? path.basename(outThumb) : undefined,
    };
  } catch (err) {
    console.warn("[compressImage]", originalName, err.message);
    return { path: input, filename: originalName, size: before, compressed: false };
  }
}

module.exports = {
  compressImageFile,
  isImageFile,
  thumbName,
};
