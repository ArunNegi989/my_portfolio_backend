const { Router } = require("express");
const { z } = require("zod");
const posts = require("../controllers/posts.controller");
const service = require("../services/collections").posts;
const schemas = require("../validators/content.validators");
const { slug } = require("../validators/common");
const { validate } = require("../middleware/validate");
const { mountCollectionAdmin } = require("./helpers");

/** Blog articles: /api/v1/posts and /api/v1/admin/posts. */
module.exports = () => {
  const publicRouter = Router();
  publicRouter.get("/", validate({ query: schemas.postListQuery }), posts.listPublic);
  publicRouter.get("/:slug", validate({ params: z.object({ slug }) }), posts.getPublic);

  const adminRouter = Router();
  adminRouter.get("/", validate({ query: schemas.postListQuery }), posts.listAdmin);
  mountCollectionAdmin(adminRouter, service, schemas.post);
  return { publicRouter, adminRouter };
};
