const { posts } = require("../services/collections");
const { textSearch } = require("../services/content.service");
const ApiError = require("../utils/ApiError");

const SEARCH_FIELDS = ["title", "excerpt", "category", "tags", "slug"];

function filterFrom(query, { publicOnly }) {
  const filter = { ...textSearch(query.q, SEARCH_FIELDS) };
  if (publicOnly) filter.status = "published";
  else if (query.status && query.status !== "all") filter.status = query.status;
  if (query.category) filter.category = query.category;
  return filter;
}

/** GET /posts — published articles, newest first. */
async function listPublic(req, res) {
  res.json(await posts.paginate(filterFrom(req.valid.query, { publicOnly: true }), req.valid.query, { defaultLimit: 100 }));
}

async function getPublic(req, res) {
  const data = await posts.findOne({ slug: req.valid.params.slug, status: "published" });
  if (!data) throw ApiError.notFound("Article not found.");
  res.json({ data });
}

async function listAdmin(req, res) {
  res.json(await posts.paginate(filterFrom(req.valid.query, { publicOnly: false }), req.valid.query));
}

module.exports = { listPublic, getPublic, listAdmin };
