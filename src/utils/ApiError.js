/** An error that is safe to show to the client: status, machine-readable code and message. */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Authentication required.") {
    return new ApiError(401, "UNAUTHENTICATED", message);
  }

  static forbidden(message = "You don't have permission to do that.") {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Not found.") {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message, details) {
    return new ApiError(409, "CONFLICT", message, details);
  }
}

module.exports = ApiError;
