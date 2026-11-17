/**
 * One-time: recompress large images already on disk under uploads/.
 * Does not rewrite DB URLs when output stays same basename (.webp replaces .png/.jpg).
 *
 * Usage: node scripts/optimizeExistingImages.js
 */
const fs = require("fs");
const path = require("path");
const { compressImageFile, isImageFile } = require("../lib/compressImage");
const { mirrorToStorage } = require("../lib/storedFiles");

const uploadsRoot = path.join(__dirname, "..", "uploads");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (isImageFile(full) && !/-thumb\.webp$/i.test(name)) out.push(full);
  }
  return out;
}

async function main() {
  const files = walk(uploadsRoot);
  console.log(`Found ${files.length} images under uploads/`);
  let saved = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const file of files) {
    const before = fs.statSync(file).size;
    bytesBefore += before;
    // keepExtension: do not rename .png → .webp (would break stored URLs)
    const result = await compressImageFile(file, { keepExtension: true });
    bytesAfter += result.size || before;
    if (result.compressed) {
      saved += 1;
      const rel = path.relative(uploadsRoot, result.path);
      const subdir = path.dirname(rel).replace(/\\/g, "/");
      try {
        mirrorToStorage(subdir === "." ? "" : subdir, result.filename, result.path);
      } catch (_e) {
        /* ignore */
      }
      console.log(
        `✓ ${rel}  ${(before / 1024 / 1024).toFixed(2)}MB → ${(result.size / 1024 / 1024).toFixed(2)}MB`,
      );
    }
  }

  console.log(
    `\nDone. Compressed ${saved}/${files.length}. ` +
      `Total ${(bytesBefore / 1024 / 1024).toFixed(1)}MB → ${(bytesAfter / 1024 / 1024).toFixed(1)}MB`,
  );
  console.log(
    "Note: if a file became .webp, update any CMS/product URLs that still point at the old .png/.jpg.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
