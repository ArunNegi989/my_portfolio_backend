const mongoose = require("mongoose");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");

function notFound(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.path}`));
}

function isDatabaseUnavailable(err) {
  return (
    err instanceof mongoose.Error.MongooseServerSelectionError ||
    err?.name === "MongoNetworkError" ||
    err?.name === "MongoServerSelectionError" ||
    err?.name === "MongoNotConnectedError" ||
    /Cannot call .* before initial connection|buffering timed out|Client must be connected|connection .* closed/i.test(err?.message ?? "")
  );
}

/**
 * Converts known errors to safe JSON. Unknown errors become a generic 500 (details only in the log).
 * Express recognises error handlers by their four arguments, so `_next` must stay.
 */
function errorHandler(err, req, res, _next) {
  let apiError;

  if (err instanceof ApiError) apiError = err;
  else if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    apiError = ApiError.badRequest(details[0]?.message ?? "Invalid data.", details);
  } else if (err instanceof mongoose.Error.CastError) apiError = ApiError.badRequest(`Invalid value for ${err.path}.`);
  else if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? err.keyValue ?? {})[0] ?? "value";
    apiError = ApiError.conflict(`That ${field} is already in use.`, [{ field, message: `That ${field} is already in use.` }]);
  } else if (err instanceof jwt.JsonWebTokenError) apiError = ApiError.unauthorized();
  else if (err instanceof multer.MulterError) {
    apiError =
      err.code === "LIMIT_FILE_SIZE"
        ? new ApiError(413, "FILE_TOO_LARGE", "That file is too large.")
        : ApiError.badRequest(err.code === "LIMIT_UNEXPECTED_FILE" ? "Send exactly one file in the \"file\" field." : "Invalid upload.");
  } else if (err?.type === "entity.too.large") apiError = new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  else if (err?.type === "entity.parse.failed") apiError = ApiError.badRequest("Request body is not valid JSON.");
  else if (isDatabaseUnavailable(err)) apiError = new ApiError(503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Please try again shortly.");

  if (!apiError) {
    logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
    apiError = new ApiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  } else if (apiError.status >= 500) {
    logger.error({ err: { name: err.name, message: err.message }, method: req.method, path: req.path }, apiError.message);
  }

  res.status(apiError.status).json({
    error: { code: apiError.code, message: apiError.message, ...(apiError.details ? { details: apiError.details } : {}) },
  });
}

module.exports = { notFound, errorHandler, isDatabaseUnavailable };
