const mongoose = require("mongoose");
const { Schema } = mongoose;

const ROLES = ["admin", "user"];

const userSchema = new Schema(
  {
    name: { type: String, trim: true, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    // Public signups get "user": they can sign in but every admin API rejects them.
    role: { type: String, enum: ROLES, default: "user" },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return { id: this._id.toString(), name: this.name, email: this.email, role: this.role };
};

const User = mongoose.model("User", userSchema, "users");

/**
 * One document per signed-in browser. Only SHA-256 hashes of refresh-token ids are stored.
 * `previousTokenHash` lets two tabs refresh at the same moment without being treated as token theft.
 */
const sessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true },
    previousTokenHash: { type: String, default: null },
    rotatedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    userAgent: { type: String, default: "" },
    // "Remember me": persistent refresh cookie. Otherwise the cookie ends with the browser session.
    persistent: { type: Boolean, default: true },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
// MongoDB removes sessions automatically once they expire.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Session = mongoose.model("Session", sessionSchema, "sessions");

const passwordResetSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
// Expired tokens are deleted a day after they expire (kept briefly for auditing).
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });
const PasswordResetToken = mongoose.model("PasswordResetToken", passwordResetSchema, "password_reset_tokens");

module.exports = { ROLES, User, Session, PasswordResetToken };
