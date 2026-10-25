const { Router } = require("express");
const service = require("../services/collections").socialLinks;
const schemas = require("../validators/content.validators");
const { mountCollectionAdmin } = require("./helpers");

module.exports = () => {
  const publicRouter = Router();
  publicRouter.get("/", async (_req, res) => res.json({ data: await service.findAll({ visible: true }) }));

  const adminRouter = Router();
  adminRouter.get("/", async (_req, res) => res.json({ data: await service.findAll() }));
  // The Social links screen saves the whole ordered list at once (PUT /).
  mountCollectionAdmin(adminRouter, service, schemas.socialLink, { listSchema: schemas.lists.socialLinks });
  return { publicRouter, adminRouter };
};
