// One service per dataset. Tags match the cacheTag() names used by the frontend's lib/data.

const models = require("../models");
const ApiError = require("../utils/ApiError");
const { createCollectionService, createSingletonService } = require("./content.service");

const profile = createSingletonService({ Model: models.Profile, label: "profile", tags: ["profile"] });
const home = createSingletonService({ Model: models.HomeContent, label: "homepage content", tags: ["home"] });
const settings = createSingletonService({ Model: models.SiteSettings, label: "site settings", tags: ["settings"] });

const projects = createCollectionService({
  Model: models.Project,
  label: "project",
  titleOf: (p) => p.title,
  tags: ["projects"],
  idPrefix: "p",
  sort: { order: 1, title: 1 },
  async beforeSave(data) {
    if (data.experienceId && !(await models.Experience.exists({ id: data.experienceId }))) {
      throw ApiError.badRequest("The linked experience entry does not exist.", [{ field: "experienceId", message: "Unknown experience id." }]);
    }
  },
});

const posts = createCollectionService({
  Model: models.BlogPost,
  label: "article",
  titleOf: (p) => p.title,
  tags: ["posts"],
  idPrefix: "b",
  sort: { publishedAt: -1, title: 1 },
});

const experience = createCollectionService({
  Model: models.Experience,
  label: "experience",
  titleOf: (e) => `${e.role} — ${e.company}`,
  tags: ["experience"],
  idPrefix: "x",
  sort: { order: 1 },
});

const skills = createCollectionService({ Model: models.Skill, label: "skill", titleOf: (s) => s.name, tags: ["skills"], idPrefix: "k", sort: { category: 1, order: 1 } });
const services = createCollectionService({ Model: models.Service, label: "service", titleOf: (s) => s.title, tags: ["services"], idPrefix: "s", sort: { order: 1 } });
const education = createCollectionService({ Model: models.Education, label: "education", titleOf: (e) => e.degree, tags: ["education"], idPrefix: "e", hiddenOrder: true });
const certifications = createCollectionService({ Model: models.Certification, label: "certification", titleOf: (c) => c.title, tags: ["education"], idPrefix: "c", hiddenOrder: true });
const testimonials = createCollectionService({ Model: models.Testimonial, label: "testimonial", titleOf: (t) => t.name, tags: ["testimonials"], idPrefix: "t", hiddenOrder: true });
const socialLinks = createCollectionService({ Model: models.SocialLink, label: "social link", titleOf: (l) => l.label, tags: ["social-links"], idPrefix: "l", hiddenOrder: true });
const seo = createCollectionService({ Model: models.PageSeo, label: "SEO entry", titleOf: (s) => s.label, tags: ["seo"], idPrefix: "seo", hiddenOrder: true });

module.exports = { profile, home, settings, projects, posts, experience, skills, services, education, certifications, testimonials, socialLinks, seo };
