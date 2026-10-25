const ApiError = require("../utils/ApiError");

/**
 * Validates request parts with Zod schemas and stores the parsed (stripped, coerced) values on
 * `req.valid`. Unknown fields are dropped, so clients can never mass-assign protected fields.
 */
function validate(schemas) {
  return (req, _res, next) => {
    req.valid ??= {};
    for (const part of ["params", "query", "body"]) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
        return next(ApiError.badRequest(details[0]?.message ?? "Invalid request.", details));
      }
      req.valid[part] = result.data;
    }
    next();
  };
}

module.exports = { validate };
