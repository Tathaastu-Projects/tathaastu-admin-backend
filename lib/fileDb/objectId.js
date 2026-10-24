const crypto = require("crypto");

function createObjectId(value) {
  if (value == null || value === "") {
    return crypto.randomBytes(12).toString("hex");
  }
  const str = String(value);
  if (/^[a-f0-9]{24}$/i.test(str)) return str.toLowerCase();
  // Stable-ish hash for non-hex inputs so filters still work
  return crypto.createHash("md5").update(str).digest("hex").slice(0, 24);
}

function ObjectId(value) {
  if (!(this instanceof ObjectId)) return new ObjectId(value);
  this.id = createObjectId(value);
  this._bsontype = "ObjectId";
}

ObjectId.prototype.toString = function toString() {
  return this.id;
};
ObjectId.prototype.toHexString = function toHexString() {
  return this.id;
};
ObjectId.prototype.valueOf = function valueOf() {
  return this.id;
};
ObjectId.prototype.toJSON = function toJSON() {
  return this.id;
};

ObjectId.isValid = function isValid(value) {
  if (value == null) return false;
  if (value instanceof ObjectId) return true;
  if (typeof value === "object" && value._bsontype === "ObjectId" && value.id) return true;
  return /^[a-f0-9]{24}$/i.test(String(value));
};

function toIdString(value) {
  if (value == null) return "";
  if (value instanceof ObjectId) return value.id;
  if (typeof value === "object" && value._id != null) return toIdString(value._id);
  if (typeof value === "object" && value.id != null && value._bsontype === "ObjectId") {
    return String(value.id);
  }
  return String(value);
}

function idsEqual(a, b) {
  return toIdString(a) === toIdString(b);
}

module.exports = { ObjectId, createObjectId, toIdString, idsEqual };
