// Reusable email delivery. Used for password resets and contact-form notifications.

const { getConfig } = require("../config/env");
const { getTransport } = require("../config/email");
const logger = require("../utils/logger");

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured (set SMTP_HOST, SMTP_USER, SMTP_APP_PASSWORD and EMAIL_FROM).");
    this.name = "EmailNotConfiguredError";
  }
}

async function sendMail({ to, subject, text, html, replyTo }) {
  const transport = getTransport();
  if (!transport) throw new EmailNotConfiguredError();
  const info = await transport.sendMail({ from: getConfig().smtp.from, to, subject, text, html, ...(replyTo ? { replyTo } : {}) });
  logger.info({ messageId: info.messageId, subject }, "Email sent");
  return info;
}

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>${bodyHtml}</td></tr></table></td></tr></table></body></html>`;
}

/** Sends the password-reset link. The link contains a single-use token; nothing else sensitive. */
async function sendPasswordResetEmail({ to, name, resetUrl, expiresInMinutes }) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const text = `${greeting}

Someone asked to reset the password for your portfolio dashboard account.

Reset your password: ${resetUrl}

This link works once and expires in ${expiresInMinutes} minutes. If you didn't ask for this, ignore this email; your password stays the same.`;
  const html = layout(
    "Reset your password",
    `<p>${escapeHtml(greeting)}</p>
<p>Someone asked to reset the password for your portfolio dashboard account.</p>
<p style="margin:24px 0"><a href="${escapeHtml(resetUrl)}" style="background:#0e7490;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Reset password</a></p>
<p style="font-size:13px;color:#4b5563">This link works once and expires in ${expiresInMinutes} minutes. If you didn't ask for this, ignore this email; your password stays the same.</p>
<p style="font-size:12px;color:#6b7280;word-break:break-all">${escapeHtml(resetUrl)}</p>`,
  );
  return sendMail({ to, subject: "Reset your portfolio dashboard password", text, html });
}

/** Notifies the site owner about a new contact-form message. Reply-To is the visitor. */
async function sendContactNotification(message) {
  const to = getConfig().smtp.contactNotifyTo;
  if (!to) throw new EmailNotConfiguredError();
  const rows = [
    ["Name", message.name],
    ["Email", message.email],
    ["Project type", message.projectType || "—"],
  ];
  const text = `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${message.message}`;
  const html = layout(
    "New message from your portfolio",
    `<table role="presentation" style="font-size:14px;margin-bottom:16px">${rows
      .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${k}</td><td>${escapeHtml(v)}</td></tr>`)
      .join("")}</table><p style="white-space:pre-wrap;font-size:14px;line-height:1.6">${escapeHtml(message.message)}</p>`,
  );
  return sendMail({ to, subject: `Portfolio contact: ${message.name}`.slice(0, 150), text, html, replyTo: message.email });
}

module.exports = { sendMail, sendPasswordResetEmail, sendContactNotification, EmailNotConfiguredError, escapeHtml };
