const { Router } = require("express");
const skills = require("../controllers/skills.controller");
const service = require("../services/collections").skills;
const schemas = require("../validators/content.validators");
const { validate } = require("../middleware/validate");
const { mountCollectionAdmin } = require("./helpers");

/** Skills and their categories (Skills screen). */
module.exports = () => {
  const publicRouter = Router();
  publicRouter.get("/", skills.listPublic);

  const adminRouter = Router();
  adminRouter.get("/", skills.listPublic);
  mountCollectionAdmin(adminRouter, service, schemas.skill, { listSchema: schemas.lists.skills });

  const categoriesAdminRouter = Router();
  categoriesAdminRouter.put("/", validate({ body: schemas.skillCategories }), skills.replaceCategories);

  return { publicRouter, adminRouter, categoriesAdminRouter };
};
