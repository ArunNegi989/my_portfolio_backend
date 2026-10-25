# Security

What the backend does to protect the portfolio and its dashboard, how it was verified, and what it does **not** cover. Installing security packages doesn't make an application secure, so each control below links to the code and tests that back it.

## Controls in place

### Authentication and sessions

| Control | Implementation | Verified by |
| --- | --- | --- |
| Password hashing | bcrypt, cost 12 (`bcryptjs`). Passwords over 72 bytes are rejected instead of silently truncated | `tests/auth.test.js` → signup tests |
| No plaintext secrets stored | Only bcrypt hashes of passwords and SHA-256 hashes of refresh-token ids and reset tokens are stored | auth tests ("stores only a hash…") |
| Generic auth errors | Login: "Invalid email or password." for unknown email, wrong password and locked account. Signup and forgot-password answer identically whether or not the email exists | auth tests |
| Timing | Unknown emails are compared against a dummy bcrypt hash; reset emails are sent in the background | `src/services/auth.service.js` |
| Brute-force protection | Per-IP rate limit on login (20 / 15 min) plus a per-account lock for 15 minutes after 10 failures | auth tests ("temporarily locks", "rate-limits") |
| Short-lived access token | JWT HS256, 15 min, issuer + audience + type checked, algorithm pinned | auth tests (forged, expired, wrong type) |
| Server-side session check | Every authenticated request also loads the session: revoked, expired or password-changed sessions are refused immediately, not after the access token expires | auth tests (logout, reset) |
| Refresh-token rotation | New refresh token on every refresh; reuse of an old token revokes the session. A 20-second grace window tolerates two tabs refreshing at once | auth tests ("rotates", "tolerates two tabs", "revokes the session when…reused") |
| Logout | Revokes the session server-side and clears both cookies; the dashboard wipes its in-memory content | auth tests + browser test (back button / direct URL after sign-out) |
| Password reset | 256-bit random single-use token, SHA-256 stored, 30-minute expiry, atomically claimed (no double use), link built from `FRONTEND_URL`; success revokes every session | auth tests (invalid, expired, reused, success) |
| Privilege separation | Public signup creates `user` accounts that every admin API rejects (403). Admins are created only by `npm run create-admin` (refuses once an admin exists) or `npm run promote-admin` (needs server access) | auth tests ("cannot use admin APIs", "self-assign the admin role") |
| Cookies | `HttpOnly`; `Secure` by default in production (startup fails if disabled); `SameSite` configurable (`lax` default); refresh cookie scoped to `/api/v1/auth` | auth tests (cookie flags), security tests (production config) |
| Tokens out of URLs, logs and bodies | Tokens travel only in cookies; the logger redacts cookies, CSRF and revalidation headers, and password/token fields | `src/utils/logger.js` |

### Request protection

| Control | Implementation |
| --- | --- |
| CSRF | All state-changing requests must carry an allowed `Origin` (or `Referer`); admin writes must also send `X-CSRF-Token`, an HMAC of the session id that the client keeps in memory. Verified in auth tests ("requires the CSRF token", "untrusted origin") |
| CORS | Explicit allow-list (`FRONTEND_URL` + `CORS_ORIGINS`), credentials allowed only for those origins, never `*` (security tests) |
| Security headers | Helmet defaults (HSTS, nosniff, frame-ancestors, …); `X-Powered-By` removed; `Cache-Control: no-store` on API responses |
| Input validation | Zod schemas for every body, param and query, mirroring the admin forms; unknown fields stripped (no mass assignment) |
| NoSQL injection | Bodies with `$`-prefixed or dotted keys are rejected; Mongoose `sanitizeFilter` and `strictQuery` on; search input is regex-escaped (content tests) |
| Body limits | JSON ≤ 1 MB; uploads ≤ 10 MB (images ≤ 5 MB) |
| Rate limits | login 20 / 15 min, signup 10 / h, forgot-password 5 / 15 min, reset 10 / 15 min, refresh 120 / 15 min, contact 5 / 10 min, uploads 60 / 15 min, admin API 600 / 15 min (per IP) |
| Errors | Central handler; generic messages for unexpected errors, no stack traces in responses; database outages return 503 (content tests) |
| Contact form | Honeypot field, duplicate suppression, rate limit; IPs stored only as keyed hashes; visitor content escaped in notification emails and rendered as plain text in the dashboard (contact tests) |

