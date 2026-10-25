const { Schema } = require("mongoose");

/** Same pattern the frontend generates (`newId("p")` → "p-lx2k…") and the seed data uses ("p-yoga"). */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const imageAssetSchema = new Schema(
  {
    src: { type: String, trim: true, default: "" },
    alt: { type: String, trim: true, default: "" },
    credit: { type: String, trim: true },
  },
  { _id: false },
);

/**
 * Responses use the frontend's `id` string as the key. Mongo's `_id`, `__v`, timestamps and
 * internal fields are removed so the JSON matches types/content.ts exactly.
 */
function toPublicJSON(hidden = []) {
  return {
    versionKey: false,
    transform(_doc, ret) {
      delete ret._id;
      for (const key of ["createdAt", "updatedAt", "singleton", ...hidden]) delete ret[key];
      return ret;
    },
  };
}

/** A content collection keyed by the frontend's string id (the default `id` virtual is disabled). */
function contentSchema(definition, { hidden = [] } = {}) {
  return new Schema(
    {
      id: { type: String, required: true, unique: true, trim: true, match: ID_PATTERN },
      ...definition,
    },
    { id: false, timestamps: true, toJSON: toPublicJSON(hidden), toObject: toPublicJSON(hidden) },
  );
}

/** A single-document collection (profile, homepage, settings). */
function singletonSchema(definition) {
  return new Schema(
    {
      singleton: { type: String, default: "main", unique: true, immutable: true },
      ...definition,
    },
    { id: false, timestamps: true, toJSON: toPublicJSON(), toObject: toPublicJSON(), minimize: false },
  );
}

module.exports = { ID_PATTERN, SLUG_PATTERN, imageAssetSchema, contentSchema, singletonSchema, toPublicJSON };
