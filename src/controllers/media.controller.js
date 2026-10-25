const multer = require("multer");
const { getConfig } = require("../config/env");
const { Media } = require("../models");
const ApiError = require("../utils/ApiError");
const { parsePagination, paginationMeta } = require("../utils/helpers");
const storage = require("../services/storage.service");
const { recordActivity } = require("../services/activity.service");

/**
 * Identifies a file by its first bytes (magic numbers), not by its name or the browser-supplied
 * MIME type. Only these formats are accepted; SVG is refused because it can carry scripts.
 */
function detectFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const ascii = (start, end) => buffer.subarray(start, end).toString("latin1");
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "image", mime: "image/png", ext: "png" };
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return { kind: "image", mime: "image/gif", ext: "gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { kind: "image", mime: "image/webp", ext: "webp" };
  if (ascii(0, 5) === "%PDF-") return { kind: "document", mime: "application/pdf", ext: "pdf" };
  return null;
}

function uploadMiddleware() {
  const { uploads } = getConfig();
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.max(uploads.maxImageBytes, uploads.maxDocumentBytes), files: 1, fields: 4, fieldSize: 200 },
  }).single("file");
}

const formatMb = (bytes) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/** POST /admin/media — `file` plus optional `purpose` ("image" | "document"). */
async function upload(req, res) {
  if (!req.file) throw ApiError.badRequest('Choose a file to upload (form field "file").');
  const { uploads } = getConfig();
  const type = detectFileType(req.file.buffer);
  if (!type) throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", "Unsupported file type. Choose a JPG, PNG, WEBP or GIF image, or a PDF.");

  const purpose = req.body?.purpose;
  if (purpose === "image" && type.kind !== "image") throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", "Choose a JPG, PNG, WEBP or GIF image.");
  if (purpose === "document" && type.kind !== "document") throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", "Choose a PDF file.");

  const max = type.kind === "image" ? uploads.maxImageBytes : uploads.maxDocumentBytes;
  if (req.file.size > max) throw new ApiError(413, "FILE_TOO_LARGE", `That file is ${formatMb(req.file.size)}. The maximum is ${formatMb(max)}.`);

  const saved = await storage.saveFile(req.file.buffer, type.ext);
  const media = await Media.create({
    kind: type.kind,
    storageKey: saved.key,
    url: saved.url,
    originalName: String(req.file.originalname ?? "").replace(/[^\w.\- ()]+/g, "_").slice(0, 200),
    mimeType: type.mime,
    size: req.file.size,
    uploadedBy: req.auth.user._id,
  });
  recordActivity(`Uploaded ${type.kind === "image" ? "an image" : "a document"} (${media.originalName || saved.key})`, req.auth.user);
  res.status(201).json({ data: media.toJSON() });
}

async function list(req, res) {
  const paging = parsePagination(req.valid.query, { defaultLimit: 30 });
  const [docs, total] = await Promise.all([Media.find().sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit), Media.countDocuments()]);
  res.json({ data: docs.map((d) => d.toJSON()), meta: paginationMeta(paging, total) });
}

async function remove(req, res) {
  const doc = await Media.findByIdAndDelete(req.valid.params.id);
  if (!doc) throw ApiError.notFound("That file no longer exists.");
  await storage.removeFile(doc.storageKey);
  recordActivity(`Deleted uploaded file (${doc.originalName || doc.storageKey})`, req.auth.user);
  res.status(204).end();
}

module.exports = { detectFileType, uploadMiddleware, upload, list, remove };
