const { toIdString, idsEqual, ObjectId } = require("./objectId");

function getPath(doc, path) {
  if (!path) return doc;
  const parts = String(path).split(".");
  let cur = doc;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      // Match if any element has the remaining path (Mongo array traversal)
      const rest = parts.slice(parts.indexOf(part)).join(".");
      return cur.map((item) => getPath(item, rest)).flat();
    }
    cur = cur[part];
  }
  return cur;
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function valuesEqual(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof ObjectId || b instanceof ObjectId || (typeof a === "string" && ObjectId.isValid(a)) || (typeof b === "string" && ObjectId.isValid(b))) {
    return idsEqual(a, b);
  }
  if (a instanceof RegExp) return a.test(String(b ?? ""));
  if (b instanceof RegExp) return b.test(String(a ?? ""));
  return a === b || String(a) === String(b);
}

function matchOperator(fieldValue, op, expected, doc) {
  switch (op) {
    case "$eq":
      return valuesEqual(fieldValue, expected);
    case "$ne":
      return !valuesEqual(fieldValue, expected);
    case "$gt":
      return fieldValue > expected;
    case "$gte":
      return fieldValue >= expected;
    case "$lt":
      return fieldValue < expected;
    case "$lte":
      return fieldValue <= expected;
    case "$in": {
      const list = asArray(expected);
      const vals = asArray(fieldValue);
      return vals.some((v) => list.some((e) => valuesEqual(v, e) || (e instanceof RegExp && e.test(String(v ?? "")))));
    }
    case "$nin": {
      const list = asArray(expected);
      const vals = asArray(fieldValue);
      if (!vals.length) return !list.includes(null) && !list.includes("");
      return vals.every((v) => !list.some((e) => valuesEqual(v, e)));
    }
    case "$exists":
      return Boolean(expected) ? fieldValue !== undefined : fieldValue === undefined;
    case "$regex": {
      const flags = typeof expected === "object" && expected.flags ? expected.flags : "i";
      const pattern = expected instanceof RegExp ? expected : new RegExp(expected, flags);
      return asArray(fieldValue).some((v) => pattern.test(String(v ?? "")));
    }
    case "$size":
      return Array.isArray(fieldValue) && fieldValue.length === expected;
    case "$elemMatch":
      return Array.isArray(fieldValue) && fieldValue.some((item) => matches(item, expected));
    case "$not":
      if (expected instanceof RegExp) return !expected.test(String(fieldValue ?? ""));
      return !matchCondition(fieldValue, expected, doc);
    default:
      return false;
  }
}

function matchCondition(fieldValue, condition, doc) {
  if (condition instanceof RegExp) {
    return asArray(fieldValue).some((v) => condition.test(String(v ?? "")));
  }
  if (condition && typeof condition === "object" && !Array.isArray(condition) && !(condition instanceof Date) && !(condition instanceof ObjectId)) {
    const keys = Object.keys(condition);
    if (keys.some((k) => k.startsWith("$"))) {
      return keys.every((op) => matchOperator(fieldValue, op, condition[op], doc));
    }
  }
  // Array field contains value
  if (Array.isArray(fieldValue)) {
    return fieldValue.some((v) => valuesEqual(v, condition));
  }
  return valuesEqual(fieldValue, condition);
}

function resolveExprValue(expr, doc) {
  if (typeof expr === "string" && expr.startsWith("$")) {
    return getPath(doc, expr.slice(1));
  }
  return expr;
}

function evalExpr(expr, doc) {
  if (expr == null || typeof expr !== "object" || Array.isArray(expr)) {
    return resolveExprValue(expr, doc);
  }
  if (expr.$lte) {
    const [a, b] = expr.$lte;
    return resolveExprValue(a, doc) <= resolveExprValue(b, doc);
  }
  if (expr.$gte) {
    const [a, b] = expr.$gte;
    return resolveExprValue(a, doc) >= resolveExprValue(b, doc);
  }
  if (expr.$lt) {
    const [a, b] = expr.$lt;
    return resolveExprValue(a, doc) < resolveExprValue(b, doc);
  }
  if (expr.$gt) {
    const [a, b] = expr.$gt;
    return resolveExprValue(a, doc) > resolveExprValue(b, doc);
  }
  if (expr.$eq) {
    const [a, b] = expr.$eq;
    return valuesEqual(resolveExprValue(a, doc), resolveExprValue(b, doc));
  }
  if (expr.$and) return expr.$and.every((e) => evalExpr(e, doc));
  if (expr.$or) return expr.$or.some((e) => evalExpr(e, doc));
  return false;
}

function matches(doc, filter = {}) {
  if (!filter || !Object.keys(filter).length) return true;

  if (filter.$and) {
    return filter.$and.every((f) => matches(doc, f));
  }
  if (filter.$or) {
    return filter.$or.some((f) => matches(doc, f));
  }
  if (filter.$nor) {
    return !filter.$nor.some((f) => matches(doc, f));
  }
  if (filter.$expr) {
    if (!evalExpr(filter.$expr, doc)) return false;
  }

  for (const [key, condition] of Object.entries(filter)) {
    if (key.startsWith("$")) continue;
    const fieldValue = getPath(doc, key);
    // When getPath returns array from nested array traversal
    if (Array.isArray(fieldValue) && key.includes(".")) {
      const leafOk = fieldValue.some((v) => matchCondition(v, condition, doc));
      // Also try direct match if field itself is array of primitives
      if (!leafOk && !matchCondition(fieldValue, condition, doc)) return false;
      if (!leafOk && matchCondition(fieldValue, condition, doc)) continue;
      if (!leafOk) return false;
      continue;
    }
    if (!matchCondition(fieldValue, condition, doc)) return false;
  }
  return true;
}

module.exports = { matches, getPath, toIdString };
