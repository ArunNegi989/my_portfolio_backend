const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const { buildConfig, ConfigError } = require("../src/config/env");

describe("security baseline", () => {
  let app;
  before(async () => {
    await h.startDatabase();
    app = h.buildApp();
  });
  after(h.stopDatabase);

  describe("CORS", () => {
    it("allows the configured frontend origin with credentials", async () => {
      const res = await h.request(app).get("/api/v1/health").set("Origin", h.ORIGIN);
      assert.equal(res.headers["access-control-allow-origin"], h.ORIGIN);
      assert.equal(res.headers["access-control-allow-credentials"], "true");
    });

    it("answers preflight requests for the CSRF header", async () => {
      const res = await h.request(app)
        .options("/api/v1/admin/projects")
        .set("Origin", h.ORIGIN)
        .set("Access-Control-Request-Method", "PUT")
        .set("Access-Control-Request-Headers", "content-type,x-csrf-token");
      assert.equal(res.status, 204);
      assert.match(res.headers["access-control-allow-headers"], /X-CSRF-Token/i);
    });

    it("never echoes other origins and never uses a wildcard", async () => {
      const res = await h.request(app).get("/api/v1/health").set("Origin", "https://evil.example");
      assert.equal(res.headers["access-control-allow-origin"], undefined);
    });
  });

  describe("headers and errors", () => {
    it("sets secure headers and disables caching of API responses", async () => {
      const res = await h.request(app).get("/api/v1/health");
      assert.equal(res.headers["x-powered-by"], undefined);
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.ok(res.headers["strict-transport-security"]);
      assert.equal(res.headers["cache-control"], "no-store");
    });

    it("returns JSON errors without stack traces", async () => {
      const notFound = await h.request(app).get("/api/v1/does-not-exist");
      assert.equal(notFound.status, 404);
      assert.equal(notFound.body.error.code, "NOT_FOUND");

      const badJson = await h.request(app).post("/api/v1/contact").set("Origin", h.ORIGIN).set("Content-Type", "application/json").send('{"name":');
      assert.equal(badJson.status, 400);
      assert.ok(!JSON.stringify(badJson.body).includes("at "), "no stack trace");
    });

    it("limits request body size", async () => {
      const res = await h.request(app).post("/api/v1/contact").set("Origin", h.ORIGIN).send({ message: "x".repeat(1_100_000) });
      assert.equal(res.status, 413);
    });
  });

  describe("environment validation", () => {
    const base = {
      NODE_ENV: "development",
      MONGODB_URI: "mongodb://localhost/test",
      FRONTEND_URL: "http://localhost:3000",
      JWT_ACCESS_SECRET: "a".repeat(40),
      JWT_REFRESH_SECRET: "b".repeat(40),
    };

    it("accepts a minimal development configuration", () => {
      const config = buildConfig(base);
      assert.equal(config.cookies.secure, false);
      assert.deepEqual(config.allowedOrigins, ["http://localhost:3000"]);
    });

    it("fails clearly when required variables are missing or weak", () => {
      assert.throws(() => buildConfig({ NODE_ENV: "development" }), (err) => err instanceof ConfigError && /MONGODB_URI/.test(err.message) && /JWT_ACCESS_SECRET/.test(err.message));
      assert.throws(() => buildConfig({ ...base, JWT_ACCESS_SECRET: "short" }), /at least 32 characters/);
      assert.throws(() => buildConfig({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET }), /different/);
    });

    it("refuses insecure production settings", () => {
      const prod = { ...base, NODE_ENV: "production" };
      assert.throws(() => buildConfig(prod), (err) => /FRONTEND_URL.*https/.test(err.message) && /BACKEND_PUBLIC_URL/.test(err.message) && /SMTP/.test(err.message));
      const ok = buildConfig({
        ...prod,
        FRONTEND_URL: "https://example.com",
        BACKEND_PUBLIC_URL: "https://api.example.com",
        SMTP_HOST: "smtp.gmail.com",
        SMTP_USER: "me@gmail.com",
        SMTP_APP_PASSWORD: "app-password",
        EMAIL_FROM: "Portfolio <me@gmail.com>",
      });
      assert.equal(ok.cookies.secure, true, "secure cookies by default in production");
      assert.throws(() => buildConfig({ ...prod, COOKIE_SECURE: "false" }), /COOKIE_SECURE/);
    });

    it("requires all SMTP settings together", () => {
      assert.throws(() => buildConfig({ ...base, SMTP_HOST: "smtp.gmail.com" }), /must be set together/);
    });
  });
});
