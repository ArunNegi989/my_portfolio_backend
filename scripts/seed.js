#!/usr/bin/env node
// Imports the existing website content into MongoDB (insert-only, safe to re-run).
// Usage: npm run seed            import missing records
//        npm run seed -- --dry-run   show what would be imported, write nothing

const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
process.env.LOG_LEVEL ??= "warn";

const { requireEnv } = require("../src/config/env");

async function main() {
  const { MONGODB_URI } = requireEnv(["MONGODB_URI"]);
  const dryRun = process.argv.includes("--dry-run");
  const { connectDatabase, disconnectDatabase } = require("../src/config/database");
  const { seedContent } = require("../src/services/seed.service");

  await connectDatabase(MONGODB_URI);
  try {
    const report = await seedContent(undefined, { dryRun });
    console.log(dryRun ? "Dry run — nothing was written.\n" : "Seed complete.\n");
    for (const [key, { inserted, existing }] of Object.entries(report)) {
      console.log(`  ${key.padEnd(16)} ${String(inserted).padStart(3)} ${dryRun ? "would be inserted" : "inserted"}, ${existing} already present (left unchanged)`);
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}\n`);
  process.exit(1);
});
