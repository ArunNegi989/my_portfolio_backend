const nodemailer = require("nodemailer");
const { getConfig } = require("./env");

let transport;

function isEmailConfigured() {
  const { smtp } = getConfig();
  return Boolean(smtp.host && smtp.user && smtp.password && smtp.from);
}

/**
 * SMTP transport (Gmail: host smtp.gmail.com, port 465 + SMTP_SECURE=true, or port 587 with STARTTLS).
 * The app password is only ever read from the environment.
 */
function getTransport() {
  if (transport) return transport;
  if (!isEmailConfigured()) return null;
  const { smtp } = getConfig();
  transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

/** Test hook: replace the transport (e.g. with one that records messages). Pass null to reset. */
function setTransport(next) {
  transport = next;
}

module.exports = { getTransport, isEmailConfigured, setTransport };
