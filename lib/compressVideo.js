/**
 * Re-encode uploaded videos with ffmpeg so admin uploads stay smaller
 * without a big quality drop (H.264 CRF 23 + web faststart).
 */
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mkv)$/i;
/** Skip tiny clips — compression overhead not worth it */
const MIN_BYTES = 1.5 * 1024 * 1024;

function isVideoFile(filePath, mimetype) {
  if (mimetype && String(mimetype).startsWith("video/")) return true;
  return VIDEO_EXT.test(String(filePath || ""));
}

function runFfmpeg(args) {
  return execFileAsync("ffmpeg", args, {
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 4 * 60 * 1000, // fail fast so upload can fall back to original file
  });
}

/**
 * Compress a video on disk in-place (replaces original when smaller).
 * Returns { path, filename, size, compressed }.
 */
async function compressVideoFile(filePath, options = {}) {
  const input = path.resolve(filePath);
  if (!fs.existsSync(input)) {
    return { path: input, filename: path.basename(input), size: 0, compressed: false };
  }

  const mimetype = options.mimetype || "";
  if (!isVideoFile(input, mimetype)) {
    const size = fs.statSync(input).size;
    return { path: input, filename: path.basename(input), size, compressed: false };
  }

  const before = fs.statSync(input).size;
  if (before < MIN_BYTES) {
    return { path: input, filename: path.basename(input), size: before, compressed: false };
  }

  const dir = path.dirname(input);
  const base = path.basename(input, path.extname(input));
  const tempOut = path.join(dir, `${base}.opt-${process.pid}.mp4`);
  const finalOut = path.join(dir, `${base}.mp4`);

  // Hero / banner background clips: smaller + no audio (storefront is always muted)
  const isHeroLike = /[\\/](hero|banners|featured|testimonials|reels)[\\/]/i.test(input);
  const maxWidth = isHeroLike ? 1280 : 1920;
  const crf = isHeroLike ? "28" : "23";

  try {
    const args = [
      "-y",
      "-i",
      input,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      crf,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-vf",
      `scale='min(${maxWidth},iw)':-2`,
    ];
    if (isHeroLike) {
      args.push("-an"); // drop audio — hero loops muted
    } else {
      args.push("-c:a", "aac", "-b:a", "128k");
    }
    args.push(tempOut);
    await runFfmpeg(args);

    if (!fs.existsSync(tempOut)) {
      return { path: input, filename: path.basename(input), size: before, compressed: false };
    }

    const after = fs.statSync(tempOut).size;
    // Keep original if compression did not help (or barely helped)
    if (after >= before * 0.95) {
      fs.unlinkSync(tempOut);
      return { path: input, filename: path.basename(input), size: before, compressed: false };
    }

    // Replace original with optimized mp4
    if (fs.existsSync(input) && path.resolve(input) !== path.resolve(finalOut)) {
      fs.unlinkSync(input);
    }
    if (fs.existsSync(finalOut) && path.resolve(finalOut) !== path.resolve(tempOut)) {
      fs.unlinkSync(finalOut);
    }
    fs.renameSync(tempOut, finalOut);

    console.log(
      `[compressVideo] ${path.basename(input)} ${(before / 1024 / 1024).toFixed(1)}MB → ${(after / 1024 / 1024).toFixed(1)}MB`
    );

    return {
      path: finalOut,
      filename: path.basename(finalOut),
      size: after,
      compressed: true,
      before,
      after,
    };
  } catch (err) {
    console.warn("[compressVideo] skipped:", err.message);
    try {
      if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
    } catch (_e) {
      /* ignore */
    }
    return { path: input, filename: path.basename(input), size: before, compressed: false };
  }
}

/**
 * Grab a JPEG poster frame (~1s in) for instant hero paint while MP4 buffers.
 * Returns absolute path of written .jpg or null.
 */
async function extractVideoPoster(filePath) {
  const input = path.resolve(filePath);
  if (!fs.existsSync(input) || !isVideoFile(input)) return null;
  const dir = path.dirname(input);
  const base = path.basename(input, path.extname(input));
  const out = path.join(dir, `${base}-poster.jpg`);
  try {
    await runFfmpeg([
      "-y",
      "-ss",
      "0.8",
      "-i",
      input,
      "-frames:v",
      "1",
      "-q:v",
      "5",
      "-vf",
      "scale='min(1280,iw)':-2",
      out,
    ]);
    if (!fs.existsSync(out) || fs.statSync(out).size < 500) {
      try {
        fs.unlinkSync(out);
      } catch (_e) {
        /* ignore */
      }
      return null;
    }
    return out;
  } catch (err) {
    console.warn("[compressVideo] poster extract skipped:", err.message);
    try {
      if (fs.existsSync(out)) fs.unlinkSync(out);
    } catch (_e) {
      /* ignore */
    }
    return null;
  }
}

module.exports = {
  compressVideoFile,
  isVideoFile,
  extractVideoPoster,
};
