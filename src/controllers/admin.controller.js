const c = require("../services/collections");
const { recentActivity } = require("../services/activity.service");
const { categoriesInOrder } = require("./skills.controller");

/**
 * GET /admin/content — everything the dashboard edits, in one response (the shape of the
 * frontend's AdminState). Singletons are null until the database has been seeded.
 */
async function content(_req, res) {
  const [profile, home, settings, projects, posts, experience, skills, skillCategories, services, education, certifications, testimonials, socialLinks, seo, activity] =
    await Promise.all([
      c.profile.get(),
      c.home.get(),
      c.settings.get(),
      c.projects.findAll(),
      c.posts.findAll(),
      c.experience.findAll(),
      c.skills.findAll(),
      categoriesInOrder(),
      c.services.findAll(),
      c.education.findAll(),
      c.certifications.findAll(),
      c.testimonials.findAll(),
      c.socialLinks.findAll(),
      c.seo.findAll(),
      recentActivity(),
    ]);
  res.json({
    data: { profile, home, settings, projects, posts, experience, skills, skillCategories, services, education, certifications, testimonials, socialLinks, seo, activity },
  });
}

module.exports = { content };
