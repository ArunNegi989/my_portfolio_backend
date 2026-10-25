#!/usr/bin/env node
// Grants (or with --demote, removes) dashboard access for an existing account.
// Needs direct server/database access, which is what keeps privilege changes out of the public API.
// Usage: npm run promote-admin -- someone@example.com [--demote]

const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
process.env.LOG_LEVEL ??= "warn";

const { requireEnv } = require("../src/config/env");

async function main() {
  const { MONGODB_URI } = requireEnv(["MONGODB_URI"]);
  const email = process.argv.slice(2).find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  const demote = process.argv.includes("--demote");
  if (!email) throw new Error("Usage: npm run promote-admin -- <email> [--demote]");

  const { connectDatabase, disconnectDatabase } = require("../src/config/database");
  const { User } = require("../src/models");
  const { revokeAllSessions } = require("../src/services/auth.service");

  await connectDatabase(MONGODB_URI);
  try {
    const user = await User.findOne({ email });
    if (!user) throw new Error(`No account found for ${email}. The person must sign up first.`);
    if (demote && (await User.countDocuments({ role: "admin" })) <= 1 && user.role === "admin") {
      throw new Error("Refusing to demote the last administrator.");
    }
    user.role = demote ? "user" : "admin";
    await user.save();
    // Existing sessions carry the old role in their access token: end them so the change applies now.
    await revokeAllSessions(user._id, demote ? "demoted" : "promoted");
    console.log(`\n${email} is now ${demote ? "a regular user (no dashboard access)" : "an administrator"}. They need to sign in again.\n`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
