const fs = require("fs");
const path = require("path");
const { dataFile, ensureStorageLayout } = require("./paths");

ensureStorageLayout();

/** @type {Map<string, Promise<void>>} */
const locks = new Map();

/** In-memory snapshot cache — avoids re-reading disk + serializing every concurrent GET. */
/** @type {Map<string, { docs: object[], version: number }>} */
const memory = new Map();
let globalVersion = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cross-process lock so 3 devices / multiple Node workers cannot corrupt the same JSON file.
 * Uses exclusive file create (`wx`) — works on Windows + Linux.
 */
async function withDiskLock(name, fn) {
  const lockPath = `${dataFile(name)}.lock`;
  const maxAttempts = 80; // ~4–6s of retries
  let fd = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, `${process.pid} ${Date.now()}\n`, "utf8");
      break;
    } catch (err) {
      if (err && (err.code === "EEXIST" || err.code === "EPERM")) {
        // Stale lock older than 30s → steal (crashed process)
        try {
          const st = fs.statSync(lockPath);
          if (Date.now() - st.mtimeMs > 30_000) {
            try {
              fs.unlinkSync(lockPath);
            } catch (_e) {
              /* ignore */
            }
            continue;
          }
        } catch (_e) {
          /* ignore */
        }
        await sleep(40 + Math.floor(Math.random() * 80));
        continue;
      }
      throw err;
    }
  }

  if (fd == null) {
    const err = new Error(
      "Database is busy — another admin device is saving right now. Wait 2 seconds and upload again."
    );
    err.code = "DB_BUSY";
    throw err;
  }

  try {
    return await fn();
  } finally {
    try {
      fs.closeSync(fd);
    } catch (_e) {
      /* ignore */
    }
    try {
      fs.unlinkSync(lockPath);
    } catch (_e) {
      /* ignore */
    }
  }
}

function withLock(name, fn) {
  const prev = locks.get(name) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const next = prev.then(() => gate);
  locks.set(name, next.catch(() => {}));
  return prev
    .catch(() => {})
    .then(() => withDiskLock(name, fn))
    .finally(() => release());
}

function cloneDocs(docs) {
  return JSON.parse(JSON.stringify(docs));
}

function readSync(name) {
  const file = dataFile(name);
  if (!fs.existsSync(file)) {
    return { docs: [] };
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return { docs: [] };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { docs: parsed };
    if (parsed && Array.isArray(parsed.docs)) return parsed;
    return { docs: [] };
  } catch (err) {
    console.error(`[fileDb] Failed to read ${name}:`, err.message);
    return { docs: [] };
  }
}

function writeSync(name, docs) {
  const file = dataFile(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  const payload = JSON.stringify({ docs });
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, file);
}

function bumpPublicApiCache(name) {
  if (
    name === "products" ||
    name === "store_banners" ||
    name === "store_blog_posts" ||
    name === "store_pages"
  ) {
    try {
      require("../responseCache").invalidatePrefix("store:");
    } catch (_e) {
      /* ignore */
    }
  }
}

function setCache(name, docs) {
  globalVersion += 1;
  memory.set(name, { docs: cloneDocs(docs), version: globalVersion });
}

function invalidateCache(name) {
  memory.delete(name);
  globalVersion += 1;
  bumpPublicApiCache(name);
}

async function readCollection(name) {
  const hit = memory.get(name);
  if (hit) return cloneDocs(hit.docs);

  return withLock(name, async () => {
    const again = memory.get(name);
    if (again) return cloneDocs(again.docs);
    const docs = readSync(name).docs;
    setCache(name, docs);
    return cloneDocs(docs);
  });
}

async function writeCollection(name, docs) {
  return withLock(name, async () => {
    writeSync(name, docs);
    setCache(name, docs);
    bumpPublicApiCache(name);
    return docs;
  });
}

async function updateCollection(name, mutator) {
  return withLock(name, async () => {
    // Always re-read from disk under lock so parallel devices never overwrite each other
    const current = readSync(name).docs;
    const next = await mutator(cloneDocs(current));
    writeSync(name, next);
    setCache(name, next);
    bumpPublicApiCache(name);
    return next;
  });
}

function clearAllCaches() {
  memory.clear();
  globalVersion += 1;
}

module.exports = {
  readCollection,
  writeCollection,
  updateCollection,
  readSync,
  withLock,
  invalidateCache,
  clearAllCaches,
};
