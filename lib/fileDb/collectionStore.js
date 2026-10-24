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
    .then(fn)
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
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify({ docs }, null, 2);
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
