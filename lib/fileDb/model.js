const { updateCollection, readCollection } = require("./collectionStore");
const { matches, getPath } = require("./match");
const { applyUpdate, mergeOnInsert, ensureSubdocIds, clone } = require("./updateOps");
const { createObjectId, toIdString, idsEqual, ObjectId } = require("./objectId");
const { aggregate: runAggregate, sortDocs, applyProject } = require("./aggregate");

function hydrateDates(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const next = { ...doc };
  for (const key of ["createdAt", "updatedAt", "publishedAt", "startsAt", "endsAt"]) {
    if (next[key] && typeof next[key] === "string") {
      const d = new Date(next[key]);
      if (!Number.isNaN(d.getTime())) next[key] = d;
    }
  }
  return next;
}

class Document {
  constructor(model, data = {}, { isNew = true } = {}) {
    this.$model = model;
    this.$isNew = isNew;
    Object.assign(this, hydrateDates(clone(data)));
    if (!this._id) this._id = createObjectId();
    if (model.virtuals) {
      for (const [name, getter] of Object.entries(model.virtuals)) {
        Object.defineProperty(this, name, {
          get: getter.bind(this),
          enumerable: true,
          configurable: true,
        });
      }
    }
    if (model.methods) {
      for (const [name, fn] of Object.entries(model.methods)) {
        this[name] = fn.bind(this);
      }
    }
  }

  toObject() {
    const obj = {};
    for (const [key, value] of Object.entries(this)) {
      if (key.startsWith("$")) continue;
      if (typeof value === "function") continue;
      obj[key] = value;
    }
    if (this.$model?.virtuals) {
      for (const name of Object.keys(this.$model.virtuals)) {
        try {
          obj[name] = this[name];
        } catch (_e) {
          /* ignore */
        }
      }
    }
    return obj;
  }

  toJSON() {
    return this.toObject();
  }

  async save() {
    const model = this.$model;
    const payload = ensureSubdocIds(clone(this.toObject()));
    // strip virtuals from persistence
    if (model.virtuals) {
      for (const name of Object.keys(model.virtuals)) delete payload[name];
    }
    const now = new Date().toISOString();
    if (this.$isNew) {
      payload.createdAt = payload.createdAt ? new Date(payload.createdAt).toISOString() : now;
      payload.updatedAt = now;
    } else {
      payload.updatedAt = now;
      if (payload.createdAt instanceof Date) payload.createdAt = payload.createdAt.toISOString();
      else if (!payload.createdAt) payload.createdAt = now;
    }

    await updateCollection(model.collectionName, (docs) => {
      const idx = docs.findIndex((d) => idsEqual(d._id, payload._id));
      if (idx >= 0) {
        docs[idx] = payload;
      } else {
        docs.push(payload);
      }
      return docs;
    });

    Object.assign(this, hydrateDates(payload));
    this.$isNew = false;
    return this;
  }

  async deleteOne() {
    const model = this.$model;
    await updateCollection(model.collectionName, (docs) =>
      docs.filter((d) => !idsEqual(d._id, this._id))
    );
    return { acknowledged: true, deletedCount: 1 };
  }
}

class Query {
  constructor(model, filter = {}, { single = false } = {}) {
    this.model = model;
    this.filter = filter || {};
    this._sort = null;
    this._skip = 0;
    this._limit = null;
    this._projection = null;
    this._lean = false;
    this._single = single;
  }

  sort(spec) {
    this._sort = spec;
    return this;
  }

  skip(n) {
    this._skip = Number(n) || 0;
    return this;
  }

  limit(n) {
    this._limit = Number(n);
    return this;
  }

