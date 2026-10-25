// Accounts, sessions and password resets.

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { trusted } = require("mongoose");
const { getConfig } = require("../config/env");
const { User, Session, PasswordResetToken } = require("../models");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const { normalizeEmail, durationToMs } = require("../utils/helpers");
const { randomToken, sha256 } = require("../utils/crypto");
const tokens = require("./token.service");
const email = require("./email.service");

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;
/** Two tabs refreshing with the same token within this window is a race, not token theft. */
const ROTATION_GRACE_MS = 20_000;

const INVALID_CREDENTIALS = "Invalid email or password.";
const SIGNUP_MESSAGE =
  "If this email address can be registered, your account has been created. New accounts can't open the dashboard until an administrator grants access.";
const FORGOT_MESSAGE = "If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder.";
const INVALID_RESET = "This reset link is invalid or has expired. Request a new one.";

// Compared against when the email doesn't exist, so response time doesn't reveal whether it does.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-1", BCRYPT_COST);

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

function sessionUnauthorized() {
  return ApiError.unauthorized("Your session has ended. Please sign in again.");
}

/** Public signup: never creates an admin, and answers the same way for new and existing emails. */
async function signup({ name, email: rawEmail, password }) {
  if (!getConfig().allowPublicSignup) throw ApiError.forbidden("Registration is closed.");
  const emailAddress = normalizeEmail(rawEmail);
  const passwordHash = await hashPassword(password);
  try {
    const exists = await User.exists({ email: emailAddress });
    if (!exists) await User.create({ name, email: emailAddress, passwordHash, role: "user" });
  } catch (err) {
    if (err?.code !== 11000) throw err; // a concurrent signup created it first: same generic answer
  }
  return { message: SIGNUP_MESSAGE };
}

async function createSession(user, userAgent, persistent) {
  const expiresAt = new Date(Date.now() + durationToMs(getConfig().jwt.refreshExpiresIn));
  const session = new Session({ user: user._id, tokenHash: "pending", expiresAt, persistent, userAgent: String(userAgent ?? "").slice(0, 300) });
  const { token: refreshToken, jti } = tokens.signRefreshToken({ userId: user._id.toString(), sessionId: session._id.toString(), expiresAt });
  session.tokenHash = sha256(jti);
  await session.save();
  return { session, refreshToken };
}

function issueAccessToken(user, session) {
  return tokens.signAccessToken({ userId: user._id.toString(), sessionId: session._id.toString(), role: user.role });
}

async function login({ email: rawEmail, password, remember = true }, { userAgent } = {}) {
  const emailAddress = normalizeEmail(rawEmail);
  const user = await User.findOne({ email: emailAddress }).select("+passwordHash +failedLoginAttempts +lockUntil");

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized(INVALID_CREDENTIALS);
  }

  const locked = user.lockUntil && user.lockUntil > new Date();
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (locked || !valid) {
    if (!locked) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const update = attempts >= MAX_FAILED_LOGINS ? { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLoginAttempts: attempts };
      await User.updateOne({ _id: user._id }, { $set: update });
      if (update.lockUntil) logger.warn({ userId: user._id.toString() }, "Account temporarily locked after repeated failed sign-ins");
    }
    throw ApiError.unauthorized(INVALID_CREDENTIALS);
  }

  await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: new Date() } });
  const { session, refreshToken } = await createSession(user, userAgent, remember);
  return {
    user: user.toSafeJSON(),
    accessToken: issueAccessToken(user, session),
    refreshToken,
    persistent: session.persistent,
    csrfToken: tokens.csrfTokenFor(session._id.toString()),
  };
}

/**
 * Rotates the refresh token. Presenting an already-rotated token (outside the short multi-tab
 * grace window) is treated as theft: the whole session is revoked.
 */
