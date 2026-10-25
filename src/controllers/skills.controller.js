const { SkillCategory } = require("../models");
const { skills } = require("../services/collections");
const { recordActivity } = require("../services/activity.service");
const { revalidateFrontend } = require("../services/revalidation.service");

async function categoriesInOrder() {
  const docs = await SkillCategory.find().sort({ order: 1 });
  return docs.map((d) => d.toJSON());
}

/** GET /skills — `{ categories, skills }`, the shape getSkills() returns on the frontend. */
async function listPublic(_req, res) {
  const [categories, items] = await Promise.all([categoriesInOrder(), skills.findAll({}, { category: 1, order: 1 })]);
  res.json({ data: { categories, skills: items } });
}

/** PUT /admin/skill-categories — title/description edits from the Skills screen. */
async function replaceCategories(req, res) {
  const items = req.valid.body.items;
  await SkillCategory.bulkWrite(
    items.map((c, index) => ({
      updateOne: { filter: { key: c.key }, update: { $set: { title: c.title, description: c.description, order: index + 1 } }, upsert: true },
    })),
  );
  recordActivity("Updated skill categories", req.auth.user);
  revalidateFrontend(["skills"]);
  res.json({ data: await categoriesInOrder() });
}

module.exports = { listPublic, replaceCategories, categoriesInOrder };
