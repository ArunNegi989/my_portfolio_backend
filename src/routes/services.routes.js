const { Router } = require("express");
const service = require("../services/collections").services;
const schemas = require("../validators/content.validators");
const { mountCollectionAdmin } = require("./helpers");

module.exports = () => {
  const publicRouter = Router();
  publicRouter.get("/", async (_req, res) => res.json({ data: await service.findAll({ visible: true }) }));

  const adminRouter = Router();
  adminRouter.get("/", async (_req, res) => res.json({ data: await service.findAll() }));
  mountCollectionAdmin(adminRouter, service, schemas.service, { listSchema: schemas.lists.services });
  return { publicRouter, adminRouter };
};
