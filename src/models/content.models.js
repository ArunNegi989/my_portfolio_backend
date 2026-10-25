// Content models. Field names and shapes mirror my-portfolio-frontend/types/content.ts.

const mongoose = require("mongoose");
const { Schema } = mongoose;
const { SLUG_PATTERN, imageAssetSchema, contentSchema, singletonSchema, toPublicJSON } = require("./shared");

const SKILL_CATEGORY_KEYS = ["frontend", "backend", "databases", "cms", "tools"];
const HOME_SECTION_KEYS = ["about", "projects", "skills", "experience", "services", "blog", "contact"];
const SOCIAL_PLATFORMS = ["github", "linkedin", "email", "whatsapp", "website", "other"];
const PUBLISH_STATUSES = ["published", "draft"];

const str = (extra = {}) => ({ type: String, trim: true, default: "", ...extra });
const strList = { type: [{ type: String, trim: true }], default: [] };

// ---------- singletons ----------

const Profile = mongoose.model(
  "Profile",
  singletonSchema({
    name: str({ required: true }),
    shortName: str(),
    role: str({ required: true }),
    headline: str(),
    intro: str(),
    summary: str({ required: true }),
    aboutParagraphs: strList,
    focusAreas: strList,
    email: str({ required: true, lowercase: true }),
    phone: str(),
    location: str(),
    availability: str(),
    availableForWork: { type: Boolean, default: true },
    resumePath: str(),
    stats: {
      type: [new Schema({ id: str({ required: true }), value: { type: Number, default: 0 }, suffix: str(), label: str({ required: true }) }, { _id: false })],
      default: [],
    },
    portraitImage: { type: imageAssetSchema, default: () => ({}) },
    aboutImage: { type: imageAssetSchema, default: () => ({}) },
  }),
  "profile",
);

const HomeContent = mongoose.model(
  "HomeContent",
  singletonSchema({
    heroName: str({ required: true }),
    heroRole: str({ required: true }),
    heroRoles: strList,
    heroRoleInterval: { type: Number, min: 1.5, max: 10, default: 3.5 },
    heroSupportingText: str(),
    primaryCtaLabel: str(),
    secondaryCtaLabel: str(),
    techLabels: strList,
    featuredProjectSlugs: strList,
    sections: {
      type: [
        new Schema(
          { key: { type: String, enum: HOME_SECTION_KEYS, required: true }, label: str({ required: true }), visible: { type: Boolean, default: true }, eyebrow: str(), title: str() },
          { _id: false },
        ),
      ],
      default: [],
    },
    contactHeadline: str(),
    contactText: str(),
  }),
  "home_content",
);

const SiteSettings = mongoose.model(
  "SiteSettings",
  singletonSchema({
    siteName: str({ required: true }),
    tagline: str(),
    defaultOgImage: str(),
    introEnabled: { type: Boolean, default: true },
    introAudioEnabled: { type: Boolean, default: false },
    smoothScroll: { type: Boolean, default: true },
    whatsappNumber: str(),
    footerNote: str(),
    footerHeadline: str(),
    footerInvitation: str(),
    footerCtaLabel: str(),
    footerHighlights: strList,
    pageImages: {
      skillsHero: { type: imageAssetSchema, default: () => ({}) },
      educationSide: { type: imageAssetSchema, default: () => ({}) },
      projectsHero: { type: imageAssetSchema, default: () => ({}) },
      blogHero: { type: imageAssetSchema, default: () => ({}) },
    },
  }),
  "site_settings",
);

// ---------- collections ----------

const projectSchema = contentSchema({
  slug: str({ required: true, unique: true, match: SLUG_PATTERN }),
  title: str({ required: true }),
  category: str({ required: true }),
  context: str(),
  experienceId: { type: String, trim: true },
  period: { type: String, trim: true },
  summary: str({ required: true }),
  overview: str(),
  problem: str(),
  goals: strList,
  solution: str(),
  features: strList,
  technologies: strList,
  process: { type: [new Schema({ title: str({ required: true }), description: str() }, { _id: false })], default: [] },
  results: strList,
  liveUrl: { type: String, trim: true },
  githubUrl: { type: String, trim: true },
  featured: { type: Boolean, default: false },
  status: { type: String, enum: PUBLISH_STATUSES, default: "draft" },
  order: { type: Number, default: 0 },
  cover: { type: imageAssetSchema, required: true },
  gallery: { type: [imageAssetSchema], default: [] },
  representativeImagery: { type: Boolean, default: false },
  detailsPending: { type: Boolean, default: false },
  seoTitle: { type: String, trim: true },
  seoDescription: { type: String, trim: true },
});
projectSchema.index({ status: 1, order: 1 });
projectSchema.index({ experienceId: 1, order: 1 });
const Project = mongoose.model("Project", projectSchema, "projects");

