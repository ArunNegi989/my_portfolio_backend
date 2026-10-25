const { projects } = require("../services/collections");
const { textSearch } = require("../services/content.service");
const ApiError = require("../utils/ApiError");

const SEARCH_FIELDS = ["title", "summary", "context", "category", "technologies", "slug"];

function filterFrom(query, { publicOnly }) {
  const filter = { ...textSearch(query.q, SEARCH_FIELDS) };
  if (publicOnly) filter.status = "published";
  else if (query.status && query.status !== "all") filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.featured) filter.featured = query.featured === "true";
  return filter;
}

/** GET /projects — published projects only, ordered like the site lists them. */
async function listPublic(req, res) {
  res.json(await projects.paginate(filterFrom(req.valid.query, { publicOnly: true }), req.valid.query, { defaultLimit: 100 }));
}

async function getPublic(req, res) {
  const data = await projects.findOne({ slug: req.valid.params.slug, status: "published" });
  if (!data) throw ApiError.notFound("Project not found.");
  res.json({ data });
}

/** GET /admin/projects — every status, with filters and pagination. */
async function listAdmin(req, res) {
  res.json(await projects.paginate(filterFrom(req.valid.query, { publicOnly: false }), req.valid.query));
}

module.exports = { listPublic, getPublic, listAdmin };
