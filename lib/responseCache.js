/**
 * Short TTL in-memory cache for hot public GET responses.
 * Safe for ecommerce bursts: many shoppers hit the same home/catalog payloads.
 */

/** @type {Map<string, { expires: number, status: number, body: unknown }>} */
const store = new Map();

function getCached(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return null;
  }
  return hit;
}

function setCached(key, body, ttlMs = 8000, status = 200) {
  store.set(key, { expires: Date.now() + ttlMs, status, body });
}

function invalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function clearResponseCache() {
  store.clear();
}

module.exports = {
  getCached,
  setCached,
  invalidatePrefix,
  clearResponseCache,
};
