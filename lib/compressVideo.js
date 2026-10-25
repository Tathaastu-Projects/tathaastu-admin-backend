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

  try {
    // CRF 23 ≈ visually near-original; slow/medium = better compression for similar look
    await runFfmpeg([
      "-y",
      "-i",
      input,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-vf",
      "scale='min(1920,iw)':-2",
      tempOut,
    ]);

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

module.exports = {
  compressVideoFile,
  isVideoFile,
};
