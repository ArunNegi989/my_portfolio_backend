const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Converts "15m", "7d" … to milliseconds (the format validated in config/env.js). */
function durationToMs(value) {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNITS[match[2]];
}

/** Escapes user input before it is used inside a RegExp (prevents regex injection / ReDoS). */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

/** Parses ?page=&limit= with sane bounds. */
function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(query.limit) || defaultLimit)));
  return { page, limit, skip: (page - 1) * limit };
}

function paginationMeta({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { durationToMs, escapeRegex, normalizeEmail, parsePagination, paginationMeta };
