// Starts the HTTP server once configuration is valid and MongoDB is reachable,
// and shuts down cleanly on SIGINT/SIGTERM.

const { getConfig, ConfigError } = require("./config/env");

let config;
try {
  config = getConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

const logger = require("./utils/logger");
const { connectDatabase, disconnectDatabase } = require("./config/database");
const { isEmailConfigured } = require("./config/email");
const { ensureUploadDir } = require("./services/storage.service");
const { createApp } = require("./app");

async function start() {
  try {
    await connectDatabase(config.mongoUri);
  } catch (err) {
    logger.fatal({ err: { name: err.name, message: err.message } }, "Could not connect to MongoDB. Check MONGODB_URI and network access (Atlas IP allow list).");
    process.exit(1);
  }

  await ensureUploadDir();
  if (!isEmailConfigured()) logger.warn("SMTP is not configured: password reset and contact notification emails are disabled.");
  if (!config.revalidate.secret) logger.warn("REVALIDATE_SECRET is not set: the frontend will pick up content changes only when its cache expires.");

  const server = createApp().listen(config.port, () => {
    logger.info({ port: config.port, env: config.env, origins: config.allowedOrigins }, "API listening");
  });

  let closing = false;
  async function shutdown(signal) {
    if (closing) return;
    closing = true;
    logger.info({ signal }, "Shutting down");
    const force = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(async () => {
      await disconnectDatabase().catch(() => {});
      clearTimeout(force);
      process.exit(0);
    });
  }
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "Unhandled promise rejection"));
}

start();