const postSchema = contentSchema({
  slug: str({ required: true, unique: true, match: SLUG_PATTERN }),
  title: str({ required: true }),
  excerpt: str({ required: true }),
  category: str({ required: true }),
  tags: strList,
  cover: { type: imageAssetSchema, required: true },
  content: { type: String, required: true },
  author: str(),
  publishedAt: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, enum: PUBLISH_STATUSES, default: "draft" },
  featured: { type: Boolean, default: false },
  seoTitle: { type: String, trim: true },
  seoDescription: { type: String, trim: true },
});
postSchema.index({ status: 1, publishedAt: -1 });
const BlogPost = mongoose.model("BlogPost", postSchema, "blog_posts");

const experienceSchema = contentSchema({
  role: str({ required: true }),
  company: str({ required: true }),
  location: str(),
  startDate: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  endDate: { type: String, default: null, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  summary: str(),
  responsibilities: strList,
  relatedProjectSlugs: strList,
  technologies: strList,
  order: { type: Number, default: 0 },
});
experienceSchema.index({ order: 1 });
const Experience = mongoose.model("Experience", experienceSchema, "experiences");

const SkillCategory = mongoose.model(
  "SkillCategory",
  new Schema(
    {
      key: { type: String, enum: SKILL_CATEGORY_KEYS, required: true, unique: true },
      title: str({ required: true }),
      description: str(),
      order: { type: Number, default: 0 },
    },
    { id: false, timestamps: true, toJSON: toPublicJSON(["order"]) },
  ),
  "skill_categories",
);

const skillSchema = contentSchema({
  name: str({ required: true }),
  category: { type: String, enum: SKILL_CATEGORY_KEYS, required: true },
  order: { type: Number, default: 0 },
});
skillSchema.index({ category: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
skillSchema.index({ category: 1, order: 1 });
const Skill = mongoose.model("Skill", skillSchema, "skills");

const serviceSchema = contentSchema({
  slug: str({ required: true, unique: true, match: SLUG_PATTERN }),
  title: str({ required: true }),
  shortTitle: str(),
  description: str({ required: true }),
  deliverables: strList,
  technologies: strList,
  image: { type: imageAssetSchema, required: true },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});
serviceSchema.index({ visible: 1, order: 1 });
const Service = mongoose.model("Service", serviceSchema, "services");

const Education = mongoose.model(
  "Education",
  contentSchema(
    {
      degree: str({ required: true }),
      institution: str({ required: true }),
      location: str(),
      startYear: str(),
      endYear: str(),
      order: { type: Number, default: 0 },
    },
    { hidden: ["order"] },
  ),
  "education",
);

const Certification = mongoose.model(
  "Certification",
  contentSchema({ title: str({ required: true }), issuer: str(), order: { type: Number, default: 0 } }, { hidden: ["order"] }),
  "certifications",
);

const Testimonial = mongoose.model(
  "Testimonial",
  contentSchema(
    {
      name: str({ required: true }),
      role: str(),
      company: str(),
      quote: str({ required: true }),
      isDemo: { type: Boolean, default: true },
      visible: { type: Boolean, default: false },
      order: { type: Number, default: 0 },
    },
    { hidden: ["order"] },
  ),
  "testimonials",
);

const SocialLink = mongoose.model(
  "SocialLink",
  contentSchema(
    {
      platform: { type: String, enum: SOCIAL_PLATFORMS, required: true },
      label: str({ required: true }),
      url: str({ required: true }),
      visible: { type: Boolean, default: true },
      order: { type: Number, default: 0 },
    },
    { hidden: ["order"] },
  ),
  "social_links",
);

const PageSeo = mongoose.model(
  "PageSeo",
  contentSchema(
    {
      path: str({ required: true, unique: true }),
      label: str({ required: true }),
      title: str({ required: true }),
      description: str({ required: true }),
      canonical: { type: String, trim: true },
      ogImage: { type: String, trim: true },
      order: { type: Number, default: 0 },
    },
    { hidden: ["order"] },
  ),
  "page_seo",
);

module.exports = {
  SKILL_CATEGORY_KEYS,
  HOME_SECTION_KEYS,
  SOCIAL_PLATFORMS,
  PUBLISH_STATUSES,
  Profile,
  HomeContent,
  SiteSettings,
  Project,
  BlogPost,
  Experience,
  SkillCategory,
  Skill,
  Service,
  Education,
  Certification,
  Testimonial,
  SocialLink,
  PageSeo,
};
