const { home } = require("../services/collections");
const schemas = require("../validators/content.validators");
const { singletonRoutes } = require("./helpers");

/** /api/v1/home (public) and /api/v1/admin/home (Pages & sections screen). */
module.exports = () => singletonRoutes(home, schemas.home);
