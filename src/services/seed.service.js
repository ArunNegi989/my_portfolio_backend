// Imports the site's original content (seed/content.json). Insert-only: records whose id already
// exists are left untouched, so running it again never overwrites edits made in the dashboard.

const fs = require("node:fs");
const path = require("node:path");
const models = require("../models");
const schemas = require("../validators/content.validators");

const DEFAULT_FILE = path.resolve(__dirname, "../../seed/content.json");

const COLLECTIONS = [
  { key: "projects", Model: models.Project, schema: schemas.project },
  { key: "posts", Model: models.BlogPost, schema: schemas.post },
  { key: "experience", Model: models.Experience, schema: schemas.experience },
  { key: "skills", Model: models.Skill, schema: schemas.skill },
  { key: "services", Model: models.Service, schema: schemas.service },
  { key: "education", Model: models.Education, schema: schemas.education, hiddenOrder: true },
  { key: "certifications", Model: models.Certification, schema: schemas.certification, hiddenOrder: true },
  { key: "testimonials", Model: models.Testimonial, schema: schemas.testimonial, hiddenOrder: true },
  { key: "socialLinks", Model: models.SocialLink, schema: schemas.socialLink, hiddenOrder: true },
  { key: "seo", Model: models.PageSeo, schema: schemas.pageSeo, hiddenOrder: true },
];

const SINGLETONS = [
  { key: "profile", Model: models.Profile, schema: schemas.profile },
  { key: "home", Model: models.HomeContent, schema: schemas.home },
  { key: "settings", Model: models.SiteSettings, schema: schemas.settings },
];

function parseOrThrow(schema, value, label) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Seed data for ${label} is invalid — ${issues}`);
  }
  return result.data;
}

function loadSeedFile(file = DEFAULT_FILE) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Validates everything first (nothing is written if any record is invalid), then inserts missing
 * records. Returns per-dataset counts of inserted vs. already-present records.
 */
async function seedContent(content = loadSeedFile(), { dryRun = false } = {}) {
  const plan = [];

  for (const { key, Model, schema } of SINGLETONS) {
    if (!content[key]) continue;
    plan.push({ key, Model, singleton: true, docs: [parseOrThrow(schema, content[key], key)] });
  }
  for (const { key, Model, schema, hiddenOrder } of COLLECTIONS) {
    const items = content[key] ?? [];
    const docs = items.map((item, index) => {
      const parsed = parseOrThrow(schema, item, `${key}[${index}] (${item.id ?? "no id"})`);
      if (!parsed.id) throw new Error(`Seed data for ${key}[${index}] has no id.`);
      return hiddenOrder ? { ...parsed, order: index + 1 } : parsed;
    });
    plan.push({ key, Model, docs });
  }
  const categories = (content.skillCategories ?? []).map((c, index) => ({ ...parseOrThrow(schemas.skillCategory, c, `skillCategories[${index}]`), order: index + 1 }));

  const report = {};
  for (const { key, Model, singleton, docs } of plan) {
    if (singleton) {
      const exists = await Model.exists({ singleton: "main" });
      if (!exists && !dryRun) await Model.updateOne({ singleton: "main" }, { $setOnInsert: { ...docs[0], singleton: "main" } }, { upsert: true });
      report[key] = { inserted: exists ? 0 : 1, existing: exists ? 1 : 0 };
      continue;
    }
    const existingIds = new Set((await Model.find().select("id").lean()).map((d) => d.id));
    const missing = docs.filter((d) => !existingIds.has(d.id));
    if (missing.length && !dryRun) {
      await Model.bulkWrite(missing.map((doc) => ({ updateOne: { filter: { id: doc.id }, update: { $setOnInsert: doc }, upsert: true } })));
    }
    report[key] = { inserted: missing.length, existing: docs.length - missing.length };
  }

  const existingKeys = new Set((await models.SkillCategory.find().select("key").lean()).map((c) => c.key));
  const missingCategories = categories.filter((c) => !existingKeys.has(c.key));
  if (missingCategories.length && !dryRun) {
    await models.SkillCategory.bulkWrite(missingCategories.map((c) => ({ updateOne: { filter: { key: c.key }, update: { $setOnInsert: c }, upsert: true } })));
  }
  report.skillCategories = { inserted: missingCategories.length, existing: categories.length - missingCategories.length };

  return report;
}

module.exports = { seedContent, loadSeedFile, DEFAULT_FILE };
