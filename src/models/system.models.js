const mongoose = require("mongoose");
const { Schema } = mongoose;
const { toPublicJSON } = require("./shared");

const MESSAGE_STATUSES = ["new", "read", "archived"];

const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    projectType: { type: String, trim: true, default: "" },
    message: { type: String, required: true },
    status: { type: String, enum: MESSAGE_STATUSES, default: "new" },
    // Hash of email + message, used to ignore accidental double submissions.
    fingerprint: { type: String, required: true },
    // Keyed hash of the sender IP: lets abuse be spotted without storing raw IP addresses.
    ipHash: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.fingerprint;
        delete ret.ipHash;
        delete ret.updatedAt;
        return ret;
      },
    },
  },
);
contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ fingerprint: 1, createdAt: -1 });
const ContactMessage = mongoose.model("ContactMessage", contactMessageSchema, "contact_messages");

const mediaSchema = new Schema(
  {
    kind: { type: String, enum: ["image", "document"], required: true },
    storageKey: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    originalName: { type: String, default: "" },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.storageKey;
        delete ret.updatedAt;
        return ret;
      },
    },
  },
);
const Media = mongoose.model("Media", mediaSchema, "media");

const activitySchema = new Schema(
  {
    message: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
activitySchema.index({ createdAt: -1 });
activitySchema.set("toJSON", {
  ...toPublicJSON(),
  transform(_doc, ret) {
    return { id: ret._id.toString(), message: ret.message, at: ret.createdAt.toISOString() };
  },
});
const ActivityLog = mongoose.model("ActivityLog", activitySchema, "activity_logs");

module.exports = { MESSAGE_STATUSES, ContactMessage, Media, ActivityLog };
