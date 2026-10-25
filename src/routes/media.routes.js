const { Router } = require("express");
const media = require("../controllers/media.controller");
const { validate } = require("../middleware/validate");
const { objectIdParam, paginationQuery } = require("../validators/common");

/** Admin-only uploads. Files are served publicly from /uploads/<random-name>. */
module.exports = (limiters) => {
  const adminRouter = Router();
  adminRouter.post("/", limiters.upload, media.uploadMiddleware(), media.upload);
  adminRouter.get("/", validate({ query: paginationQuery }), media.list);
  adminRouter.delete("/:id", validate({ params: objectIdParam }), media.remove);
  return { adminRouter };
};
