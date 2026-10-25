const { Router } = require("express");
const { education, certifications } = require("../services/collections");
const schemas = require("../validators/content.validators");
const { mountCollectionAdmin } = require("./helpers");

/** Education and certifications share the Education screen and the About page section. */
module.exports = () => {
  const publicRouter = Router();
  publicRouter.get("/", async (_req, res) => {
    const [educationItems, certificationItems] = await Promise.all([education.findAll(), certifications.findAll()]);
    res.json({ data: { education: educationItems, certifications: certificationItems } });
  });

  const adminRouter = Router();
  adminRouter.get("/", async (_req, res) => res.json({ data: await education.findAll() }));
  mountCollectionAdmin(adminRouter, education, schemas.education);

  const certificationsAdminRouter = Router();
  certificationsAdminRouter.get("/", async (_req, res) => res.json({ data: await certifications.findAll() }));
  mountCollectionAdmin(certificationsAdminRouter, certifications, schemas.certification);

  return { publicRouter, adminRouter, certificationsAdminRouter };
};
