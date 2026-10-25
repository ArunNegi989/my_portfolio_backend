// Central route registration for /api/v1.

const { Router } = require("express");
const { isDatabaseConnected } = require("../config/database");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireCsrfToken } = require("../middleware/csrf");
const adminController = require("../controllers/admin.controller");

const authRoutes = require("./auth.routes");
const profileRoutes = require("./profile.routes");
const homeRoutes = require("./home.routes");
const settingsRoutes = require("./settings.routes");
const projectsRoutes = require("./projects.routes");
const postsRoutes = require("./posts.routes");
const experienceRoutes = require("./experience.routes");
const skillsRoutes = require("./skills.routes");
const servicesRoutes = require("./services.routes");
const educationRoutes = require("./education.routes");
const testimonialsRoutes = require("./testimonials.routes");
const socialLinksRoutes = require("./socialLinks.routes");
const seoRoutes = require("./seo.routes");
const contactRoutes = require("./contact.routes");
const mediaRoutes = require("./media.routes");

function createApiRouter({ limiters }) {
  const api = Router();

  api.get("/health", (_req, res) => {
    const database = isDatabaseConnected() ? "connected" : "disconnected";
    res.status(database === "connected" ? 200 : 503).json({ data: { status: database === "connected" ? "ok" : "degraded", database } });
  });

  api.use("/auth", authRoutes(limiters));

  // Every admin route below requires: a valid session, the admin role, and (for writes) the CSRF token.
  const admin = Router();
  admin.use(limiters.admin, requireAuth, requireRole("admin"), requireCsrfToken);
  admin.get("/content", adminController.content);

  const mount = (path, routes) => {
    if (routes.publicRouter) api.use(path, routes.publicRouter);
    if (routes.adminRouter) admin.use(path, routes.adminRouter);
  };

  mount("/profile", profileRoutes());
  mount("/home", homeRoutes());
  mount("/settings", settingsRoutes());
  mount("/projects", projectsRoutes());
  mount("/posts", postsRoutes());
  mount("/experience", experienceRoutes());
  const skills = skillsRoutes();
  mount("/skills", skills);
  admin.use("/skill-categories", skills.categoriesAdminRouter);
  mount("/services", servicesRoutes());
  const education = educationRoutes();
  mount("/education", education);
  admin.use("/certifications", education.certificationsAdminRouter);
  mount("/testimonials", testimonialsRoutes());
  mount("/social-links", socialLinksRoutes());
  mount("/seo", seoRoutes());
  const contact = contactRoutes(limiters);
  api.use("/contact", contact.publicRouter);
  admin.use("/messages", contact.adminRouter);
  admin.use("/media", mediaRoutes(limiters).adminRouter);

  api.use("/admin", admin);
  return api;
}

module.exports = { createApiRouter };
