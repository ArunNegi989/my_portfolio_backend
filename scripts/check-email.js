#!/usr/bin/env node
// Verifies the SMTP settings (login + TLS) and optionally sends a test email.
// Usage: npm run check-email [-- you@example.com]

const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
process.env.LOG_LEVEL ??= "warn";

async function main() {
  const { getTransport, isEmailConfigured } = require("../src/config/email");
  if (!isEmailConfigured()) throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_APP_PASSWORD and EMAIL_FROM.");
  const transport = getTransport();
  await transport.verify();
  console.log("SMTP connection and login succeeded.");

  const to = process.argv.slice(2).find((a) => a.includes("@"));
  if (to) {
    const { sendMail } = require("../src/services/email.service");
    await sendMail({ to, subject: "Portfolio backend: test email", text: "If you can read this, password reset emails will be delivered." });
    console.log(`Test email sent to ${to}.`);
  }
}

main().catch((err) => {
  console.error(`\nEmail check failed: ${err.message}\n${err.code === "EAUTH" ? "Gmail: use an App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal password.\n" : ""}`);
  process.exit(1);
});
