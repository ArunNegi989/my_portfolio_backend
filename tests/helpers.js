// Shared test setup: an in-memory MongoDB (real database engine, nothing touches production),
// a test configuration and helpers to sign in and capture outgoing email.

const path = require("node:path");
const fs = require("node:fs/promises");

process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.BACKEND_PUBLIC_URL = "http://localhost:5000";
process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789-abcdefghijklmnop";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-0123456789-abcdefghijklmno";
process.env.UPLOAD_DIR = `tests/.tmp-uploads-${process.pid}`;
process.env.CONTACT_NOTIFY_EMAIL = "owner@example.com";
process.env.MONGODB_URI = "mongodb://placeholder"; // replaced once the in-memory server starts
delete process.env.REVALIDATE_SECRET;
delete process.env.SMTP_HOST;

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const ORIGIN = "http://localhost:3000";
const ADMIN = { email: "admin@example.com", password: "Admin-pass-123", name: "Test Admin" };
const HIGH_LIMITS = Object.fromEntries(
  ["login", "signup", "passwordReset", "resetSubmit", "refresh", "contact", "upload", "admin"].map((k) => [k, { limit: 10_000 }]),
);

let mongo;
const sentEmails = [];

async function startDatabase() {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  const { connectDatabase } = require("../src/config/database");
  await connectDatabase(mongo.getUri());
  require("../src/config/email").setTransport({
    async sendMail(message) {
      sentEmails.push(message);
      return { messageId: `test-${sentEmails.length}` };
    },
  });
}

async function stopDatabase() {
  await mongoose.disconnect();
  await mongo?.stop();
  await fs.rm(path.resolve(__dirname, "..", process.env.UPLOAD_DIR), { recursive: true, force: true });
}

async function clearDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  sentEmails.length = 0;
}

function buildApp(rateLimits = HIGH_LIMITS) {
  return require("../src/app").createApp({ rateLimits });
}

async function createUser({ email = ADMIN.email, password = ADMIN.password, name = ADMIN.name, role = "admin" } = {}) {
  const { User } = require("../src/models");
  const { hashPassword } = require("../src/services/auth.service");
  return User.create({ email, name, role, passwordHash: await hashPassword(password) });
}

/** Signs in with a cookie-keeping agent. Returns the agent and the CSRF token for writes. */
async function login(app, { email = ADMIN.email, password = ADMIN.password } = {}) {
  const agent = request.agent(app);
  const res = await agent.post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, csrfToken: res.body.data.csrfToken, res };
}

async function seed() {
  return require("../src/services/seed.service").seedContent();
}

/** Applies Origin + CSRF headers to an agent request. */
function write(agent, method, url, csrfToken) {
  return agent[method](url).set("Origin", ORIGIN).set("X-CSRF-Token", csrfToken ?? "");
}

/** Extracts the reset token from the last password-reset email. */
function lastResetToken() {
  const email = [...sentEmails].reverse().find((m) => /reset/i.test(m.subject));
  const match = email && /token=([A-Za-z0-9_\-%]+)/.exec(email.text);
  return match ? decodeURIComponent(match[1]) : null;
}

const waitFor = async (predicate, timeoutMs = 2000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** A 1×1 PNG and helpers for upload tests. */
const PNG_1X1 = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6300010000050001" + "0d0a2db40000000049454e44ae426082", "hex");

module.exports = {
  request,
  ORIGIN,
  ADMIN,
  HIGH_LIMITS,
  sentEmails,
  startDatabase,
  stopDatabase,
  clearDatabase,
  buildApp,
  createUser,
  login,
  seed,
  write,
  lastResetToken,
  waitFor,
  PNG_1X1,
};
