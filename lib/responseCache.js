/**
 * Hot public GET response cache (home / catalog).
 * - In-process Map with TTL (Redis optional later)
 * - Singleflight: concurrent misses for the same key share one compute
 * Writes invalidate via invalidatePrefix("store:")
 */

/** @type {Map<string, { expires: number, status: number, body: unknown }>} */
const store = new Map();

/** @type {Map<string, Promise<{ status: number, body: unknown, cache: string }>>} */
const inflight = new Map();

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

/**
 * Cache hit → return immediately.
 * Concurrent misses → one producer, many waiters (multi-user safe).
 */
async function getOrCompute(key, ttlMs, producer) {
  const hit = getCached(key);
  if (hit) {
    return { status: hit.status, body: hit.body, cache: "HIT" };
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    try {
      const produced = await producer();
      const status = produced?.status || 200;
      const body = produced?.body !== undefined ? produced.body : produced;
      setCached(key, body, ttlMs, status);
      return { status, body, cache: "MISS" };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
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
  getOrCompute,
  invalidatePrefix,
  clearResponseCache,
};
