const { Router } = require("express");
const service = require("../services/collections").testimonials;
const schemas = require("../validators/content.validators");
const { mountCollectionAdmin } = require("./helpers");

module.exports = () => {
  const publicRouter = Router();
  // Demo entries and hidden quotes never leave the server on the public endpoint.
  publicRouter.get("/", async (_req, res) => res.json({ data: await service.findAll({ isDemo: false, visible: true }) }));

  const adminRouter = Router();
  adminRouter.get("/", async (_req, res) => res.json({ data: await service.findAll() }));
  mountCollectionAdmin(adminRouter, service, schemas.testimonial);
  return { publicRouter, adminRouter };
};