async function refresh(refreshToken) {
  if (!refreshToken) throw ApiError.unauthorized();
  let payload;
  try {
    payload = tokens.verifyRefreshToken(refreshToken);
  } catch {
    throw sessionUnauthorized();
  }

  const session = await Session.findById(payload.sid);
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.toString() !== payload.sub) throw sessionUnauthorized();

  const user = await User.findById(payload.sub);
  if (!user || (user.passwordChangedAt && user.passwordChangedAt > session.createdAt)) {
    await revokeSession(session, "password-changed");
    throw sessionUnauthorized();
  }

  const presented = sha256(payload.jti);
  const csrfToken = tokens.csrfTokenFor(session._id.toString());

  if (presented === session.tokenHash) {
    const { token: nextToken, jti } = tokens.signRefreshToken({ userId: user._id.toString(), sessionId: session._id.toString(), expiresAt: session.expiresAt });
    // Conditional update: if two requests race with the same token, only one rotation wins.
    const rotated = await Session.findOneAndUpdate(
      { _id: session._id, tokenHash: presented, revokedAt: null },
      { $set: { tokenHash: sha256(jti), previousTokenHash: presented, rotatedAt: new Date(), lastUsedAt: new Date() } },
      { new: true },
    );
    if (rotated) return { user: user.toSafeJSON(), accessToken: issueAccessToken(user, rotated), refreshToken: nextToken, persistent: rotated.persistent, csrfToken };
    const fresh = await Session.findById(session._id);
    if (fresh?.previousTokenHash === presented && fresh.rotatedAt && Date.now() - fresh.rotatedAt.getTime() < ROTATION_GRACE_MS) {
      return { user: user.toSafeJSON(), accessToken: issueAccessToken(user, fresh), refreshToken: null, csrfToken };
    }
    throw sessionUnauthorized();
  }

  if (presented === session.previousTokenHash && session.rotatedAt && Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS) {
    // Another tab already rotated; keep its new cookie and just issue an access token.
    return { user: user.toSafeJSON(), accessToken: issueAccessToken(user, session), refreshToken: null, csrfToken };
  }

  await revokeSession(session, "refresh-token-reuse");
  logger.warn({ userId: user._id.toString(), sessionId: session._id.toString() }, "Refresh token reuse detected; session revoked");
  throw sessionUnauthorized();
}

async function revokeSession(session, reason) {
  await Session.updateOne({ _id: session._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
}

/** Best effort: works even with expired tokens, so a logout always clears the server session. */
async function logout({ refreshToken, accessToken }) {
  let sessionId;
  for (const [token, verify] of [
    [refreshToken, tokens.verifyRefreshToken],
    [accessToken, tokens.verifyAccessToken],
  ]) {
    if (!token || sessionId) continue;
    try {
      sessionId = verify(token).sid;
    } catch (err) {
      // An expired token still identifies the session to revoke (its signature was valid).
      if (err?.name === "TokenExpiredError") sessionId = jwt.decode(token)?.sid;
    }
  }
  if (sessionId && /^[a-f\d]{24}$/i.test(sessionId)) {
    await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: "logout" } });
  }
}

async function revokeAllSessions(userId, reason) {
  await Session.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
}

/**
 * Creates a single-use reset token (only its hash is stored) and emails the link. The response
 * never reveals whether the account exists; email delivery happens in the background so timing
 * doesn't reveal it either.
 */
async function requestPasswordReset(rawEmail) {
  const emailAddress = normalizeEmail(rawEmail);
  const user = await User.findOne({ email: emailAddress });
  if (user) {
    const token = randomToken(32);
    const ttl = getConfig().passwordResetTtlMinutes;
    await PasswordResetToken.deleteMany({ user: user._id, usedAt: null });
    await PasswordResetToken.create({ user: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttl * 60_000) });
    const resetUrl = `${getConfig().frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    email
      .sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl, expiresInMinutes: ttl })
      .catch((err) => logger.error({ err: { name: err.name, message: err.message } }, "Password reset email could not be sent"));
  }
  return { message: FORGOT_MESSAGE };
}

async function resetPassword({ token, password }) {
  const tokenHash = sha256(token);
  // Atomically claim the token so it can't be used twice, even by concurrent requests.
  const record = await PasswordResetToken.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: trusted({ $gt: new Date() }) },
    { $set: { usedAt: new Date() } },
    { new: true },
  );
  if (!record) throw new ApiError(400, "RESET_TOKEN_INVALID", INVALID_RESET);

  const user = await User.findById(record.user);
  if (!user) throw new ApiError(400, "RESET_TOKEN_INVALID", INVALID_RESET);

  const passwordHash = await hashPassword(password);
  await User.updateOne({ _id: user._id }, { $set: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockUntil: null } });
  await PasswordResetToken.deleteMany({ user: user._id, usedAt: null });
  await revokeAllSessions(user._id, "password-reset");
  logger.info({ userId: user._id.toString() }, "Password reset completed; all sessions revoked");
  return { message: "Your password has been reset. Sign in with your new password." };
}

function sessionInfo(user, sessionId) {
  return { user: user.toSafeJSON(), csrfToken: tokens.csrfTokenFor(sessionId) };
}

module.exports = {
  BCRYPT_COST,
  MAX_FAILED_LOGINS,
  hashPassword,
  signup,
  login,
  refresh,
  logout,
  revokeAllSessions,
  requestPasswordReset,
  resetPassword,
  sessionInfo,
  messages: { INVALID_CREDENTIALS, SIGNUP_MESSAGE, FORGOT_MESSAGE, INVALID_RESET },
};
