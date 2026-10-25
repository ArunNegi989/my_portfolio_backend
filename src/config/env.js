// Loads and validates every environment variable once. Anything missing or unsafe stops the
// process with a readable list of problems instead of failing later at runtime.

const path = require("node:path");
const { z } = require("zod");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const bool = (fallback) =>
  z
    .enum(["true", "false", "1", "0", "yes", "no"])
    .optional()
    .transform((v) => (v === undefined ? fallback : ["true", "1", "yes"].includes(v)));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

    MONGODB_URI: z.string({ error: "is required (MongoDB connection string)" }).min(1, "is required (MongoDB connection string)"),

    FRONTEND_URL: z.string({ error: "is required (e.g. http://localhost:3000)" }).url("must be a full URL such as http://localhost:3000"),
    CORS_ORIGINS: optionalString,
    BACKEND_PUBLIC_URL: optionalString,
    FRONTEND_REVALIDATE_URL: optionalString,
    REVALIDATE_SECRET: optionalString,

    JWT_ACCESS_SECRET: z.string({ error: "is required" }).min(32, "must be at least 32 characters (run npm run generate-secrets)"),
    JWT_REFRESH_SECRET: z.string({ error: "is required" }).min(32, "must be at least 32 characters (run npm run generate-secrets)"),
    JWT_ACCESS_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, "use a duration like 15m").default("15m"),
    JWT_REFRESH_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, "use a duration like 7d").default("7d"),
    JWT_ISSUER: z.string().min(1).default("my-portfolio-backend"),
    JWT_AUDIENCE: z.string().min(1).default("my-portfolio-admin"),

    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    COOKIE_SECURE: bool(undefined),
    COOKIE_DOMAIN: optionalString,

    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_SECURE: bool(undefined),
    SMTP_USER: optionalString,
    SMTP_APP_PASSWORD: optionalString,
    EMAIL_FROM: optionalString,
    CONTACT_NOTIFY_EMAIL: optionalString,

    ALLOW_PUBLIC_SIGNUP: bool(true),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),

    UPLOAD_DIR: z.string().default("uploads"),
    MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
    MAX_DOCUMENT_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  })
  .superRefine((env, ctx) => {
    const issue = (pathName, message) => ctx.addIssue({ code: "custom", path: [pathName], message });
    const production = env.NODE_ENV === "production";

    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) issue("JWT_REFRESH_SECRET", "must be different from JWT_ACCESS_SECRET");
    if (env.REVALIDATE_SECRET && env.REVALIDATE_SECRET.length < 32) issue("REVALIDATE_SECRET", "must be at least 32 characters when set");
    if (env.COOKIE_SAMESITE === "none" && env.COOKIE_SECURE === false) issue("COOKIE_SECURE", "must be true when COOKIE_SAMESITE=none");

    const smtpValues = [env.SMTP_HOST, env.SMTP_USER, env.SMTP_APP_PASSWORD, env.EMAIL_FROM];
    if (smtpValues.some(Boolean) && !smtpValues.every(Boolean)) {
      issue("SMTP_HOST", "SMTP_HOST, SMTP_USER, SMTP_APP_PASSWORD and EMAIL_FROM must be set together");
    }

    if (production) {
      if (env.COOKIE_SECURE === false) issue("COOKIE_SECURE", "cannot be false in production (cookies must only travel over HTTPS)");
      if (!env.FRONTEND_URL.startsWith("https://")) issue("FRONTEND_URL", "must use https:// in production");
      if (!env.BACKEND_PUBLIC_URL) issue("BACKEND_PUBLIC_URL", "is required in production (public URL of this API, used for upload links)");
      if (!smtpValues.every(Boolean)) issue("SMTP_HOST", "SMTP settings are required in production (password reset emails)");
    }
    for (const key of ["BACKEND_PUBLIC_URL", "FRONTEND_REVALIDATE_URL"]) {
      if (env[key] && !/^https?:\/\/[^\s]+$/.test(env[key])) issue(key, "must be a full http(s) URL");
    }
  });

class ConfigError extends Error {}

function formatIssues(error) {
  return error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
}

function buildConfig(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(`Invalid environment configuration:\n${formatIssues(parsed.error)}\n\nSee .env.example and README.md for the required variables.`);
  }
  const env = parsed.data;
  const production = env.NODE_ENV === "production";
  const stripSlash = (u) => u.replace(/\/+$/, "");
  const frontendUrl = stripSlash(env.FRONTEND_URL);
  const extraOrigins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => stripSlash(o.trim()))
    .filter(Boolean);

  return Object.freeze({
    env: env.NODE_ENV,
    isProduction: production,
    isTest: env.NODE_ENV === "test",
    port: env.PORT,
    logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === "test" ? "silent" : "info"),
    trustProxy: env.TRUST_PROXY,
    mongoUri: env.MONGODB_URI,
    frontendUrl,
    allowedOrigins: Object.freeze([...new Set([frontendUrl, ...extraOrigins].map((o) => new URL(o).origin))]),
    backendPublicUrl: stripSlash(env.BACKEND_PUBLIC_URL ?? `http://localhost:${env.PORT}`),
    revalidate: Object.freeze({
      url: env.FRONTEND_REVALIDATE_URL ?? `${frontendUrl}/api/revalidate`,
      secret: env.REVALIDATE_SECRET,
    }),
    jwt: Object.freeze({
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }),
    cookies: Object.freeze({
      sameSite: env.COOKIE_SAMESITE,
      secure: env.COOKIE_SECURE ?? production,
      domain: env.COOKIE_DOMAIN,
    }),
    smtp: Object.freeze({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 465,
      secure: env.SMTP_SECURE ?? (env.SMTP_PORT ?? 465) === 465,
      user: env.SMTP_USER,
      password: env.SMTP_APP_PASSWORD,
      from: env.EMAIL_FROM,
      contactNotifyTo: env.CONTACT_NOTIFY_EMAIL ?? env.SMTP_USER,
    }),
    allowPublicSignup: env.ALLOW_PUBLIC_SIGNUP,
    passwordResetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    uploads: Object.freeze({
      dir: path.resolve(__dirname, "../..", env.UPLOAD_DIR),
      maxImageBytes: env.MAX_IMAGE_BYTES,
      maxDocumentBytes: env.MAX_DOCUMENT_BYTES,
    }),
  });
}

let cached;

/** The validated configuration. Built on first use so tests can set process.env beforehand. */
function getConfig() {
  cached ??= buildConfig();
  return cached;
}

/** Validates only the listed variables, for scripts that do not need the whole server config. */
function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name] || !process.env[name].trim());
  if (missing.length) {
    throw new ConfigError(`Missing required environment variables: ${missing.join(", ")}. See .env.example.`);
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name].trim()]));
}

module.exports = { getConfig, buildConfig, requireEnv, ConfigError };
