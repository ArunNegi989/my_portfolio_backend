const { Router } = require("express");
const auth = require("../controllers/auth.controller");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const schemas = require("../validators/auth.validators");

/**
 * /api/v1/auth — all public except /me. Origin checks for every POST happen globally in app.js.
 * Each sensitive endpoint has its own rate limit.
 */
module.exports = function authRoutes(limiters) {
  const router = Router();
  router.post("/signup", limiters.signup, validate({ body: schemas.signup }), auth.signup);
  router.post("/login", limiters.login, validate({ body: schemas.login }), auth.login);
  router.post("/refresh", limiters.refresh, auth.refresh);
  router.post("/logout", auth.logout);
  router.get("/me", requireAuth, auth.me);
  router.post("/forgot-password", limiters.passwordReset, validate({ body: schemas.forgotPassword }), auth.forgotPassword);
  router.post("/reset-password", limiters.resetSubmit, validate({ body: schemas.resetPassword }), auth.resetPassword);
  return router;
};
