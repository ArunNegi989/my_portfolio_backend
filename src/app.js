// Express application: security middleware, parsers, uploads and route registration.
// No network listening happens here (see server.js), which keeps the app testable.

const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const pinoHttp = require("pino-http");
const { getConfig } = require("./config/env");
const { corsMiddleware } = require("./config/cors");
const logger = require("./utils/logger");
const { createRateLimiters } = require("./middleware/rateLimiters");
const { requireTrustedOrigin } = require("./middleware/csrf");
const { rejectOperatorKeys } = require("./middleware/sanitize");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { createApiRouter } = require("./routes");
const { PUBLIC_PREFIX } = require("./services/storage.service");

/** @param {{ rateLimits?: object }} [options] tests pass small rate limits here */
function createApp({ rateLimits } = {}) {
  const config = getConfig();
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.set("query parser", "simple");

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/api/v1/health" },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
      serializers: {
        req: (req) => ({ method: req.method, url: req.url.split("?")[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(helmet());

  // Uploaded files: served with headers that stop them from running as HTML/script, and with a
  // cross-origin resource policy so the frontend (another origin) can display them.
  app.use(
    PUBLIC_PREFIX,
    express.static(config.uploads.dir, {
      index: false,
      dotfiles: "deny",
      immutable: true,
      maxAge: "365d",
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      },
    }),
  );

  app.use(corsMiddleware());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(rejectOperatorKeys);
  app.use(requireTrustedOrigin);

  app.use((_req, res, next) => {
    // API responses can contain admin data: never let browsers or proxies store them.
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use("/api/v1", createApiRouter({ limiters: createRateLimiters(rateLimits) }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
