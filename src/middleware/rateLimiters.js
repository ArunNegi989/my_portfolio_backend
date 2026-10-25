const { rateLimit } = require("express-rate-limit");

// In-memory counters per process. For several API instances behind a load balancer, plug in a
// shared store (e.g. rate-limit-redis) — see SECURITY.md.
const DEFAULTS = {
  login: { windowMs: 15 * 60_000, limit: 20 },
  signup: { windowMs: 60 * 60_000, limit: 10 },
  passwordReset: { windowMs: 15 * 60_000, limit: 5 },
  resetSubmit: { windowMs: 15 * 60_000, limit: 10 },
  refresh: { windowMs: 15 * 60_000, limit: 120 },
  contact: { windowMs: 10 * 60_000, limit: 5 },
  upload: { windowMs: 15 * 60_000, limit: 60 },
  admin: { windowMs: 15 * 60_000, limit: 600 },
};

const MESSAGES = {
  login: "Too many sign-in attempts. Please wait a few minutes and try again.",
  signup: "Too many sign-up attempts. Please try again later.",
  passwordReset: "Too many password reset requests. Please wait a few minutes and try again.",
  resetSubmit: "Too many attempts. Please wait a few minutes and try again.",
  refresh: "Too many requests. Please slow down.",
  contact: "You've sent several messages in a short time. Please wait a few minutes and try again.",
  upload: "Too many uploads. Please wait a few minutes and try again.",
  admin: "Too many requests. Please slow down.",
};

/** Builds one limiter per area; `overrides` lets tests use tiny limits. */
function createRateLimiters(overrides = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULTS).map(([name, base]) => {
      const options = { ...base, ...overrides[name] };
      return [
        name,
        rateLimit({
          windowMs: options.windowMs,
          limit: options.limit,
          standardHeaders: "draft-7",
          legacyHeaders: false,
          handler: (_req, res, _next, opts) =>
            res.status(opts.statusCode).json({ error: { code: "RATE_LIMITED", message: MESSAGES[name] } }),
        }),
      ];
    }),
  );
}

module.exports = { createRateLimiters };
