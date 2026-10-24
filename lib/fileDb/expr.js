const { getPath } = require("./match");

function isExprObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp);
}

function resolve(doc, expr, vars = {}) {
  if (typeof expr === "string") {
    if (expr.startsWith("$$")) {
      const name = expr.slice(2);
      if (name.includes(".")) {
        const [root, ...rest] = name.split(".");
        return getPath(vars[root], rest.join("."));
      }
      return vars[name];
    }
    if (expr.startsWith("$")) {
      return getPath(doc, expr.slice(1));
    }
    return expr;
  }
  if (Array.isArray(expr)) return expr.map((item) => resolve(doc, item, vars));
  if (!isExprObject(expr)) return expr;

  if ("$ifNull" in expr) {
    const [value, fallback] = expr.$ifNull;
    const resolved = resolve(doc, value, vars);
    return resolved == null ? resolve(doc, fallback, vars) : resolved;
  }
  if ("$cond" in expr) {
    const cond = expr.$cond;
    if (Array.isArray(cond)) {
      const [test, pass, fail] = cond;
      return resolve(doc, test, vars) ? resolve(doc, pass, vars) : resolve(doc, fail, vars);
    }
    return resolve(doc, cond.if, vars) ? resolve(doc, cond.then, vars) : resolve(doc, cond.else, vars);
  }
  if ("$eq" in expr) {
    const [a, b] = expr.$eq;
    return resolve(doc, a, vars) === resolve(doc, b, vars);
  }
  if ("$ne" in expr) {
    const [a, b] = expr.$ne;
    return resolve(doc, a, vars) !== resolve(doc, b, vars);
  }
  if ("$gt" in expr) {
    const [a, b] = expr.$gt;
    return resolve(doc, a, vars) > resolve(doc, b, vars);
  }
  if ("$gte" in expr) {
    const [a, b] = expr.$gte;
    return resolve(doc, a, vars) >= resolve(doc, b, vars);
  }
  if ("$lt" in expr) {
    const [a, b] = expr.$lt;
    return resolve(doc, a, vars) < resolve(doc, b, vars);
  }
  if ("$lte" in expr) {
    const [a, b] = expr.$lte;
    return resolve(doc, a, vars) <= resolve(doc, b, vars);
  }
  if ("$and" in expr) return expr.$and.every((item) => resolve(doc, item, vars));
  if ("$or" in expr) return expr.$or.some((item) => resolve(doc, item, vars));
  if ("$size" in expr) {
    const value = resolve(doc, expr.$size, vars);
    return Array.isArray(value) ? value.length : 0;
  }
  if ("$sum" in expr) {
    const input = resolve(doc, expr.$sum, vars);
    if (Array.isArray(input)) {
      return input.reduce((acc, item) => acc + (Number(item) || 0), 0);
    }
    // "$variants.quantity" style may already be flattened by getPath
    return Number(input) || 0;
  }
  if ("$min" in expr) {
    const input = resolve(doc, expr.$min, vars);
    const arr = Array.isArray(input) ? input : [input];
    const nums = arr.map(Number).filter((n) => Number.isFinite(n));
    return nums.length ? Math.min(...nums) : 0;
  }
  if ("$max" in expr) {
    const input = resolve(doc, expr.$max, vars);
    const arr = Array.isArray(input) ? input : [input];
    const nums = arr.map(Number).filter((n) => Number.isFinite(n));
    return nums.length ? Math.max(...nums) : 0;
  }
  if ("$multiply" in expr) {
    return expr.$multiply.reduce((acc, item) => acc * (Number(resolve(doc, item, vars)) || 0), 1);
  }
  if ("$divide" in expr) {
    const [a, b] = expr.$divide;
    const denom = Number(resolve(doc, b, vars)) || 0;
    if (!denom) return 0;
    return Number(resolve(doc, a, vars)) / denom;
  }
  if ("$subtract" in expr) {
    const [a, b] = expr.$subtract;
    return Number(resolve(doc, a, vars)) - Number(resolve(doc, b, vars));
  }
  if ("$round" in expr) {
    const [value, places] = Array.isArray(expr.$round) ? expr.$round : [expr.$round, 0];
    const n = Number(resolve(doc, value, vars)) || 0;
    const p = Number(resolve(doc, places, vars)) || 0;
    const factor = 10 ** p;
    return Math.round(n * factor) / factor;
  }
  if ("$toString" in expr) {
    const value = resolve(doc, expr.$toString, vars);
    return value == null ? "" : String(value);
  }
  if ("$strLenCP" in expr) {
    const value = resolve(doc, expr.$strLenCP, vars);
    return String(value ?? "").length;
  }
  if ("$arrayElemAt" in expr) {
    const [arrExpr, indexExpr] = expr.$arrayElemAt;
    const arr = resolve(doc, arrExpr, vars);
    const index = Number(resolve(doc, indexExpr, vars)) || 0;
    return Array.isArray(arr) ? arr[index] : undefined;
  }
  if ("$filter" in expr) {
    const input = resolve(doc, expr.$filter.input, vars) || [];
    const as = expr.$filter.as || "this";
    const cond = expr.$filter.cond;
    if (!Array.isArray(input)) return [];
    return input.filter((item) => resolve(doc, cond, { ...vars, [as]: item }));
  }
  if ("$map" in expr) {
    const input = resolve(doc, expr.$map.input, vars) || [];
    const as = expr.$map.as || "this";
    const inExpr = expr.$map.in;
    if (!Array.isArray(input)) return [];
    return input.map((item) => resolve(doc, inExpr, { ...vars, [as]: item }));
  }

  // Plain object literal in expression context
  const out = {};
  for (const [key, value] of Object.entries(expr)) {
    out[key] = resolve(doc, value, vars);
  }
  return out;
}

module.exports = { resolve, isExprObject };
