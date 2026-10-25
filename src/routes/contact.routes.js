const { Router } = require("express");
const contact = require("../controllers/contact.controller");
const { validate } = require("../middleware/validate");
const { objectIdParam } = require("../validators/common");
const schemas = require("../validators/contact.validators");

/** Public contact form + the admin Messages screen. */
module.exports = (limiters) => {
  const publicRouter = Router();
  publicRouter.post("/", limiters.contact, validate({ body: schemas.contactSubmission }), contact.submit);

  const adminRouter = Router();
  adminRouter.get("/", validate({ query: schemas.messageListQuery }), contact.list);
  adminRouter.patch("/:id", validate({ params: objectIdParam, body: schemas.messageUpdate }), contact.updateStatus);
  adminRouter.delete("/:id", validate({ params: objectIdParam }), contact.remove);
  return { publicRouter, adminRouter };
};
