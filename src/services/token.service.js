// JWT issuing/verification, auth cookies and the CSRF token derived from the session id.

const jwt = require("jsonwebtoken");
const { getConfig } = require("../config/env");
const { durationToMs } = require("../utils/helpers");
const { hmac, randomToken } = require("../utils/crypto");

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const API_COOKIE_PATH = "/api";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

function jwtOptions() {
  const { jwt: c } = getConfig();
  return { issuer: c.issuer, audience: c.audience, algorithm: "HS256" };
}

function signAccessToken({ userId, sessionId, role }) {
  const { jwt: c } = getConfig();
  return jwt.sign({ sid: sessionId, role, typ: "access" }, c.accessSecret, { ...jwtOptions(), subject: userId, expiresIn: c.accessExpiresIn });
}

/** Refresh tokens carry a random `jti`; only its SHA-256 hash is stored on the session. */
function signRefreshToken({ userId, sessionId, expiresAt }) {
  const { jwt: c } = getConfig();
  const jti = randomToken(32);
  const expiresIn = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const token = jwt.sign({ sid: sessionId, typ: "refresh" }, c.refreshSecret, { ...jwtOptions(), subject: userId, jwtid: jti, expiresIn });
  return { token, jti };
}

function verify(token, secret, type) {
  const { issuer, audience } = jwtOptions();
  const payload = jwt.verify(token, secret, { algorithms: ["HS256"], issuer, audience });
  if (payload.typ !== type || !payload.sid || !payload.sub) throw new jwt.JsonWebTokenError("Unexpected token type");
  return payload;
}

const verifyAccessToken = (token) => verify(token, getConfig().jwt.accessSecret, "access");
const verifyRefreshToken = (token) => verify(token, getConfig().jwt.refreshSecret, "refresh");

/** Per-session CSRF token: HMAC of the session id with a key derived from the access secret. */
function csrfTokenFor(sessionId) {
  const key = hmac(getConfig().jwt.accessSecret, "csrf-token-v1");
  return hmac(key, sessionId);
}

function cookieBase() {
  const { cookies } = getConfig();
  return { httpOnly: true, secure: cookies.secure, sameSite: cookies.sameSite, ...(cookies.domain ? { domain: cookies.domain } : {}) };
}

/** `persistent: false` ("Remember me" unticked) makes the refresh cookie end with the browser session. */
function setAuthCookies(res, { accessToken, refreshToken, persistent = true }) {
  const { jwt: c } = getConfig();
  res.cookie(ACCESS_COOKIE, accessToken, { ...cookieBase(), path: API_COOKIE_PATH, maxAge: durationToMs(c.accessExpiresIn) });
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...cookieBase(),
      path: REFRESH_COOKIE_PATH,
      ...(persistent ? { maxAge: durationToMs(c.refreshExpiresIn) } : {}),
    });
  }
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase(), path: API_COOKIE_PATH });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: REFRESH_COOKIE_PATH });
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  csrfTokenFor,
  setAuthCookies,
  clearAuthCookies,
};
