const { Router } = require("express");
const { validate } = require("../middleware/validate");
const { idParam } = require("../validators/common");
const { collectionHandlers, singletonHandlers } = require("../controllers/content.controller");

const NOT_SEEDED = "No content yet. Run `npm run seed` in my-portfolio-backend.";

/** POST /, PUT /:id, DELETE /:id (+ PUT / for whole-list saves) on an admin router. */
function mountCollectionAdmin(router, service, itemSchema, { listSchema } = {}) {
  const h = collectionHandlers(service);
  router.post("/", validate({ body: itemSchema }), h.create);
  if (listSchema) router.put("/", validate({ body: listSchema }), h.replaceAll);
  router.put("/:id", validate({ params: idParam, body: itemSchema }), h.update);
  router.delete("/:id", validate({ params: idParam }), h.remove);
  return router;
}

/** Public GET / plus admin GET / and PUT / for a single-document dataset. */
function singletonRoutes(service, schema) {
  const h = singletonHandlers(service, NOT_SEEDED);
  const publicRouter = Router();
  const adminRouter = Router();
  publicRouter.get("/", h.get);
  adminRouter.get("/", h.get);
  adminRouter.put("/", validate({ body: schema }), h.put);
  return { publicRouter, adminRouter };
}

module.exports = { mountCollectionAdmin, singletonRoutes };
