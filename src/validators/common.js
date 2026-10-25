const { z } = require("zod");
const { ID_PATTERN, SLUG_PATTERN } = require("../models/shared");

// Mirrors my-portfolio-frontend/lib/validation (emailPattern, validateUrl, validateWebsiteUrl, slugPattern).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const text = (max, { min = 0, message } = {}) => {
  const base = z.string().trim().max(max, `Must be ${max} characters or fewer.`);
  return min ? base.min(min, message ?? "This field is required.") : base;
};

/** Optional text: missing, null or "" all become undefined (so PUT can clear the field). */
const optionalText = (max) =>
  z.preprocess((v) => (v === null || (typeof v === "string" && !v.trim()) ? undefined : v), text(max).optional());

const id = z.string().trim().regex(ID_PATTERN, "Invalid id.");
const slug = z.string().trim().min(1, "Slug is required.").max(120).regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens.");
const email = z.string().trim().toLowerCase().max(254).regex(EMAIL_PATTERN, "Enter a valid email address.");

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
};

/** http(s) URL, mailto: link or a site path ("/…"); never javascript:, data: or blob:. */
const linkUrl = text(2048).refine(
  (v) => (v.startsWith("/") && !v.startsWith("//")) || isHttpUrl(v) || /^mailto:[^\s@]+@[^\s@]+$/.test(v),
  "Use an http(s) URL, a mailto: link or a site path (/…).",
);
/** Image source: http(s) URL or site path. */
const imageSrc = text(2048).refine((v) => (v.startsWith("/") && !v.startsWith("//")) || isHttpUrl(v), "Use an http(s) image URL or a site path (/…).");
const websiteUrl = text(2048).refine(isHttpUrl, "Enter the full website address, starting with http:// or https://.");

const optional = (schema) => z.preprocess((v) => (v === null || v === "" ? undefined : v), schema.optional());

const imageAsset = z.object({
  src: imageSrc.refine((v) => v.length > 0, "An image is required."),
  alt: text(300).default(""),
  credit: optionalText(300),
});

const stringList = (itemMax, listMax) => z.array(text(itemMax)).max(listMax).default([]);
const order = z.coerce.number().int().min(0).max(100_000);

/** Rejects lists that repeat a key (ids, slugs, paths). */
const uniqueBy = (key, label) => (items, ctx) => {
  const seen = new Set();
  items.forEach((item, index) => {
    const value = typeof item[key] === "string" ? item[key].toLowerCase() : item[key];
    if (value === undefined) return;
    if (seen.has(value)) ctx.addIssue({ code: "custom", path: [index, key], message: `Duplicate ${label}: ${item[key]}` });
    seen.add(value);
  });
};

const idParam = z.object({ id });
const objectIdParam = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid id.") });

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

module.exports = {
  z,
  EMAIL_PATTERN,
  text,
  optionalText,
  id,
  slug,
  email,
  linkUrl,
  imageSrc,
  websiteUrl,
  optional,
  imageAsset,
  stringList,
  order,
  uniqueBy,
  idParam,
  objectIdParam,
  paginationQuery,
  isHttpUrl,
};
