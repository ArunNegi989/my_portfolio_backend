const pino = require("pino");
// Loads .env (side effect) without requiring the full server configuration, so CLI scripts that
// only need MONGODB_URI can log too.
require("../config/env");

// Anything that can carry a credential is redacted before it reaches the log output.
const REDACT = [
  "req.headers.cookie",
  "req.headers.authorization",
  'req.headers["x-csrf-token"]',
  'req.headers["x-revalidate-secret"]',
  'res.headers["set-cookie"]',
  "password",
  "*.password",
  "token",
  "*.token",
  "passwordHash",
  "*.passwordHash",
];

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info");

const logger = pino({
  level,
  redact: { paths: REDACT, censor: "[redacted]" },
  base: { service: "my-portfolio-backend" },
});

module.exports = logger;
