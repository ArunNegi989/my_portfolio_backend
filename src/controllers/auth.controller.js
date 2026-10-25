const auth = require("../services/auth.service");
const tokens = require("../services/token.service");

async function signup(req, res) {
  const result = await auth.signup(req.valid.body);
  res.status(202).json({ data: result });
}

async function login(req, res) {
  const result = await auth.login(req.valid.body, { userAgent: req.get("user-agent") });
  tokens.setAuthCookies(res, result);
  res.json({ data: { user: result.user, csrfToken: result.csrfToken } });
}

async function refresh(req, res) {
  try {
    const result = await auth.refresh(req.cookies?.[tokens.REFRESH_COOKIE]);
    tokens.setAuthCookies(res, result);
    res.json({ data: { user: result.user, csrfToken: result.csrfToken } });
  } catch (err) {
    tokens.clearAuthCookies(res);
    throw err;
  }
}

async function logout(req, res) {
  await auth.logout({ refreshToken: req.cookies?.[tokens.REFRESH_COOKIE], accessToken: req.cookies?.[tokens.ACCESS_COOKIE] });
  tokens.clearAuthCookies(res);
  res.status(204).end();
}

function me(req, res) {
  res.json({ data: auth.sessionInfo(req.auth.user, req.auth.sessionId) });
}

async function forgotPassword(req, res) {
  const result = await auth.requestPasswordReset(req.valid.body.email);
  res.status(202).json({ data: result });
}

async function resetPassword(req, res) {
  const result = await auth.resetPassword(req.valid.body);
  tokens.clearAuthCookies(res);
  res.json({ data: result });
}

module.exports = { signup, login, refresh, logout, me, forgotPassword, resetPassword };
