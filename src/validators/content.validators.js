// Request schemas for every content type. Field rules follow the existing admin forms
// (my-portfolio-frontend/components/admin/screens/*) so client and server agree.

const {
  z,
  text,
  optionalText,
  id,
  slug,
  email,
  linkUrl,
  imageSrc,
  websiteUrl,
  optional,
  imageAsset,
  stringList,
  order,
  uniqueBy,
  paginationQuery,
} = require("./common");
const { SKILL_CATEGORY_KEYS, HOME_SECTION_KEYS, SOCIAL_PLATFORMS, PUBLISH_STATUSES } = require("../models/content.models");

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR = /^(19|20)\d{2}$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PHONE = /^\+?[\d\s()-]{8,20}$/;

const status = z.enum(PUBLISH_STATUSES);

// ---------- singletons ----------

const profile = z.object({
  name: text(100, { min: 1, message: "Name is required." }),
  shortName: text(20).default(""),
  role: text(100, { min: 1, message: "Role is required." }),
  headline: text(300).default(""),
  intro: text(500).default(""),
  summary: text(2000, { min: 1, message: "Summary is required." }),
  aboutParagraphs: stringList(2000, 20),
  focusAreas: stringList(200, 20),
  email,
  phone: z.union([z.literal(""), text(20).regex(PHONE, "Use digits, spaces and an optional leading +.")]).default(""),
  location: text(100).default(""),
  availability: text(200).default(""),
  availableForWork: z.boolean().default(true),
  resumePath: linkUrl.refine((v) => v.length > 0, "Upload a resume PDF."),
  stats: z
    .array(z.object({ id: id, value: z.coerce.number().min(0).max(1_000_000), suffix: text(10).default(""), label: text(100, { min: 1, message: "Label is required." }) }))
    .max(12)
    .default([])
    .superRefine(uniqueBy("id", "statistic id")),
  portraitImage: imageAsset,
  aboutImage: imageAsset,
});

const home = z.object({
  heroName: text(80, { min: 1 }),
  heroRole: text(80, { min: 1 }),
  heroRoles: z
    .array(text(80))
    .max(12)
    .refine((roles) => roles.some((r) => r.trim()), "Add at least one role."),
  heroRoleInterval: z.coerce.number().min(1.5, "At least 1.5 seconds.").max(10, "At most 10 seconds."),
  heroSupportingText: text(500).default(""),
  primaryCtaLabel: text(60).default(""),
  secondaryCtaLabel: text(60).default(""),
  techLabels: stringList(40, 30),
  featuredProjectSlugs: z.array(slug).max(12).default([]),
  sections: z
    .array(z.object({ key: z.enum(HOME_SECTION_KEYS), label: text(80, { min: 1 }), visible: z.boolean(), eyebrow: text(80).default(""), title: text(200).default("") }))
    .max(HOME_SECTION_KEYS.length)
    .superRefine(uniqueBy("key", "section")),
  contactHeadline: text(200).default(""),
  contactText: text(1000).default(""),
});

const settings = z.object({
  siteName: text(120, { min: 1 }),
  tagline: text(300).default(""),
  defaultOgImage: imageSrc,
  introEnabled: z.boolean(),
  introAudioEnabled: z.boolean().default(false),
  smoothScroll: z.boolean(),
  whatsappNumber: z.union([z.literal(""), z.string().trim().regex(/^\d{8,15}$/, "Use 8–15 digits, no spaces or +.")]).default(""),
  footerNote: text(200).default(""),
  footerHeadline: text(120, { min: 1 }),
  footerInvitation: text(600).default(""),
  footerCtaLabel: text(60, { min: 1 }),
  footerHighlights: stringList(60, 20),
  pageImages: z.object({ skillsHero: imageAsset, educationSide: imageAsset, projectsHero: imageAsset, blogHero: imageAsset }),
});

// ---------- collections ----------

const project = z.object({
  id: id.optional(),
  slug,
  title: text(200, { min: 1, message: "Title is required." }),
  category: text(100, { min: 1, message: "Category is required." }),
  context: text(200).default(""),
  experienceId: optional(id),
  period: optionalText(60),
  summary: text(400, { min: 1, message: "Summary is required." }),
  overview: text(5000).default(""),
  problem: text(5000).default(""),
  goals: stringList(300, 50),
  solution: text(5000).default(""),
  features: stringList(300, 50),
  technologies: z.array(text(60, { min: 1 })).min(1, "Add at least one technology.").max(40),
  process: z.array(z.object({ title: text(120, { min: 1 }), description: text(500).default("") })).max(20).default([]),
  results: stringList(300, 20),
  liveUrl: optional(websiteUrl),
  githubUrl: optional(linkUrl),
  featured: z.boolean().default(false),
  status: status.default("draft"),
  order: order.default(0),
  cover: imageAsset,
  gallery: z.array(imageAsset).max(30).default([]),
  representativeImagery: z.boolean().default(false),
  detailsPending: z.boolean().default(false),
  seoTitle: optionalText(120),
  seoDescription: optionalText(320),
});