  select(projection) {
    if (typeof projection === "string") {
      const parts = projection.trim().split(/\s+/);
      this._projection = {};
      for (const part of parts) {
        if (part.startsWith("-")) this._projection[part.slice(1)] = 0;
        else this._projection[part] = 1;
      }
    } else {
      this._projection = projection;
    }
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async _execute() {
    let docs = await readCollection(this.model.collectionName);
    docs = docs.filter((d) => matches(d, this.filter));
    if (this._sort) docs = sortDocs(docs, this._sort);
    if (this._skip) docs = docs.slice(this._skip);
    if (this._limit != null) docs = docs.slice(0, this._limit);
    if (this._projection) docs = docs.map((d) => applyProject(d, this._projection));
    return docs.map((d) => hydrateDates(d));
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  async exec() {
    const docs = await this._execute();
    if (this._single) {
      const first = docs[0] || null;
      if (!first) return null;
      return this._lean ? first : new Document(this.model, first, { isNew: false });
    }
    if (this._lean) return docs;
    return docs.map((d) => new Document(this.model, d, { isNew: false }));
  }
}

function createModel(collectionName, options = {}) {
  const model = {
    collectionName,
    virtuals: options.virtuals || {},
    methods: options.methods || {},
    statics: options.statics || {},
  };

  function wrap(doc) {
    if (!doc) return null;
    return new Document(model, doc, { isNew: false });
  }

  function findOne(filter = {}) {
    const q = new Query(model, filter, { single: true });
    q.limit(1);
    return q;
  }

  function findById(id) {
    if (id == null || id === "") {
      const q = new Query(model, { _id: "__missing__" }, { single: true });
      q.limit(1);
      return q;
    }
    return findOne({ _id: toIdString(id) });
  }

  async function countDocuments(filter = {}) {
    const docs = await readCollection(collectionName);
    return docs.filter((d) => matches(d, filter)).length;
  }

  async function exists(filter = {}) {
    const docs = await readCollection(collectionName);
    return docs.some((d) => matches(d, filter)) || null;
  }

  async function create(data) {
    const items = Array.isArray(data) ? data : [data];
    const created = [];
    for (const item of items) {
      const doc = new Document(model, ensureSubdocIds(clone(item)), { isNew: true });
      await doc.save();
      created.push(doc);
    }
    return Array.isArray(data) ? created : created[0];
  }

  async function insertMany(data = []) {
    const items = Array.isArray(data) ? data : [data];
    return create(items);
  }

  async function deleteMany(filter = {}) {
    let deletedCount = 0;
    await updateCollection(collectionName, (docs) => {
      const next = docs.filter((d) => {
        const hit = matches(d, filter);
        if (hit) deletedCount += 1;
        return !hit;
      });
      return next;
    });
    return { acknowledged: true, deletedCount };
  }

  async function deleteOne(filter = {}) {
    let deletedCount = 0;
    await updateCollection(collectionName, (docs) => {
      const idx = docs.findIndex((d) => matches(d, filter));
      if (idx >= 0) {
        docs.splice(idx, 1);
        deletedCount = 1;
      }
      return docs;
    });
    return { acknowledged: true, deletedCount };
  }

  async function updateOne(filter, update, options = {}) {
    let modifiedCount = 0;
    let upsertedId = null;
    await updateCollection(collectionName, (docs) => {
      const idx = docs.findIndex((d) => matches(d, filter));
      if (idx >= 0) {
        docs[idx] = applyUpdate(docs[idx], update, { arrayFilters: options.arrayFilters || [] });
        modifiedCount = 1;
      } else if (options.upsert) {
        const inserted = mergeOnInsert(filter, update);
        inserted._id = inserted._id || createObjectId();
        const now = new Date().toISOString();
        inserted.createdAt = inserted.createdAt || now;
        inserted.updatedAt = now;
        docs.push(ensureSubdocIds(inserted));
        upsertedId = inserted._id;
        modifiedCount = 1;
      }
      return docs;
    });
    return { acknowledged: true, modifiedCount, upsertedId };
  }

  async function updateMany(filter, update, options = {}) {
    let modifiedCount = 0;
    await updateCollection(collectionName, (docs) =>
      docs.map((d) => {
        if (!matches(d, filter)) return d;
        modifiedCount += 1;
        return applyUpdate(d, update, { arrayFilters: options.arrayFilters || [] });
      })
    );
    return { acknowledged: true, modifiedCount };
  }

  async function findOneAndUpdate(filter, update, options = {}) {
    let result = null;
    await updateCollection(collectionName, (docs) => {
      const idx = docs.findIndex((d) => matches(d, filter));
      if (idx >= 0) {
        docs[idx] = applyUpdate(docs[idx], update, { arrayFilters: options.arrayFilters || [] });
        result = docs[idx];
      } else if (options.upsert) {
        const inserted = mergeOnInsert(filter, update);
        inserted._id = inserted._id || createObjectId();
        const now = new Date().toISOString();
        inserted.createdAt = inserted.createdAt || now;
        inserted.updatedAt = now;
        docs.push(ensureSubdocIds(inserted));
        result = inserted;
      }
      return docs;
    });
    if (!result) return null;
    if (options.lean) return hydrateDates(result);
    return wrap(result);
  }

  async function findByIdAndUpdate(id, update, options = {}) {
    return findOneAndUpdate({ _id: toIdString(id) }, update, options);
  }

  async function findOneAndDelete(filter = {}) {
    let removed = null;
    await updateCollection(collectionName, (docs) => {
      const idx = docs.findIndex((d) => matches(d, filter));
      if (idx >= 0) {
        removed = docs[idx];
        docs.splice(idx, 1);
      }
      return docs;
    });
    if (!removed) return null;
    return wrap(removed);
  }

  async function findByIdAndDelete(id) {
    if (id == null || id === "") return null;
    return findOneAndDelete({ _id: toIdString(id) });
  }

  async function aggregate(pipeline) {
    const docs = await readCollection(collectionName);
    return runAggregate(docs, pipeline);
  }

  const api = {
    collectionName,
    find: (filter) => new Query(model, filter),
    findOne,
    findById,
    countDocuments,
    exists,
    create,
    insertMany,
    deleteMany,
    deleteOne,
    updateOne,
    updateMany,
    findOneAndUpdate,
    findByIdAndUpdate,
    findOneAndDelete,
    findByIdAndDelete,
    aggregate,
  };

  for (const [name, fn] of Object.entries(options.statics || {})) {
    api[name] = fn.bind(api);
  }

  model.find = api.find;
  model.findOne = findOne;
  model.findById = findById;
  model.create = create;

  return api;
}

module.exports = {
  createModel,
  Document,
  Query,
  ObjectId,
  createObjectId,
  toIdString,
  idsEqual,
  getPath,
};
