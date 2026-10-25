#!/usr/bin/env node
// One-time bootstrap of the first administrator from INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD.
// Refuses to run once any admin exists, so it can't be reused to create extra admins.
// After it succeeds, remove INITIAL_ADMIN_PASSWORD from .env.

const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
process.env.LOG_LEVEL ??= "warn";

const { requireEnv } = require("../src/config/env");

async function main() {
  const env = requireEnv(["MONGODB_URI", "INITIAL_ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD"]);
  const { email: emailSchema } = require("../src/validators/common");
  const { newPassword } = require("../src/validators/auth.validators");
  const { connectDatabase, disconnectDatabase } = require("../src/config/database");
  const { User } = require("../src/models");
  const { hashPassword } = require("../src/services/auth.service");

  const email = emailSchema.safeParse(env.INITIAL_ADMIN_EMAIL);
  if (!email.success) throw new Error("INITIAL_ADMIN_EMAIL is not a valid email address.");
  const password = newPassword.safeParse(process.env.INITIAL_ADMIN_PASSWORD);
  if (!password.success) throw new Error(`INITIAL_ADMIN_PASSWORD is too weak: ${password.error.issues[0].message}`);

  await connectDatabase(env.MONGODB_URI);
  try {
    if (await User.exists({ role: "admin" })) {
      throw new Error("An administrator already exists. The bootstrap is disabled; use `npm run promote-admin -- <email>` to grant access to another account.");
    }
    if (await User.exists({ email: email.data })) {
      throw new Error(`An account for ${email.data} already exists. Promote it with \`npm run promote-admin -- ${email.data}\`.`);
    }
    const name = process.env.INITIAL_ADMIN_NAME?.trim() || "Administrator";
    await User.create({ name, email: email.data, passwordHash: await hashPassword(password.data), role: "admin" });
    console.log(`\nAdmin account created for ${email.data}.\nYou can now sign in at ${process.env.FRONTEND_URL || "the frontend"}/login.`);
    console.log("Remove INITIAL_ADMIN_PASSWORD from .env now that the account exists.\n");
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
