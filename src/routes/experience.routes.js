const { Router } = require("express");
const service = require("../services/collections").experience;
const schemas = require("../validators/content.validators");
const { mountCollectionAdmin } = require("./helpers");

module.exports = () => {
  const publicRouter = Router();
  publicRouter.get("/", async (_req, res) => res.json({ data: await service.findAll() }));

  const adminRouter = Router();
  adminRouter.get("/", async (_req, res) => res.json({ data: await service.findAll() }));
  mountCollectionAdmin(adminRouter, service, schemas.experience);
  return { publicRouter, adminRouter };
};
