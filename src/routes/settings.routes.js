const { settings } = require("../services/collections");
const schemas = require("../validators/content.validators");
const { singletonRoutes } = require("./helpers");

/** /api/v1/settings (public) and /api/v1/admin/settings (Settings screen). */
module.exports = () => singletonRoutes(settings, schemas.settings);
