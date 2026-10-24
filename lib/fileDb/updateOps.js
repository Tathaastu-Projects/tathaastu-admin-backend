const { createObjectId, toIdString, idsEqual } = require("./objectId");
const { getPath } = require("./match");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setPath(doc, path, value) {
  const parts = String(path).split(".");
  let cur = doc;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (cur[part] == null || typeof cur[part] !== "object") cur[part] = {};
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
}

function incPath(doc, path, amount) {
  const parts = String(path).split(".");
  let cur = doc;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (cur[part] == null || typeof cur[part] !== "object") cur[part] = {};
    cur = cur[part];
  }
  const key = parts[parts.length - 1];
  cur[key] = Number(cur[key] || 0) + Number(amount || 0);
}

function ensureSubdocIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        if (!item._id) item._id = createObjectId();
        for (const [k, v] of Object.entries(item)) {
          if (v && typeof v === "object") item[k] = ensureSubdocIds(v);
        }
      }
      return item;
    });
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (v && typeof v === "object") value[k] = ensureSubdocIds(v);
    }
  }
  return value;
}

function applyUpdate(doc, update = {}, { arrayFilters = [] } = {}) {
  const next = clone(doc);

  if (update.$set) {
    for (const [path, value] of Object.entries(update.$set)) {
      if (path.includes(".$[")) {
        applyArrayFilterSet(next, path, value, arrayFilters);
      } else {
        setPath(next, path, ensureSubdocIds(clone(value)));
      }
    }
  }
  if (update.$inc) {
    for (const [path, amount] of Object.entries(update.$inc)) {
      if (path.includes(".$[")) {
        applyArrayFilterInc(next, path, amount, arrayFilters);
      } else {
        incPath(next, path, amount);
      }
    }
  }
  if (update.$setOnInsert) {
    // handled by caller on insert only
  }
  if (update.$unset) {
    for (const path of Object.keys(update.$unset)) {
      setPath(next, path, undefined);
    }
  }

  const hasOperators = Object.keys(update).some((k) => k.startsWith("$"));
  if (!hasOperators) {
    // Mongoose treats plain objects as $set (partial update), not full replace
    for (const [path, value] of Object.entries(update)) {
      if (path === "_id") continue;
      setPath(next, path, ensureSubdocIds(clone(value)));
    }
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

function parseArrayFilterPath(path) {
  // e.g. variants.$[v].quantity
  const match = /^([^.]+)\.\$\[([^\]]+)\]\.(.+)$/.exec(path);
  if (!match) return null;
  return { arrayField: match[1], filterId: match[2], rest: match[3] };
}

function arrayFilterMatcher(filterId, arrayFilters) {
  const key = `$${filterId}`; // unused; arrayFilters use { "v._id": ... }
  const filter = arrayFilters.find((f) => Object.keys(f).some((k) => k.startsWith(`${filterId}.`) || k === filterId));
  return filter || {};
}

function itemMatchesArrayFilter(item, filterId, arrayFilters) {
  const filter = arrayFilters.find((f) =>
    Object.keys(f).some((k) => k === filterId || k.startsWith(`${filterId}.`))
  );
  if (!filter) return true;
  for (const [rawKey, expected] of Object.entries(filter)) {
    const field = rawKey.startsWith(`${filterId}.`) ? rawKey.slice(filterId.length + 1) : rawKey === filterId ? null : rawKey;
    const value = field == null ? item : getPath(item, field);
    if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
      if (expected.$gte != null && !(value >= expected.$gte)) return false;
      if (expected.$gt != null && !(value > expected.$gt)) return false;
      if (expected.$lte != null && !(value <= expected.$lte)) return false;
      if (expected.$lt != null && !(value < expected.$lt)) return false;
      if (expected.$eq != null && !idsEqual(value, expected.$eq) && value !== expected.$eq) return false;
    } else if (!idsEqual(value, expected) && value !== expected && String(value) !== String(expected)) {
      return false;
    }
  }
  return true;
}

function applyArrayFilterSet(doc, path, value, arrayFilters) {
  const parsed = parseArrayFilterPath(path);
  if (!parsed) return;
  const arr = doc[parsed.arrayField];
  if (!Array.isArray(arr)) return;
  for (const item of arr) {
    if (!itemMatchesArrayFilter(item, parsed.filterId, arrayFilters)) continue;
    setPath(item, parsed.rest, value);
  }
}

function applyArrayFilterInc(doc, path, amount, arrayFilters) {
  const parsed = parseArrayFilterPath(path);
  if (!parsed) return;
  const arr = doc[parsed.arrayField];
  if (!Array.isArray(arr)) return;
  for (const item of arr) {
    if (!itemMatchesArrayFilter(item, parsed.filterId, arrayFilters)) continue;
    incPath(item, parsed.rest, amount);
  }
}

function mergeOnInsert(filter, update) {
  const base = {};
  if (update.$setOnInsert) Object.assign(base, clone(update.$setOnInsert));
  if (update.$set) Object.assign(base, clone(update.$set));
  if (!Object.keys(update).some((k) => k.startsWith("$"))) {
    Object.assign(base, clone(update));
  }
  // Copy equality fields from filter into insert doc
  for (const [key, value] of Object.entries(filter || {})) {
    if (key.startsWith("$")) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && Object.keys(value).some((k) => k.startsWith("$"))) {
      continue;
    }
    if (base[key] === undefined) base[key] = clone(value);
  }
  return ensureSubdocIds(base);
}

module.exports = {
  applyUpdate,
  mergeOnInsert,
  ensureSubdocIds,
  clone,
  setPath,
  toIdString,
};
