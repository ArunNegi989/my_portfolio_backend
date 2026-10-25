const { profile } = require("../services/collections");
const schemas = require("../validators/content.validators");
const { singletonRoutes } = require("./helpers");

/** /api/v1/profile (public) and /api/v1/admin/profile (Profile screen). */
module.exports = () => singletonRoutes(profile, schemas.profile);
