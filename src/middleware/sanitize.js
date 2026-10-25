const ApiError = require("../utils/ApiError");

/**
 * Rejects request bodies containing MongoDB operator keys ("$where", "$gt") or dotted keys.
 * Defence in depth on top of Zod schemas and mongoose's sanitizeFilter.
 */
function hasDangerousKey(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => hasDangerousKey(v, depth + 1));
  return Object.keys(value).some((key) => key.startsWith("$") || key.includes(".") || key === "__proto__" || hasDangerousKey(value[key], depth + 1));
}

function rejectOperatorKeys(req, _res, next) {
  if (hasDangerousKey(req.body)) return next(ApiError.badRequest("Request contains invalid field names."));
  next();
}

module.exports = { rejectOperatorKeys, hasDangerousKey };