### Uploads

| Control | Implementation |
| --- | --- |
| Admin only | Upload, list and delete need an admin session + CSRF token (media tests) |
| Real type detection | File type is identified by magic bytes; only JPG, PNG, WEBP, GIF and PDF are accepted. SVG, HTML and renamed files are refused (media tests) |
| Safe storage | The server generates every file name (`<time>-<random>.<ext>`), writes with `wx` (never overwrites) and validates the key against a strict pattern before any disk access; the client name is stored only as metadata |
| Safe serving | `/uploads` is served with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; …; sandbox` and no directory listing |
| No SSRF surface | The server never fetches remote URLs; image URL fields are only syntax-checked (http(s) or site path) |

### Configuration

- Required variables are validated at startup; the process exits with a list of problems instead of running with unsafe defaults.
- JWT secrets must be ≥ 32 characters and different from each other; `npm run generate-secrets` creates strong ones.
- In production the server refuses to start with `COOKIE_SECURE=false`, a non-HTTPS `FRONTEND_URL`, a missing `BACKEND_PUBLIC_URL` or missing SMTP settings.
- `.env` files are git-ignored; nothing secret uses a `NEXT_PUBLIC_` variable on the frontend.

### Dependencies

`npm audit --omit=dev` reported **0 vulnerabilities** for both projects at the time of writing (nodemailer and zod were upgraded to 10.x / 4.x to clear high-severity advisories). Re-run it regularly.

## Remaining risks and limitations

Be aware of these before deploying:

1. **Rate limits are per process and in memory.** With several API instances, use a shared store (e.g. `rate-limit-redis`), otherwise each instance has its own counters.
2. **Account lockout can be abused.** Anyone who knows the admin email can keep the account locked by sending wrong passwords (15 minutes at a time). The per-IP limit slows this down but doesn't stop a distributed attempt.
3. **The dashboard guard runs in the browser.** `/admin` pages render nothing until `/auth/me` confirms an admin session, and all data comes from admin APIs that check the session and role on the server. But the page bundles themselves (UI code, no data) are public, like any SPA. There is no server-side redirect in Next.js `proxy.ts`, because the auth cookies belong to the API's domain.
4. **Cross-site deployments and third-party cookies.** If the frontend and API are on different sites (e.g. `*.vercel.app` + `*.onrender.com`), the cookies are third-party. Safari and Firefox block them by default, and login will fail there. Deploy on the same site (`example.com` + `api.example.com`) or use the frontend's same-origin proxy (`API_PROXY_TARGET`). See README → Deployment.
5. **Uploads are not virus-scanned or re-encoded.** Image metadata (e.g. EXIF location) is kept. Only admins can upload, and files are served with sandboxing headers, but scan or strip them if that matters to you.
6. **Deleting a media file doesn't check whether content still uses it.** The page would then show a broken image (the frontend falls back to an "AN." placeholder).
7. **No two-factor authentication**, and no "sign out everywhere" button (`npm run promote-admin -- <email> --demote` followed by promoting again revokes all sessions, as does a password reset).
8. **No email verification on signup.** Signed-up accounts have no privileges, so the impact is limited to unused rows in `users`.
9. **Password reset depends on the mailbox.** Whoever controls the admin's email account can reset the password. Protect that mailbox (2FA on the Google account).
10. **Content Security Policy for the Next.js site** is not configured (it wasn't before either). Blog Markdown is rendered without raw HTML, and unsafe link schemes are dropped, but a CSP would add defence in depth.
11. **Revalidation webhook secret.** Anyone with `REVALIDATE_SECRET` can force cache refreshes (not content changes). Keep it server-side only.

## Reporting

Found a problem? Contact the site owner privately at the email address on the portfolio rather than opening a public issue.
