const { Router } = require("express");
const { z } = require("zod");
const projects = require("../controllers/projects.controller");
const service = require("../services/collections").projects;
const schemas = require("../validators/content.validators");
const { slug } = require("../validators/common");
const { validate } = require("../middleware/validate");
const { mountCollectionAdmin } = require("./helpers");

module.exports = () => {
  const publicRouter = Router();
  publicRouter.get("/", validate({ query: schemas.projectListQuery }), projects.listPublic);
  publicRouter.get("/:slug", validate({ params: z.object({ slug }) }), projects.getPublic);

  const adminRouter = Router();
  adminRouter.get("/", validate({ query: schemas.projectListQuery }), projects.listAdmin);
  mountCollectionAdmin(adminRouter, service, schemas.project);
  return { publicRouter, adminRouter };
};
