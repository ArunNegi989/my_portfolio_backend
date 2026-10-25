const { getConfig } = require("../config/env");
const ApiError = require("../utils/ApiError");
const { safeEqual } = require("../utils/crypto");
const { csrfTokenFor } = require("../services/token.service");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestOrigin(req) {
  const origin = req.get("origin");
  if (origin) return origin;
  const referer = req.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Every state-changing request must come from an allowed frontend origin. Browsers always send
 * Origin on cross-origin POST/PUT/PATCH/DELETE, so forged cross-site requests are rejected here.
 */
function requireTrustedOrigin(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = requestOrigin(req);
  if (!origin || !getConfig().allowedOrigins.includes(origin)) {
    return next(ApiError.forbidden("Request origin not allowed."));
  }
  next();
}

/**
 * Cookie-authenticated writes must also echo the per-session CSRF token in X-CSRF-Token.
 * The token is returned in the JSON body of login/refresh/me and kept in memory by the client.
 */
function requireCsrfToken(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.auth) return next(ApiError.unauthorized());
  if (!safeEqual(req.get("x-csrf-token"), csrfTokenFor(req.auth.sessionId))) {
    return next(new ApiError(403, "CSRF_TOKEN_INVALID", "Security token missing or invalid. Refresh the page and try again."));
  }
  next();
}

module.exports = { requireTrustedOrigin, requireCsrfToken };
