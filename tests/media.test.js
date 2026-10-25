const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const h = require("./helpers");

describe("media uploads", () => {
  let app;
  let admin;
  before(async () => {
    await h.startDatabase();
    app = h.buildApp();
  });
  after(h.stopDatabase);
  beforeEach(async () => {
    await h.clearDatabase();
    await h.createUser();
    admin = await h.login(app);
  });

  const upload = (buffer, filename, { purpose, agent = admin.agent, csrf = admin.csrfToken } = {}) => {
    const req = h.write(agent, "post", "/api/v1/admin/media", csrf).attach("file", buffer, filename);
    return purpose ? req.field("purpose", purpose) : req;
  };

  it("accepts a valid image, stores it under a random name and records it", async () => {
    const res = await upload(h.PNG_1X1, "../../evil name.png", { purpose: "image" });
    assert.equal(res.status, 201);
    const media = res.body.data;
    assert.equal(media.kind, "image");
    assert.equal(media.mimeType, "image/png");
    assert.match(media.url, /^http:\/\/localhost:5000\/uploads\/[a-z0-9]+-[a-f0-9]{24}\.png$/);
    assert.ok(!media.url.includes("evil"), "client file name is never used as the storage name");

    const file = path.resolve(__dirname, "..", process.env.UPLOAD_DIR, path.basename(media.url));
    assert.ok(fs.existsSync(file));

    const served = await h.request(app).get(new URL(media.url).pathname);
    assert.equal(served.status, 200);
    assert.equal(served.headers["content-type"], "image/png");
    assert.equal(served.headers["x-content-type-options"], "nosniff");
    assert.equal(served.headers["cross-origin-resource-policy"], "cross-origin");
    assert.match(served.headers["content-security-policy"], /sandbox/);
  });

  it("accepts a PDF resume when the purpose is document", async () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
    const res = await upload(pdf, "resume.pdf", { purpose: "document" });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.kind, "document");
  });

  it("checks file contents, not the extension or declared type", async () => {
    const fake = await upload(Buffer.from("<script>alert(1)</script>".padEnd(64, " ")), "photo.png");
    assert.equal(fake.status, 415);
    const svg = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'), "logo.svg");
    assert.equal(svg.status, 415);
    const html = await upload(Buffer.from("<!doctype html><html><body>hi</body></html>"), "page.html");
    assert.equal(html.status, 415);
  });

  it("enforces the purpose: a PDF can't be used where an image is expected", async () => {
    const res = await upload(Buffer.from("%PDF-1.4\n%%EOF".padEnd(32, " ")), "cv.pdf", { purpose: "image" });
    assert.equal(res.status, 415);
  });

  it("rejects images over 5 MB and documents over 10 MB", async () => {
    const bigImage = Buffer.concat([h.PNG_1X1, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(bigImage, "huge.png");
    assert.equal(res.status, 413);
    assert.match(res.body.error.message, /maximum is 5 MB/);

    const tooBig = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(10 * 1024 * 1024 + 10)]);
    const resPdf = await upload(tooBig, "huge.pdf");
    assert.equal(resPdf.status, 413);
  });

  it("requires a file", async () => {
    const res = await h.write(admin.agent, "post", "/api/v1/admin/media", admin.csrfToken).field("purpose", "image");
    assert.equal(res.status, 400);
  });

  it("only admins can upload (no session → 401, non-admin → 403, missing CSRF → 403)", async () => {
    const anon = await h.request(app).post("/api/v1/admin/media").set("Origin", h.ORIGIN).attach("file", h.PNG_1X1, "a.png");
    assert.equal(anon.status, 401);

    await h.createUser({ email: "user@example.com", password: "User-pass-123", role: "user" });
    const user = await h.login(app, { email: "user@example.com", password: "User-pass-123" });
    const forbidden = await upload(h.PNG_1X1, "a.png", { agent: user.agent, csrf: user.csrfToken });
    assert.equal(forbidden.status, 403);

    const noCsrf = await admin.agent.post("/api/v1/admin/media").set("Origin", h.ORIGIN).attach("file", h.PNG_1X1, "a.png");
    assert.equal(noCsrf.status, 403);
  });

  it("lists and deletes uploads (file removed from disk)", async () => {
    const created = (await upload(h.PNG_1X1, "a.png")).body.data;
    const list = await admin.agent.get("/api/v1/admin/media");
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.meta.total, 1);

    const del = await h.write(admin.agent, "delete", `/api/v1/admin/media/${created.id}`, admin.csrfToken);
    assert.equal(del.status, 204);
    const file = path.resolve(__dirname, "..", process.env.UPLOAD_DIR, path.basename(created.url));
    assert.ok(!fs.existsSync(file));
    assert.equal((await h.write(admin.agent, "delete", `/api/v1/admin/media/${created.id}`, admin.csrfToken)).status, 404);
    assert.equal((await h.write(admin.agent, "delete", "/api/v1/admin/media/not-an-object-id", admin.csrfToken)).status, 400);
  });

  it("does not serve files outside the upload folder", async () => {
    const res = await h.request(app).get("/uploads/..%2f..%2fpackage.json");
    assert.notEqual(res.status, 200);
  });
});
