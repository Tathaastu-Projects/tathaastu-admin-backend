const { createModel, ObjectId, createObjectId, toIdString, idsEqual } = require("./model");
const { ensureStorageLayout, STORAGE_ROOT, DATA_DIR, IMAGES_DIR } = require("./paths");

ensureStorageLayout();

const Types = { ObjectId };

module.exports = {
  createModel,
  Types,
  ObjectId,
  createObjectId,
  toIdString,
  idsEqual,
  ensureStorageLayout,
  STORAGE_ROOT,
  DATA_DIR,
  IMAGES_DIR,
};
