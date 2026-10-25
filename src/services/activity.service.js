const { ActivityLog } = require("../models");
const logger = require("../utils/logger");

/** Records an admin change for the dashboard's "Recent activity" card. Never fails the request. */
async function recordActivity(message, user) {
  try {
    await ActivityLog.create({ message: message.slice(0, 300), actor: user?._id });
  } catch (err) {
    logger.warn({ err: { message: err.message } }, "Could not record activity");
  }
}

async function recentActivity(limit = 40) {
  const entries = await ActivityLog.find().sort({ createdAt: -1 }).limit(limit);
  return entries.map((e) => e.toJSON());
}

module.exports = { recordActivity, recentActivity };
