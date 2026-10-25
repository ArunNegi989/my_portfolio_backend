// Local-disk storage for uploads. File names are generated here (never taken from the client),
// so path traversal and overwriting existing files are impossible. The interface (save/remove/url)
// is small on purpose: swap this module for an object-storage implementation in production.

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { getConfig } = require("../config/env");

const PUBLIC_PREFIX = "/uploads";

async function ensureUploadDir() {
  await fs.mkdir(getConfig().uploads.dir, { recursive: true });
}

function generateKey(extension) {
  return `${Date.now().toString(36)}-${crypto.randomBytes(12).toString("hex")}.${extension}`;
}

function resolveKey(key) {
  if (!/^[a-z0-9]+-[a-f0-9]{24}\.[a-z0-9]{2,5}$/.test(key)) throw new Error("Invalid storage key");
  const dir = getConfig().uploads.dir;
  const full = path.resolve(dir, key);
  if (path.dirname(full) !== dir) throw new Error("Invalid storage key");
  return full;
}

/** Writes the buffer under a fresh random name. `wx` refuses to overwrite an existing file. */
async function saveFile(buffer, extension) {
  await ensureUploadDir();
  const key = generateKey(extension);
  await fs.writeFile(resolveKey(key), buffer, { flag: "wx" });
  return { key, url: `${getConfig().backendPublicUrl}${PUBLIC_PREFIX}/${key}` };
}

async function removeFile(key) {
  try {
    await fs.unlink(resolveKey(key));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

module.exports = { PUBLIC_PREFIX, ensureUploadDir, saveFile, removeFile };
