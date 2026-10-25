const { z, text, email } = require("./common");

// Same rules as the signup form's checklist (lib/auth/validation.ts → PASSWORD_RULES), plus the
// 72-byte bcrypt limit so long passwords are rejected instead of being silently truncated.
const newPassword = z
  .string()
  .min(8, "Use at least 8 characters, including a letter and a number.")
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Use 72 characters or fewer.")
  .refine((v) => /[a-z]/i.test(v) && /\d/.test(v), "Use at least 8 characters, including a letter and a number.");

const signup = z.object({
  name: text(100, { min: 2, message: "Name must be at least 2 characters." }),
  email,
  password: newPassword,
});

// Login only checks that something was typed; wrong values get the same generic error.
const login = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter your email address.").max(254),
  password: z.string().min(1, "Enter your password.").max(256),
  remember: z.boolean().default(true),
});

const forgotPassword = z.object({ email: z.string().trim().toLowerCase().min(1, "Enter your email address.").max(254) });

const resetPassword = z.object({
  token: z.string().trim().min(20, "This reset link is invalid or has expired.").max(200),
  password: newPassword,
});

module.exports = { signup, login, forgotPassword, resetPassword, newPassword };
