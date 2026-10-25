const { trusted } = require("mongoose");
const { getConfig } = require("../config/env");
const { ContactMessage } = require("../models");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const { sha256, hmac } = require("../utils/crypto");
const { escapeRegex, parsePagination, paginationMeta } = require("../utils/helpers");
const { getTransport } = require("../config/email");
const email = require("../services/email.service");
const { recordActivity } = require("../services/activity.service");

const DUPLICATE_WINDOW_MS = 10 * 60_000;
const RECEIVED = { message: "Thanks! Your message has been received. I'll get back to you soon." };

/** POST /contact — stores the message and (if SMTP is configured) notifies the site owner. */
async function submit(req, res) {
  const { website, ...data } = req.valid.body;

  // Honeypot filled in: pretend it worked so bots don't learn to adapt, but store nothing.
  if (website && website.trim()) {
    logger.info("Contact form honeypot triggered; submission discarded");
    return res.status(201).json({ data: RECEIVED });
  }

  const fingerprint = sha256(`${data.email}|${data.message.replace(/\s+/g, " ").toLowerCase()}`);
  const duplicate = await ContactMessage.exists({ fingerprint, createdAt: trusted({ $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) }) });
  if (duplicate) return res.status(201).json({ data: RECEIVED });

  const message = await ContactMessage.create({
    ...data,
    fingerprint,
    ipHash: hmac(getConfig().jwt.refreshSecret, `contact-ip:${req.ip}`),
    userAgent: String(req.get("user-agent") ?? "").slice(0, 300),
  });

  if (getTransport() && getConfig().smtp.contactNotifyTo) {
    email.sendContactNotification(message).catch((err) => logger.error({ err: { name: err.name, message: err.message } }, "Contact notification email failed"));
  }
  res.status(201).json({ data: RECEIVED });
}

async function list(req, res) {
  const query = req.valid.query;
  const filter = {};
  if (query.status && query.status !== "all") filter.status = query.status;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [{ name: pattern }, { email: pattern }, { message: pattern }, { projectType: pattern }];
  }
  const paging = parsePagination(query, { defaultLimit: 20 });
  const [docs, total, unread] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
    ContactMessage.countDocuments(filter),
    ContactMessage.countDocuments({ status: "new" }),
  ]);
  res.json({ data: docs.map((d) => d.toJSON()), meta: { ...paginationMeta(paging, total), unread } });
}

async function updateStatus(req, res) {
  const doc = await ContactMessage.findByIdAndUpdate(req.valid.params.id, { $set: { status: req.valid.body.status } }, { new: true });
  if (!doc) throw ApiError.notFound("That message no longer exists.");
  res.json({ data: doc.toJSON() });
}

async function remove(req, res) {
  const doc = await ContactMessage.findByIdAndDelete(req.valid.params.id);
  if (!doc) throw ApiError.notFound("That message no longer exists.");
  recordActivity(`Deleted a contact message from ${doc.name}`, req.auth.user);
  res.status(204).end();
}

module.exports = { submit, list, updateStatus, remove };
