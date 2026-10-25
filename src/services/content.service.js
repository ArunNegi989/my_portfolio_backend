// Shared create/read/update/delete logic for the content collections and singletons.
// Every write records an activity entry and asks the frontend to revalidate the affected tags.

const crypto = require("node:crypto");
const { trusted } = require("mongoose");
const ApiError = require("../utils/ApiError");
const { escapeRegex, parsePagination, paginationMeta } = require("../utils/helpers");
const { recordActivity } = require("./activity.service");
const { revalidateFrontend } = require("./revalidation.service");

const quote = (value) => `“${String(value ?? "").slice(0, 80)}”`;

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
}

/**
 * @param {object} options
 * @param {import("mongoose").Model} options.Model
 * @param {string} options.label        e.g. "project" (used in activity messages)
 * @param {(item: any) => string} options.titleOf
 * @param {string[]} options.tags        frontend cache tags to revalidate
 * @param {string} options.idPrefix      prefix for server-generated ids
 * @param {object} [options.sort]        default sort
 * @param {boolean} [options.hiddenOrder] order is managed by the server (not part of the frontend type)
 * @param {(data: any, existingId?: string) => Promise<void>} [options.beforeSave] extra validation
 */
function createCollectionService({ Model, label, titleOf, tags, idPrefix, sort = { order: 1 }, hiddenOrder = false, beforeSave }) {
  const touched = (message, user) => {
    recordActivity(message, user);
    revalidateFrontend(tags);
  };

  async function findAll(filter = {}, sortOverride) {
    const docs = await Model.find(filter).sort(sortOverride ?? sort);
    return docs.map((d) => d.toJSON());
  }

  async function paginate(filter, query, { sort: sortOverride, defaultLimit = 20 } = {}) {
    const paging = parsePagination(query, { defaultLimit });
    const [docs, total] = await Promise.all([
      Model.find(filter).sort(sortOverride ?? sort).skip(paging.skip).limit(paging.limit),
      Model.countDocuments(filter),
    ]);
    return { data: docs.map((d) => d.toJSON()), meta: paginationMeta(paging, total) };
  }

  async function findOne(filter) {
    const doc = await Model.findOne(filter);
    return doc ? doc.toJSON() : null;
  }

  async function create(data, user) {
    const id = data.id ?? newId(idPrefix);
    if (await Model.exists({ id })) throw ApiError.conflict(`A ${label} with id "${id}" already exists.`);
    if (beforeSave) await beforeSave(data);
    const values = { ...data, id };
    if (hiddenOrder) {
      const last = await Model.findOne().sort({ order: -1 }).select("order").lean();
      values.order = (last?.order ?? 0) + 1;
    }
    const doc = await Model.create(values);
    touched(`Added ${label} ${quote(titleOf(doc))}`, user);
    return doc.toJSON();
  }

  /** Full replacement (PUT): optional fields left out of the body are removed from the record. */
  async function update(id, data, user) {
    const doc = await Model.findOne({ id });
    if (!doc) throw ApiError.notFound(`That ${label} no longer exists.`);
    if (beforeSave) await beforeSave(data, id);
    const values = { ...data, id };
    if (hiddenOrder) values.order = doc.order;
    doc.overwrite(values);
    await doc.save();
    touched(`Updated ${label} ${quote(titleOf(doc))}`, user);
    return doc.toJSON();
  }

  async function remove(id, user) {
    const doc = await Model.findOneAndDelete({ id });
    if (!doc) throw ApiError.notFound(`That ${label} no longer exists.`);
    touched(`Deleted ${label} ${quote(titleOf(doc))}`, user);
  }

  /**
   * Saves a whole list at once (used by screens that save or reorder everything together):
   * upserts every item and deletes records that are no longer in the list.
   */
  async function replaceAll(items, user, message) {
    const docs = items.map((item, index) => {
      const values = hiddenOrder ? { ...item, order: index + 1 } : item;
      const doc = new Model(values);
      const error = doc.validateSync();
      if (error) throw error;
      return { id: item.id, values };
    });
    const ids = docs.map((d) => d.id);
    if (docs.length) {
      await Model.bulkWrite(
        docs.map(({ id, values }) => ({ replaceOne: { filter: { id }, replacement: values, upsert: true } })),
        { ordered: true },
      );
    }
    // trusted(): a server-built operator, exempt from sanitizeFilter (see config/database.js).
    await Model.deleteMany({ id: trusted({ $nin: ids }) });
    touched(message ?? `Updated ${label} list`, user);
    return findAll();
  }

  return { Model, findAll, paginate, findOne, create, update, remove, replaceAll };
}

function createSingletonService({ Model, label, tags }) {
  async function get() {
    const doc = await Model.findOne({ singleton: "main" });
    return doc ? doc.toJSON() : null;
  }

  async function put(data, user) {
    let doc = await Model.findOne({ singleton: "main" });
    if (doc) doc.overwrite({ ...data, singleton: "main" });
    else doc = new Model({ ...data, singleton: "main" });
    await doc.save();
    recordActivity(`Updated ${label}`, user);
    revalidateFrontend(tags);
    return doc.toJSON();
  }

  return { Model, get, put };
}

/** Case-insensitive "contains" filter across several fields, safe for user input. */
function textSearch(q, fields) {
  if (!q) return {};
  const pattern = new RegExp(escapeRegex(q), "i");
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

module.exports = { createCollectionService, createSingletonService, textSearch, newId };
