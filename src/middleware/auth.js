const { Session, User } = require("../models");
const ApiError = require("../utils/ApiError");
const { ACCESS_COOKIE, verifyAccessToken } = require("../services/token.service");

/**
 * Requires a valid access token AND a live session: the session must exist, not be revoked or
 * expired, and the password must not have changed since it was created. Logout and password
 * resets therefore take effect immediately, not when the 15-minute access token expires.
 */
async function requireAuth(req, _res, next) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return next(ApiError.unauthorized());

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(ApiError.unauthorized("Your session has expired. Please sign in again."));
  }

  const session = await Session.findById(payload.sid).lean();
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.toString() !== payload.sub) {
    return next(ApiError.unauthorized("Your session has ended. Please sign in again."));
  }
  const user = await User.findById(payload.sub);
  if (!user || (user.passwordChangedAt && user.passwordChangedAt > session.createdAt)) {
    return next(ApiError.unauthorized("Your session has ended. Please sign in again."));
  }

  req.auth = { user, sessionId: session._id.toString() };
  next();
}

/** Role check done on the server for every protected route; hiding links in the UI is not relied on. */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.user.role)) return next(ApiError.forbidden("This account doesn't have access to the dashboard."));
    next();
  };
}

module.exports = { requireAuth, requireRole };
