const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const h = require("./helpers");

const seedFile = require("../seed/content.json");

describe("content", () => {
  let app;
  let admin;
  before(async () => {
    await h.startDatabase();
    app = h.buildApp();
  });
  after(h.stopDatabase);
  beforeEach(async () => {
    await h.clearDatabase();
    await h.seed();
    await h.createUser();
    admin = await h.login(app);
  });

  const get = (url) => h.request(app).get(url);
  const write = (method, url) => h.write(admin.agent, method, url, admin.csrfToken);

  describe("seed import", () => {
    it("imports every record of the original site content", async () => {
      const content = (await admin.agent.get("/api/v1/admin/content")).body.data;
      assert.equal(content.projects.length, seedFile.projects.length);
      assert.equal(content.posts.length, seedFile.posts.length);
      assert.equal(content.skills.length, 30);
      assert.equal(content.skillCategories.length, 5);
      assert.equal(content.services.length, 7);
      assert.equal(content.experience.length, 3);
      assert.equal(content.seo.length, 8);
      assert.equal(content.profile.name, seedFile.profile.name);
      assert.deepEqual(content.home.heroRoles, seedFile.home.heroRoles);
    });

    it("is insert-only: re-running never overwrites dashboard edits", async () => {
      const project = seedFile.projects[0];
      await write("put", `/api/v1/admin/projects/${project.id}`).send({ ...project, title: "Edited in the dashboard" });
      const report = await h.seed();
      assert.equal(Object.values(report).reduce((n, r) => n + r.inserted, 0), 0);
      const res = await get(`/api/v1/projects/${project.slug}`);
      assert.equal(res.body.data.title, "Edited in the dashboard");
    });

    it("returns records in the exact frontend shape (no Mongo internals)", async () => {
      const res = await get("/api/v1/projects/visezy");
      const expected = seedFile.projects.find((p) => p.slug === "visezy");
      assert.deepEqual(res.body.data, expected);
    });
  });

  describe("public endpoints", () => {
    it("serves the singletons", async () => {
      assert.equal((await get("/api/v1/profile")).body.data.email, seedFile.profile.email);
      assert.equal((await get("/api/v1/home")).body.data.heroName, seedFile.home.heroName);
      const settings = (await get("/api/v1/settings")).body.data;
      assert.equal(settings.siteName, seedFile.settings.siteName);
      assert.equal(settings.siteUrl, undefined, "siteUrl comes from the frontend environment");
    });

    it("hides drafts from the public projects and posts lists", async () => {
      const project = seedFile.projects[0];
      await write("put", `/api/v1/admin/projects/${project.id}`).send({ ...project, status: "draft" });
      const list = (await get("/api/v1/projects")).body;
      assert.equal(list.meta.total, seedFile.projects.length - 1);
      assert.ok(!list.data.some((p) => p.id === project.id));
      assert.equal((await get(`/api/v1/projects/${project.slug}`)).status, 404);

      const post = seedFile.posts[0];
      await write("put", `/api/v1/admin/posts/${post.id}`).send({ ...post, status: "draft" });
      assert.equal((await get(`/api/v1/posts/${post.slug}`)).status, 404);
      const admins = (await admin.agent.get("/api/v1/admin/posts?status=draft")).body;
      assert.equal(admins.meta.total, 1);
    });

    it("paginates and filters projects", async () => {
      const page = (await get("/api/v1/projects?limit=5&page=2")).body;
      assert.equal(page.data.length, 5);
      assert.deepEqual(page.meta, { page: 2, limit: 5, total: 20, totalPages: 4 });
      assert.equal(page.data[0].order, 6, "ordered by display order");

      const ecommerce = (await get("/api/v1/projects?category=E-commerce")).body;
      assert.ok(ecommerce.data.length > 0 && ecommerce.data.every((p) => p.category === "E-commerce"));

      const search = (await get("/api/v1/projects?q=liferay")).body;
      assert.deepEqual(search.data.map((p) => p.slug), ["national-hydrographic-office"]);
    });

    it("validates query parameters", async () => {
      assert.equal((await get("/api/v1/projects?limit=1000")).status, 400);
      assert.equal((await get("/api/v1/projects?page=0")).status, 400);
      assert.equal((await get("/api/v1/projects/Not_A_Slug")).status, 400);
    });

    it("treats regex characters in search as plain text", async () => {
      const res = await get("/api/v1/projects?q=" + encodeURIComponent(".*"));
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 0);
    });

    it("never exposes demo or hidden testimonials and hidden services or links", async () => {
      assert.deepEqual((await get("/api/v1/testimonials")).body.data, []);
      const service = seedFile.services[0];
      await write("put", `/api/v1/admin/services/${service.id}`).send({ ...service, visible: false });
      assert.ok(!(await get("/api/v1/services")).body.data.some((s) => s.id === service.id));
    });
  });

  describe("admin CRUD", () => {
    const newProject = (overrides = {}) => ({
      ...seedFile.projects[0],
      id: undefined,
      slug: "brand-new-project",
      title: "Brand New Project",
      order: 99,
      ...overrides,
    });

    it("creates, reads, updates and deletes a project", async () => {
      const created = await write("post", "/api/v1/admin/projects").send(newProject({ id: "p-test-1" }));
      assert.equal(created.status, 201);
      assert.equal(created.body.data.id, "p-test-1");
      assert.equal((await get("/api/v1/projects/brand-new-project")).body.data.title, "Brand New Project");

      const updated = await write("put", "/api/v1/admin/projects/p-test-1").send(newProject({ title: "Renamed" }));
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.title, "Renamed");

      assert.equal((await write("delete", "/api/v1/admin/projects/p-test-1")).status, 204);
      assert.equal((await get("/api/v1/projects/brand-new-project")).status, 404);
    });

    it("generates an id when the client does not send one", async () => {
      const res = await write("post", "/api/v1/admin/projects").send(newProject());
      assert.equal(res.status, 201);
      assert.match(res.body.data.id, /^p-[a-z0-9]+$/);
    });

    it("PUT is a full replacement: cleared optional fields are removed", async () => {
      const visezy = seedFile.projects.find((p) => p.slug === "visezy");
      const { liveUrl: _drop, ...withoutLiveUrl } = visezy;
      const res = await write("put", `/api/v1/admin/projects/${visezy.id}`).send({ ...withoutLiveUrl, githubUrl: "" });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.liveUrl, undefined);
      assert.equal((await get("/api/v1/projects/visezy")).body.data.liveUrl, undefined);
    });

    it("validates required fields and formats with field-level messages", async () => {
      const res = await write("post", "/api/v1/admin/projects").send(newProject({ title: "", slug: "Bad Slug", technologies: [], liveUrl: "javascript:alert(1)", cover: { src: "", alt: "" } }));
      assert.equal(res.status, 400);
      const fields = res.body.error.details.map((d) => d.field);
      for (const field of ["title", "slug", "technologies", "liveUrl", "cover.src"]) assert.ok(fields.includes(field), `expected an error for ${field}`);
    });

    it("rejects duplicate slugs and ids with 409", async () => {
      const dupSlug = await write("post", "/api/v1/admin/projects").send(newProject({ slug: "visezy" }));
      assert.equal(dupSlug.status, 409);
      const dupId = await write("post", "/api/v1/admin/projects").send(newProject({ id: "p-visezy" }));
      assert.equal(dupId.status, 409);
    });

    it("returns 404 for missing records and 400 for malformed ids", async () => {
      assert.equal((await write("put", "/api/v1/admin/projects/p-does-not-exist").send(newProject())).status, 404);
      assert.equal((await write("delete", "/api/v1/admin/projects/p-does-not-exist")).status, 404);
      assert.equal((await write("delete", "/api/v1/admin/projects/$bad id")).status, 400);
    });

    it("rejects links to unknown experience entries", async () => {
      const res = await write("post", "/api/v1/admin/projects").send(newProject({ experienceId: "no-such-job" }));
      assert.equal(res.status, 400);
    });

    it("strips unknown fields (no mass assignment) and rejects operator keys", async () => {
      const res = await write("post", "/api/v1/admin/projects").send(newProject({ id: "p-mass", isAdmin: true, _id: "x", createdAt: "1999" }));
      assert.equal(res.status, 201);
      assert.equal(res.body.data.isAdmin, undefined);
      const { Project } = require("../src/models");
      assert.equal((await Project.findOne({ id: "p-mass" }).lean()).isAdmin, undefined);

      const injection = await write("put", "/api/v1/admin/profile").send({ ...seedFile.profile, name: { $gt: "" } });
      assert.equal(injection.status, 400);
    });

    it("requires authentication for every admin write", async () => {
      const anon = await h.request(app).post("/api/v1/admin/projects").set("Origin", h.ORIGIN).send(newProject());
      assert.equal(anon.status, 401);
      const anonDelete = await h.request(app).delete("/api/v1/admin/projects/p-visezy").set("Origin", h.ORIGIN);
      assert.equal(anonDelete.status, 401);
    });

    it("updates singletons (profile, home, settings) with validation", async () => {
      const profile = await write("put", "/api/v1/admin/profile").send({ ...seedFile.profile, availability: "Booked until March" });
      assert.equal(profile.status, 200);
      assert.equal((await get("/api/v1/profile")).body.data.availability, "Booked until March");

      const badEmail = await write("put", "/api/v1/admin/profile").send({ ...seedFile.profile, email: "nope" });
      assert.equal(badEmail.status, 400);

      const home = await write("put", "/api/v1/admin/home").send({ ...seedFile.home, heroRoleInterval: 1 });
      assert.equal(home.status, 400, "interval minimum is 1.5 s, like the form");

      const settings = await write("put", "/api/v1/admin/settings").send({ ...seedFile.settings, whatsappNumber: "919876543210" });
      assert.equal(settings.status, 200);
      assert.equal((await get("/api/v1/settings")).body.data.whatsappNumber, "919876543210");
    });

    it("saves whole lists (social links) and deletes items left out", async () => {
      const [github, linkedin] = seedFile.socialLinks;
      const res = await write("put", "/api/v1/admin/social-links").send({ items: [linkedin, github] });
      assert.equal(res.status, 200);
      const publicLinks = (await get("/api/v1/social-links")).body.data;
      assert.deepEqual(publicLinks.map((l) => l.id), ["linkedin", "github"], "order follows the list; email link removed");
    });

    it("rejects lists that repeat an id", async () => {
      const [github] = seedFile.socialLinks;
      const res = await write("put", "/api/v1/admin/social-links").send({ items: [github, github] });
      assert.equal(res.status, 400);
    });

    it("reorders services and skills, and edits skill categories", async () => {
      const reversed = [...seedFile.services].reverse().map((s, i) => ({ ...s, order: i + 1 }));
      assert.equal((await write("put", "/api/v1/admin/services").send({ items: reversed })).status, 200);
      assert.equal((await get("/api/v1/services")).body.data[0].id, reversed[0].id);

      const created = await write("post", "/api/v1/admin/skills").send({ name: "Docker", category: "tools", order: 5 });
      assert.equal(created.status, 201);
      const duplicate = await write("post", "/api/v1/admin/skills").send({ name: "docker", category: "tools", order: 6 });
      assert.equal(duplicate.status, 409, "case-insensitive unique per category");

      const categories = seedFile.skillCategories.map((c) => (c.key === "tools" ? { ...c, title: "Tooling" } : c));
      assert.equal((await write("put", "/api/v1/admin/skill-categories").send({ items: categories })).status, 200);
      const skills = (await get("/api/v1/skills")).body.data;
      assert.equal(skills.categories.find((c) => c.key === "tools").title, "Tooling");
      assert.ok(skills.skills.some((s) => s.name === "Docker"));
    });

    it("handles experience, education, certifications and testimonials", async () => {
      const job = { role: "Engineer", company: "Acme", location: "Remote", startDate: "2026-01", endDate: null, summary: "", responsibilities: [], relatedProjectSlugs: [], technologies: [], order: 4 };
      assert.equal((await write("post", "/api/v1/admin/experience").send(job)).status, 201);
      const badDates = await write("post", "/api/v1/admin/experience").send({ ...job, startDate: "2026-05", endDate: "2026-01" });
      assert.equal(badDates.status, 400);

      const edu = await write("post", "/api/v1/admin/education").send({ degree: "M.Tech", institution: "IIT", location: "Delhi", startYear: "2025", endYear: "2027" });
      assert.equal(edu.status, 201);
      const cert = await write("post", "/api/v1/admin/certifications").send({ title: "AWS", issuer: "" });
      assert.equal(cert.status, 201);
      const education = (await get("/api/v1/education")).body.data;
      assert.equal(education.education.at(-1).degree, "M.Tech", "new entries go last");
      assert.equal(education.certifications.length, 4);

      // A demo testimonial is forced hidden, a confirmed real one can be public.
      const demo = await write("post", "/api/v1/admin/testimonials").send({ name: "Demo", role: "", company: "", quote: "Hi", isDemo: true, visible: true });
      assert.equal(demo.body.data.visible, false);
      await write("post", "/api/v1/admin/testimonials").send({ name: "Real Client", role: "CTO", company: "Acme", quote: "Great work", isDemo: false, visible: true });
      assert.deepEqual((await get("/api/v1/testimonials")).body.data.map((t) => t.name), ["Real Client"]);
    });

    it("records admin changes in the activity feed", async () => {
      await write("put", "/api/v1/admin/profile").send({ ...seedFile.profile, location: "Remote" });
      await new Promise((r) => setTimeout(r, 50));
      const activity = (await admin.agent.get("/api/v1/admin/content")).body.data.activity;
      assert.equal(activity[0].message, "Updated profile");
    });

    it("returns null singletons from /admin/content and 404 publicly before seeding", async () => {
      await h.clearDatabase();
      await h.createUser();
      const fresh = await h.login(app);
      const content = (await fresh.agent.get("/api/v1/admin/content")).body.data;
      assert.equal(content.profile, null);
      assert.equal((await get("/api/v1/profile")).status, 404);
    });
  });

  describe("database failures", () => {
    it("answers 503 (not a crash or a hang) when MongoDB is unreachable, and recovers", async () => {
      await mongoose.disconnect();
      try {
        const res = await get("/api/v1/projects");
        assert.equal(res.status, 503);
        assert.equal(res.body.error.code, "SERVICE_UNAVAILABLE");
        assert.equal((await get("/api/v1/health")).status, 503);
      } finally {
        await mongoose.connect(process.env.MONGODB_URI);
      }
      assert.equal((await get("/api/v1/projects")).status, 200);
    });
  });
});
