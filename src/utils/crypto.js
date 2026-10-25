const crypto = require("node:crypto");

/** URL-safe random token (default 32 bytes = 256 bits). */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** One-way SHA-256 hash used to store tokens without keeping the token itself. */
function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(String(value)).digest("base64url");
}

/** Constant-time string comparison (false for different lengths without leaking timing). */
function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

module.exports = { randomToken, sha256, hmac, safeEqual };
