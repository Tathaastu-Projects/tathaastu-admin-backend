const { matches, getPath } = require("./match");
const { resolve } = require("./expr");
const { clone } = require("./updateOps");

function applyProject(doc, projection) {
  const keys = Object.keys(projection || {});
  if (!keys.length) return doc;

  const includeMode = keys.some((k) => projection[k] === 1 || projection[k] === true);
  const excludeMode = keys.some((k) => projection[k] === 0 || projection[k] === false);

  if (excludeMode && !includeMode) {
    const next = clone(doc);
    for (const key of keys) {
      if (projection[key] === 0 || projection[key] === false) {
        if (key.includes(".")) {
          const parts = key.split(".");
          let cur = next;
          for (let i = 0; i < parts.length - 1; i += 1) {
            if (!cur[parts[i]]) break;
            cur = cur[parts[i]];
          }
          if (cur && typeof cur === "object") delete cur[parts[parts.length - 1]];
        } else {
          delete next[key];
        }
      }
    }
    return next;
  }

  const next = { _id: doc._id };
  for (const [key, value] of Object.entries(projection)) {
    if (value === 0 || value === false) continue;
    if (value === 1 || value === true) {
      next[key] = getPath(doc, key);
    } else {
      next[key] = resolve(doc, value);
    }
  }
  if (projection._id === 0 || projection._id === false) delete next._id;
  return next;
}

function applyAddFields(doc, fields) {
  const next = clone(doc);
  for (const [key, expr] of Object.entries(fields || {})) {
    next[key] = resolve(next, expr);
  }
  return next;
}

function sortDocs(docs, sortSpec = {}) {
  const entries = Object.entries(sortSpec);
  if (!entries.length) return docs;
  return docs.slice().sort((a, b) => {
    for (const [key, dir] of entries) {
      const av = getPath(a, key);
      const bv = getPath(b, key);
      if (av === bv) continue;
      if (av == null) return dir;
      if (bv == null) return -dir;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
    }
    return 0;
  });
}

function groupKey(doc, idExpr) {
  if (idExpr === null) return "null";
  const value = resolve(doc, idExpr);
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function applyGroup(docs, stage) {
  const groups = new Map();
  for (const doc of docs) {
    const key = groupKey(doc, stage._id);
    if (!groups.has(key)) {
      groups.set(key, {
        _id: resolve(doc, stage._id),
        __docs: [],
      });
    }
    groups.get(key).__docs.push(doc);
  }

  const out = [];
  for (const group of groups.values()) {
    const row = { _id: group._id };
    for (const [field, expr] of Object.entries(stage)) {
      if (field === "_id") continue;
      if (expr.$sum === 1) {
        row[field] = group.__docs.length;
      } else if (typeof expr.$sum === "string" || typeof expr.$sum === "object") {
        row[field] = group.__docs.reduce((acc, doc) => acc + (Number(resolve(doc, expr.$sum)) || 0), 0);
      } else if (expr.$min != null) {
        const vals = group.__docs.map((doc) => resolve(doc, expr.$min)).filter((v) => v != null && v !== "");
        row[field] = vals.length ? vals.reduce((a, b) => (a < b ? a : b)) : null;
      } else if (expr.$max != null) {
        const vals = group.__docs.map((doc) => resolve(doc, expr.$max)).filter((v) => v != null && v !== "");
        row[field] = vals.length ? vals.reduce((a, b) => (a > b ? a : b)) : null;
      } else if (expr.$avg != null) {
        const vals = group.__docs.map((doc) => Number(resolve(doc, expr.$avg))).filter((n) => Number.isFinite(n));
        row[field] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      } else if (expr.$first != null) {
        row[field] = group.__docs.length ? resolve(group.__docs[0], expr.$first) : null;
      } else if (expr.$push != null) {
        row[field] = group.__docs.map((doc) => resolve(doc, expr.$push));
      } else {
        row[field] = null;
      }
    }
    out.push(row);
  }
  return out;
}

function runStages(docs, stages) {
  let current = docs.map((d) => clone(d));

  for (const stage of stages || []) {
    if (stage.$match) {
      current = current.filter((doc) => matches(doc, stage.$match));
      continue;
    }
    if (stage.$addFields || stage.$set) {
      const fields = stage.$addFields || stage.$set;
      current = current.map((doc) => applyAddFields(doc, fields));
      continue;
    }
    if (stage.$project) {
      current = current.map((doc) => applyProject(doc, stage.$project));
      continue;
    }
    if (stage.$sort) {
      current = sortDocs(current, stage.$sort);
      continue;
    }
    if (stage.$skip != null) {
      current = current.slice(Number(stage.$skip) || 0);
      continue;
    }
    if (stage.$limit != null) {
      current = current.slice(0, Number(stage.$limit) || 0);
      continue;
    }
    if (stage.$count) {
      current = [{ [stage.$count]: current.length }];
      continue;
    }
    if (stage.$unwind) {
      const path = typeof stage.$unwind === "string" ? stage.$unwind : stage.$unwind.path;
      const field = path.startsWith("$") ? path.slice(1) : path;
      const next = [];
      for (const doc of current) {
        const arr = getPath(doc, field);
        if (!Array.isArray(arr) || !arr.length) continue;
        for (const item of arr) {
          const copy = clone(doc);
          // set nested path
          const parts = field.split(".");
          let cur = copy;
          for (let i = 0; i < parts.length - 1; i += 1) {
            cur = cur[parts[i]];
          }
          cur[parts[parts.length - 1]] = item;
          next.push(copy);
        }
      }
      current = next;
      continue;
    }
    if (stage.$group) {
      current = applyGroup(current, stage.$group);
      continue;
    }
    if (stage.$facet) {
      const facetOut = {};
      for (const [name, subStages] of Object.entries(stage.$facet)) {
        facetOut[name] = runStages(current, subStages);
      }
      current = [facetOut];
      continue;
    }
    console.warn("[fileDb] Unsupported aggregate stage:", Object.keys(stage)[0]);
  }

  return current;
}

async function aggregate(docs, pipeline) {
  return runStages(docs, pipeline);
}

module.exports = { aggregate, sortDocs, applyProject };