const post = z.object({
  id: id.optional(),
  slug,
  title: text(200, { min: 1, message: "Title is required." }),
  excerpt: text(400, { min: 1, message: "Excerpt is required." }),
  category: text(100, { min: 1, message: "Category is required." }),
  tags: stringList(40, 20),
  cover: imageAsset,
  content: z.string().min(50, "Write at least 50 characters.").max(100_000),
  author: text(100).default(""),
  publishedAt: z.string().regex(DATE, "Use a valid date (YYYY-MM-DD)."),
  status: status.default("draft"),
  featured: z.boolean().default(false),
  seoTitle: optionalText(120),
  seoDescription: optionalText(320),
});

const experience = z
  .object({
    id: id.optional(),
    role: text(120, { min: 1, message: "Role is required." }),
    company: text(150, { min: 1, message: "Company is required." }),
    location: text(100).default(""),
    startDate: z.string().regex(MONTH, "Use YYYY-MM."),
    endDate: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().regex(MONTH, "Use YYYY-MM.").nullable()),
    summary: text(1000).default(""),
    responsibilities: stringList(1000, 30),
    relatedProjectSlugs: z.array(slug).max(50).default([]),
    technologies: stringList(60, 40),
    order: order.default(1),
  })
  .refine((v) => v.endDate === null || v.endDate >= v.startDate, { path: ["endDate"], message: "End must be after start." });

const skill = z.object({
  id: id.optional(),
  name: text(60, { min: 1, message: "Enter a skill name." }),
  category: z.enum(SKILL_CATEGORY_KEYS),
  order: order.default(0),
});

const skillCategory = z.object({ key: z.enum(SKILL_CATEGORY_KEYS), title: text(80, { min: 1, message: "Title is required." }), description: text(300).default("") });
const skillCategories = z
  .array(skillCategory)
  .min(1)
  .max(SKILL_CATEGORY_KEYS.length)
  .superRefine(uniqueBy("key", "category"));

const service = z.object({
  id: id.optional(),
  slug,
  title: text(150, { min: 1, message: "Title is required." }),
  shortTitle: text(60).default(""),
  description: text(1000, { min: 1, message: "Description is required." }),
  deliverables: stringList(200, 20),
  technologies: stringList(60, 30),
  image: imageAsset,
  visible: z.boolean().default(true),
  order: order.default(0),
});

const yearOrEmpty = z.union([z.literal(""), z.string().trim().regex(YEAR, "Use a 4-digit year.")]).default("");
const education = z
  .object({
    id: id.optional(),
    degree: text(150, { min: 1, message: "Degree is required." }),
    institution: text(150, { min: 1, message: "Institution is required." }),
    location: text(100).default(""),
    startYear: yearOrEmpty,
    endYear: yearOrEmpty,
  })
  .refine((v) => !v.endYear || !v.startYear || v.endYear >= v.startYear, { path: ["endYear"], message: "End year must be after start year." });

const certification = z.object({
  id: id.optional(),
  title: text(200, { min: 1, message: "Title is required." }),
  issuer: text(150).default(""),
});

const testimonial = z
  .object({
    id: id.optional(),
    name: text(100, { min: 1, message: "Name is required." }),
    role: text(100).default(""),
    company: text(150).default(""),
    quote: text(1500, { min: 1, message: "Quote is required." }),
    isDemo: z.boolean(),
    visible: z.boolean().default(false),
  })
  // Same rule as the admin dialog: demo entries can never be visible on the public site.
  .transform((v) => ({ ...v, visible: v.isDemo ? false : v.visible }));

const socialLink = z.object({
  id: id.optional(),
  platform: z.enum(SOCIAL_PLATFORMS),
  label: text(60, { min: 1, message: "Required" }),
  url: linkUrl.refine((v) => v.length > 0, "URL is required."),
  visible: z.boolean().default(true),
});

const pageSeo = z.object({
  id,
  path: z.string().trim().regex(/^\/[A-Za-z0-9/_-]*$/, "Use a site path starting with /.").max(200),
  label: text(80, { min: 1 }),
  title: text(120, { min: 1, message: "Title is required." }),
  description: text(320, { min: 1, message: "Description is required." }),
  canonical: optional(linkUrl),
  ogImage: optional(imageSrc),
});

const list = (item, keys) => {
  let schema = z.array(item).max(500);
  for (const [key, label] of keys) schema = schema.superRefine(uniqueBy(key, label));
  return z.object({ items: schema });
};

const projectListQuery = paginationQuery.extend({
  status: z.enum([...PUBLISH_STATUSES, "all"]).optional(),
  category: text(100).optional(),
  featured: z.enum(["true", "false"]).optional(),
  q: text(100).optional(),
});

const postListQuery = paginationQuery.extend({
  status: z.enum([...PUBLISH_STATUSES, "all"]).optional(),
  category: text(100).optional(),
  q: text(100).optional(),
});

module.exports = {
  profile,
  home,
  settings,
  project,
  post,
  experience,
  skill,
  skillCategory,
  skillCategories: z.object({ items: skillCategories }),
  service,
  education,
  certification,
  testimonial,
  socialLink,
  pageSeo,
  lists: {
    skills: list(skill.extend({ id }), [["id", "id"]]),
    services: list(service.extend({ id }), [["id", "id"], ["slug", "slug"]]),
    socialLinks: list(socialLink.extend({ id }), [["id", "id"]]),
    seo: list(pageSeo, [["id", "id"], ["path", "path"]]),
  },
  projectListQuery,
  postListQuery,
  emailField: email,
};
