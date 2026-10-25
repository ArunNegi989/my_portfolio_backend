const cors = require("cors");
const { getConfig } = require("./env");

/**
 * Credentialed CORS for the configured frontend origin(s) only. Unknown origins get no CORS
 * headers at all, so browsers refuse to expose responses to them. Never a wildcard.
 */
function corsMiddleware() {
  const { allowedOrigins } = getConfig();
  return cors({
    origin(origin, callback) {
      callback(null, Boolean(origin) && allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    maxAge: 600,
  });
}

module.exports = { corsMiddleware };
