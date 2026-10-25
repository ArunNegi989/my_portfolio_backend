const { z, text, email, paginationQuery } = require("./common");
const { MESSAGE_STATUSES } = require("../models/system.models");

// Mirrors components/public/ContactForm.tsx: name ≥ 2, valid email, optional project type, message ≥ 20.
const contactSubmission = z.object({
  name: text(100, { min: 2, message: "Name is too short." }).transform((v) => v.replace(/[\r\n]+/g, " ")),
  email,
  projectType: text(120).default(""),
  message: z.string().trim().min(20, "Please write at least 20 characters.").max(5000, "Please keep your message under 5000 characters."),
  // Honeypot: a hidden field real visitors never fill in.
  website: z.string().max(200).optional(),
});

const messageListQuery = paginationQuery.extend({
  status: z.enum([...MESSAGE_STATUSES, "all"]).optional(),
  q: text(100).optional(),
});

const messageUpdate = z.object({ status: z.enum(MESSAGE_STATUSES) });

module.exports = { contactSubmission, messageListQuery, messageUpdate };
