const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

describe("contact form", () => {
  let app;
  before(async () => {
    await h.startDatabase();
    app = h.buildApp();
  });
  after(h.stopDatabase);
  beforeEach(h.clearDatabase);

  const valid = { name: "Priya Sharma", email: "priya@example.com", projectType: "Full Stack Web Development", message: "I'd like a booking platform for my studio, can we talk?" };
  const submit = (body, target = app) => h.request(target).post("/api/v1/contact").set("Origin", h.ORIGIN).send(body);

  it("validates the same rules as the form", async () => {
    const res = await submit({ name: "P", email: "bad", message: "too short" });
    assert.equal(res.status, 400);
    const fields = res.body.error.details.map((d) => d.field);
    assert.deepEqual(fields.sort(), ["email", "message", "name"]);
  });

  it("stores a valid message and notifies the owner by email", async () => {
    const res = await submit(valid);
    assert.equal(res.status, 201);
    const { ContactMessage } = require("../src/models");
    const stored = await ContactMessage.findOne();
    assert.equal(stored.email, valid.email);
    assert.equal(stored.status, "new");
    assert.ok(!stored.ipHash.includes("127.0.0.1"), "IP is stored only as a keyed hash");

    await h.waitFor(() => h.sentEmails.length === 1);
    const mail = h.sentEmails[0];
    assert.equal(mail.to, "owner@example.com");
    assert.equal(mail.replyTo, valid.email);
    assert.match(mail.text, /booking platform/);
  });

  it("escapes user content in the notification email", async () => {
    await submit({ ...valid, message: "<img src=x onerror=alert(1)> please build my site soon" });
    await h.waitFor(() => h.sentEmails.length === 1);
    assert.ok(!h.sentEmails[0].html.includes("<img src=x"));
    assert.ok(h.sentEmails[0].html.includes("&lt;img"));
  });

  it("ignores an accidental double submission", async () => {
    await submit(valid);
    await submit(valid);
    const { ContactMessage } = require("../src/models");
    assert.equal(await ContactMessage.countDocuments(), 1);
  });

  it("silently drops bot submissions that fill in the honeypot", async () => {
    const res = await submit({ ...valid, website: "http://spam.example" });
    assert.equal(res.status, 201);
    const { ContactMessage } = require("../src/models");
    assert.equal(await ContactMessage.countDocuments(), 0);
  });

  it("rate-limits submissions", async () => {
    const limited = h.buildApp({ ...h.HIGH_LIMITS, contact: { limit: 2, windowMs: 60_000 } });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await submit({ ...valid, message: `${valid.message} #${i}` }, limited)).status);
    assert.deepEqual(statuses, [201, 201, 429]);
  });

  it("lets admins list, filter, update and delete messages", async () => {
    await submit(valid);
    await submit({ ...valid, email: "other@example.com", message: "Another enquiry about a WordPress news portal." });
    await h.createUser();
    const { agent, csrfToken } = await h.login(h.buildApp());
    const adminApp = agent;

    const list = await adminApp.get("/api/v1/admin/messages?limit=1");
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.meta.total, 2);
    assert.equal(list.body.meta.unread, 2);
    assert.equal(list.body.data[0].ipHash, undefined);

    const search = await adminApp.get("/api/v1/admin/messages?q=wordpress");
    assert.equal(search.body.data.length, 1);

    const id = search.body.data[0].id;
    const read = await h.write(adminApp, "patch", `/api/v1/admin/messages/${id}`, csrfToken).send({ status: "read" });
    assert.equal(read.body.data.status, "read");
    const invalid = await h.write(adminApp, "patch", `/api/v1/admin/messages/${id}`, csrfToken).send({ status: "deleted" });
    assert.equal(invalid.status, 400);
    assert.equal((await adminApp.get("/api/v1/admin/messages?status=read")).body.data.length, 1);

    assert.equal((await h.write(adminApp, "delete", `/api/v1/admin/messages/${id}`, csrfToken)).status, 204);
    assert.equal((await adminApp.get("/api/v1/admin/messages")).body.meta.total, 1);
  });

  it("keeps messages private", async () => {
    assert.equal((await h.request(app).get("/api/v1/admin/messages")).status, 401);
  });
});
