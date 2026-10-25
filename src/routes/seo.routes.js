const { Router } = require("express");
const service = require("../services/collections").seo;
const schemas = require("../validators/content.validators");
const { validate } = require("../middleware/validate");
const { collectionHandlers } = require("../controllers/content.controller");

/** Per-page SEO for the static routes (SEO screen saves every page together). */
module.exports = () => {
  const publicRouter = Router();
  publicRouter.get("/", async (_req, res) => res.json({ data: await service.findAll() }));

  const adminRouter = Router();
  adminRouter.get("/", async (_req, res) => res.json({ data: await service.findAll() }));
  adminRouter.put("/", validate({ body: schemas.lists.seo }), collectionHandlers(service).replaceAll);
  return { publicRouter, adminRouter };
};
