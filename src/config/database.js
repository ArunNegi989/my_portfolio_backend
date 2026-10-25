const mongoose = require("mongoose");
const logger = require("../utils/logger");

// Strip $-operators from query filters built from user input, and fail fast instead of
// queueing queries while the database is unreachable (requests get a 503, not a hang).
mongoose.set("strictQuery", true);
mongoose.set("sanitizeFilter", true);
mongoose.set("bufferCommands", false);
// Models may be registered before the connection exists (CLI scripts), so nothing is created at
// registration time; connectDatabase() builds indexes explicitly once connected.
mongoose.set("autoCreate", false);
mongoose.set("autoIndex", false);

let listenersAttached = false;
let closingOnPurpose = false;

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on("disconnected", () => {
    if (!closingOnPurpose) logger.warn("MongoDB disconnected");
  });
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  mongoose.connection.on("error", (err) => logger.error({ err: { name: err.name, message: err.message } }, "MongoDB connection error"));
}

/** Connects to MongoDB and builds the indexes defined on the models. Collections are created on first write. */
async function connectDatabase(uri) {
  attachListeners();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  // Register every model, then create missing indexes (unique slugs/emails, TTLs). Existing data
  // and existing indexes are never dropped.
  require("../models");
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
  logger.info({ db: mongoose.connection.name }, "Connected to MongoDB");
  return mongoose.connection;
}

async function disconnectDatabase() {
  closingOnPurpose = true;
  try {
    await mongoose.disconnect();
  } finally {
    closingOnPurpose = false;
  }
}

function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, disconnectDatabase, isDatabaseConnected };
