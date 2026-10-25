const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const h = require("./helpers");

describe("authentication", () => {
  let app;
  before(async () => {
    await h.startDatabase();
    app = h.buildApp();
  });
  after(h.stopDatabase);
  beforeEach(h.clearDatabase);

  const post = (url, body) => h.request(app).post(url).set("Origin", h.ORIGIN).send(body);

  describe("signup", () => {
    it("validates email, name and password", async () => {
      const res = await post("/api/v1/auth/signup", { name: "A", email: "not-an-email", password: "short" });
      assert.equal(res.status, 400);
      const fields = res.body.error.details.map((d) => d.field);
      assert.ok(fields.includes("name") && fields.includes("email") && fields.includes("password"));
    });

    it("rejects passwords over bcrypt's 72-byte limit and passwords without a number", async () => {
      assert.equal((await post("/api/v1/auth/signup", { name: "Long", email: "l@example.com", password: `a1${"x".repeat(80)}` })).status, 400);
      assert.equal((await post("/api/v1/auth/signup", { name: "Weak", email: "w@example.com", password: "lettersonly" })).status, 400);
    });

    it("creates a user without dashboard privileges and stores only a password hash", async () => {
      const res = await post("/api/v1/auth/signup", { name: "New Person", email: " New@Example.com ", password: "Secret-pass-1" });
      assert.equal(res.status, 202);
      const { User } = require("../src/models");
      const user = await User.findOne({ email: "new@example.com" }).select("+passwordHash");
      assert.equal(user.role, "user");
      assert.match(user.passwordHash, /^\$2[aby]\$12\$/);
      assert.ok(!user.passwordHash.includes("Secret-pass-1"));
    });

    it("prevents duplicates without revealing that the email is taken", async () => {
      await h.createUser({ email: "taken@example.com", role: "user" });
      const res = await post("/api/v1/auth/signup", { name: "Someone", email: "taken@example.com", password: "Secret-pass-1" });
      assert.equal(res.status, 202);
      const fresh = await post("/api/v1/auth/signup", { name: "Someone", email: "fresh@example.com", password: "Secret-pass-1" });
      assert.deepEqual(res.body, fresh.body, "same response for new and existing emails");
      const { User } = require("../src/models");
      assert.equal(await User.countDocuments({ email: "taken@example.com" }), 1);
    });

    it("ignores attempts to self-assign the admin role", async () => {
      await post("/api/v1/auth/signup", { name: "Sneaky", email: "sneaky@example.com", password: "Secret-pass-1", role: "admin" });
      const { User } = require("../src/models");
      assert.equal((await User.findOne({ email: "sneaky@example.com" })).role, "user");
    });

    it("signed-up users cannot use admin APIs", async () => {
      await post("/api/v1/auth/signup", { name: "Viewer", email: "viewer@example.com", password: "Secret-pass-1" });
      const { agent } = await h.login(app, { email: "viewer@example.com", password: "Secret-pass-1" });
      const res = await agent.get("/api/v1/admin/content");
      assert.equal(res.status, 403);
    });
  });

  describe("login", () => {
    beforeEach(() => h.createUser());

    it("signs in, sets HttpOnly cookies and returns the user and a CSRF token", async () => {
      const { res } = await h.login(app);
      assert.equal(res.body.data.user.email, h.ADMIN.email);
      assert.equal(res.body.data.user.role, "admin");
      assert.ok(res.body.data.csrfToken.length > 20);
      assert.equal(res.body.data.user.passwordHash, undefined);
      const cookies = res.headers["set-cookie"].join("\n");
      assert.match(cookies, /access_token=.*HttpOnly/);
      assert.match(cookies, /refresh_token=.*Path=\/api\/v1\/auth.*HttpOnly/);
      assert.match(cookies, /SameSite=Lax/);
      assert.ok(!JSON.stringify(res.body).includes(cookies.match(/access_token=([^;]+)/)[1]), "token never appears in the body");
    });

    it("'Remember me' off gives a browser-session refresh cookie, kept on rotation", async () => {
      const res = await post("/api/v1/auth/login", { email: h.ADMIN.email, password: h.ADMIN.password, remember: false });
      assert.equal(res.status, 200);
      const refreshCookie = res.headers["set-cookie"].find((c) => c.startsWith("refresh_token="));
      assert.ok(!/Max-Age|Expires/i.test(refreshCookie), "no expiry → deleted when the browser closes");
      const token = refreshCookie.match(/refresh_token=([^;]+)/)[1];
      const rotated = await h.request(app).post("/api/v1/auth/refresh").set("Origin", h.ORIGIN).set("Cookie", `refresh_token=${token}`);
      const rotatedCookie = rotated.headers["set-cookie"].find((c) => c.startsWith("refresh_token="));
      assert.ok(!/Max-Age|Expires/i.test(rotatedCookie));

      const remembered = await post("/api/v1/auth/login", { email: h.ADMIN.email, password: h.ADMIN.password, remember: true });
      assert.match(remembered.headers["set-cookie"].find((c) => c.startsWith("refresh_token=")), /Max-Age=604800/);
    });

    it("normalizes the email address", async () => {
      const res = await post("/api/v1/auth/login", { email: "  ADMIN@Example.COM ", password: h.ADMIN.password });
      assert.equal(res.status, 200);
    });

    it("returns the same generic error for a wrong password and an unknown email", async () => {
      const wrong = await post("/api/v1/auth/login", { email: h.ADMIN.email, password: "Wrong-pass-1" });
      const unknown = await post("/api/v1/auth/login", { email: "nobody@example.com", password: "Wrong-pass-1" });
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.deepEqual(wrong.body, unknown.body);
      assert.equal(wrong.body.error.message, "Invalid email or password.");
    });

    it("temporarily locks the account after repeated failures (even with the right password)", async () => {
      for (let i = 0; i < 10; i++) await post("/api/v1/auth/login", { email: h.ADMIN.email, password: "Wrong-pass-1" });
      const res = await post("/api/v1/auth/login", { email: h.ADMIN.email, password: h.ADMIN.password });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.message, "Invalid email or password.");
    });

    it("rate-limits sign-in attempts per client", async () => {
      const limited = h.buildApp({ ...h.HIGH_LIMITS, login: { limit: 3, windowMs: 60_000 } });
      const statuses = [];
      for (let i = 0; i < 5; i++) {
        statuses.push((await h.request(limited).post("/api/v1/auth/login").set("Origin", h.ORIGIN).send({ email: "x@example.com", password: "y" })).status);
      }
      assert.deepEqual(statuses.slice(3), [429, 429]);
    });

    it("rejects requests from an untrusted origin and requests without an origin", async () => {
      const evil = await h.request(app).post("/api/v1/auth/login").set("Origin", "https://evil.example").send({ email: h.ADMIN.email, password: h.ADMIN.password });
      assert.equal(evil.status, 403);
      const none = await h.request(app).post("/api/v1/auth/login").send({ email: h.ADMIN.email, password: h.ADMIN.password });
      assert.equal(none.status, 403);
    });
  });

  describe("protected routes", () => {
    beforeEach(() => h.createUser());

    it("rejects requests without a session", async () => {
      const res = await h.request(app).get("/api/v1/admin/content");
      assert.equal(res.status, 401);
    });

    it("rejects forged, wrongly signed and expired access tokens", async () => {
      const { agent } = await h.login(app);
      const me = await agent.get("/api/v1/auth/me");
      assert.equal(me.status, 200);

      const forged = jwt.sign({ sid: "507f1f77bcf86cd799439011", role: "admin", typ: "access" }, "not-the-real-secret", { subject: "507f1f77bcf86cd799439011", expiresIn: "5m" });
      const forgedRes = await h.request(app).get("/api/v1/admin/content").set("Cookie", `access_token=${forged}`);
      assert.equal(forgedRes.status, 401);

      const { getConfig } = require("../src/config/env");
      const { jwt: c } = getConfig();
      const expired = jwt.sign({ sid: "507f1f77bcf86cd799439011", role: "admin", typ: "access" }, c.accessSecret, {
        subject: "507f1f77bcf86cd799439011",
        issuer: c.issuer,
        audience: c.audience,
        expiresIn: -10,
      });
      const expiredRes = await h.request(app).get("/api/v1/admin/content").set("Cookie", `access_token=${expired}`);
      assert.equal(expiredRes.status, 401);
    });

    it("rejects a refresh token used as an access token", async () => {
      const { res } = await h.login(app);
      const refresh = res.headers["set-cookie"].join(";").match(/refresh_token=([^;]+)/)[1];
      const misuse = await h.request(app).get("/api/v1/admin/content").set("Cookie", `access_token=${refresh}`);
      assert.equal(misuse.status, 401);
    });

    it("requires the CSRF token for admin writes", async () => {
      const { agent, csrfToken } = await h.login(app);
      const body = { items: [] };
      const missing = await agent.put("/api/v1/admin/seo").set("Origin", h.ORIGIN).send(body);
      assert.equal(missing.status, 403);
      assert.equal(missing.body.error.code, "CSRF_TOKEN_INVALID");
      const wrong = await h.write(agent, "put", "/api/v1/admin/seo", "x".repeat(43)).send(body);
      assert.equal(wrong.status, 403);
      const ok = await h.write(agent, "put", "/api/v1/admin/seo", csrfToken).send(body);
      assert.equal(ok.status, 200);
    });
  });

  describe("refresh, rotation and logout", () => {
    beforeEach(() => h.createUser());

    const refreshCookie = (res) => res.headers["set-cookie"].join(";").match(/refresh_token=([^;]+)/)[1];
    const refreshWith = (token) => h.request(app).post("/api/v1/auth/refresh").set("Origin", h.ORIGIN).set("Cookie", `refresh_token=${token}`);

    it("rotates the refresh token and keeps the same CSRF token", async () => {
      const { res, csrfToken } = await h.login(app);
      const first = refreshCookie(res);
      const rotated = await refreshWith(first);
      assert.equal(rotated.status, 200);
      assert.equal(rotated.body.data.csrfToken, csrfToken);
      const second = refreshCookie(rotated);
      assert.notEqual(second, first);
      const { Session } = require("../src/models");
      const session = await Session.findOne();
      assert.ok(!session.tokenHash.includes(second) && !session.tokenHash.includes(first), "only hashes are stored");
    });

    it("tolerates two tabs refreshing with the same token at once (grace window)", async () => {
      const { res } = await h.login(app);
      const token = refreshCookie(res);
      const [a, b] = await Promise.all([refreshWith(token), refreshWith(token)]);
      assert.deepEqual([a.status, b.status].sort(), [200, 200]);
    });

    it("revokes the session when an old refresh token is reused after the grace window", async () => {
      const { res } = await h.login(app);
      const stolen = refreshCookie(res);
      const rotated = await refreshWith(stolen);
      const current = refreshCookie(rotated);
      const { Session } = require("../src/models");
      await Session.updateMany({}, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });

      const reuse = await refreshWith(stolen);
      assert.equal(reuse.status, 401);
      assert.ok((await Session.findOne()).revokedAt, "session revoked");
      const legit = await refreshWith(current);
      assert.equal(legit.status, 401, "the legitimate token stops working too");
    });

    it("logout revokes the session: the old access and refresh tokens stop working", async () => {
      const { agent, res } = await h.login(app);
      const access = res.headers["set-cookie"].join(";").match(/access_token=([^;]+)/)[1];
      const refresh = refreshCookie(res);

      const out = await agent.post("/api/v1/auth/logout").set("Origin", h.ORIGIN);
      assert.equal(out.status, 204);
      assert.match(out.headers["set-cookie"].join(";"), /access_token=;/);

      const replayAccess = await h.request(app).get("/api/v1/admin/content").set("Cookie", `access_token=${access}`);
      assert.equal(replayAccess.status, 401);
      assert.equal((await refreshWith(refresh)).status, 401);
      assert.equal((await agent.get("/api/v1/auth/me")).status, 401);
    });
  });

  describe("forgot and reset password", () => {
    beforeEach(() => h.createUser());

    it("answers the same way for known and unknown emails, and emails only real accounts", async () => {
      const known = await post("/api/v1/auth/forgot-password", { email: h.ADMIN.email });
      const unknown = await post("/api/v1/auth/forgot-password", { email: "nobody@example.com" });
      assert.equal(known.status, 202);
      assert.deepEqual(known.body, unknown.body);
      await h.waitFor(() => h.sentEmails.length === 1);
      const mail = h.sentEmails[0];
      assert.equal(mail.to, h.ADMIN.email);
      assert.match(mail.text, /http:\/\/localhost:3000\/reset-password\?token=/);
      assert.ok(!mail.text.includes(h.ADMIN.password), "never includes the password");
    });

    it("stores only a hash of the reset token", async () => {
      await post("/api/v1/auth/forgot-password", { email: h.ADMIN.email });
      await h.waitFor(() => h.sentEmails.length === 1);
      const token = h.lastResetToken();
      const { PasswordResetToken } = require("../src/models");
      const stored = await PasswordResetToken.findOne();
      assert.notEqual(stored.tokenHash, token);
      assert.equal(stored.tokenHash.length, 64);
    });

    it("rejects invalid and expired tokens", async () => {
      const invalid = await post("/api/v1/auth/reset-password", { token: "x".repeat(43), password: "Brand-new-pass-2" });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.error.code, "RESET_TOKEN_INVALID");

      await post("/api/v1/auth/forgot-password", { email: h.ADMIN.email });
      await h.waitFor(() => h.sentEmails.length === 1);
      const { PasswordResetToken } = require("../src/models");
      await PasswordResetToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const expired = await post("/api/v1/auth/reset-password", { token: h.lastResetToken(), password: "Brand-new-pass-2" });
      assert.equal(expired.status, 400);
    });

    it("resets the password once, revokes existing sessions and rejects token reuse", async () => {
      const { agent } = await h.login(app);
      await post("/api/v1/auth/forgot-password", { email: h.ADMIN.email });
      await h.waitFor(() => h.sentEmails.length === 1);
      const token = h.lastResetToken();

      const reset = await post("/api/v1/auth/reset-password", { token, password: "Brand-new-pass-2" });
      assert.equal(reset.status, 200);

      assert.equal((await agent.get("/api/v1/auth/me")).status, 401, "old session ended");
      assert.equal((await post("/api/v1/auth/login", { email: h.ADMIN.email, password: h.ADMIN.password })).status, 401, "old password rejected");
      assert.equal((await post("/api/v1/auth/login", { email: h.ADMIN.email, password: "Brand-new-pass-2" })).status, 200, "new password works");

      const reuse = await post("/api/v1/auth/reset-password", { token, password: "Another-pass-3" });
      assert.equal(reuse.status, 400, "token is single-use");
    });

    it("validates the new password", async () => {
      const res = await post("/api/v1/auth/reset-password", { token: "x".repeat(43), password: "short" });
      assert.equal(res.status, 400);
    });

    it("rate-limits reset requests", async () => {
      const limited = h.buildApp({ ...h.HIGH_LIMITS, passwordReset: { limit: 2, windowMs: 60_000 } });
      const statuses = [];
      for (let i = 0; i < 3; i++) statuses.push((await h.request(limited).post("/api/v1/auth/forgot-password").set("Origin", h.ORIGIN).send({ email: "a@example.com" })).status);
      assert.deepEqual(statuses, [202, 202, 429]);
    });
  });
});
