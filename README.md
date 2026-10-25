# my-portfolio-backend

REST API, authentication and content management for [`my-portfolio-frontend`](../my-portfolio-frontend). It stores every piece of editable site content in MongoDB, powers the admin dashboard, handles the contact form and uploads, and tells the Next.js site to refresh its cache whenever content changes.

Built with **Node.js 20+, Express 5, MongoDB / Mongoose 8, Zod, JWT (HttpOnly cookies), bcrypt, Nodemailer, Multer, Helmet, Pino**.

| Document | Contents |
| --- | --- |
| [BACKEND_IMPLEMENTATION_PLAN.md](BACKEND_IMPLEMENTATION_PLAN.md) | Every page and admin screen mapped to its model, endpoints and frontend component |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | All endpoints, request/response shapes, status codes |
| [SECURITY.md](SECURITY.md) | Security controls, how they're tested, remaining risks |

---

## 1. Quick start (local development)

You need **Node.js 20.19 or newer** (`node -v`) and a MongoDB database (MongoDB Atlas free tier works).

```bash
# 1. Backend
cd my-portfolio-backend
npm install
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
npm run generate-secrets        # paste the printed values into .env
# fill in MONGODB_URI, SMTP_* and INITIAL_ADMIN_* in .env (see section 2)

npm run seed                    # import the site's existing content (safe to re-run)
npm run create-admin            # create your admin account (one time)
npm run dev                     # API on http://localhost:5000

# 2. Frontend (second terminal)
cd ../my-portfolio-frontend
cp .env.example .env.local      # set REVALIDATE_SECRET to the same value as the backend
npm install
npm run dev                     # site on http://localhost:3000, dashboard on /login
```

Sign in at <http://localhost:3000/login> with `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`. Then delete `INITIAL_ADMIN_PASSWORD` from `.env`.

---

## 2. Environment variables

### Backend — `my-portfolio-backend/.env`

**You must fill in:**

| Variable | What to put | Where it comes from |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/portfolio?retryWrites=true&w=majority` | Atlas → your cluster → **Connect** → **Drivers**. Include a database name (e.g. `/portfolio`) |
| `JWT_ACCESS_SECRET` | 32+ random characters | `npm run generate-secrets` |
| `JWT_REFRESH_SECRET` | 32+ random characters, different from the access secret | `npm run generate-secrets` |
| `REVALIDATE_SECRET` | 32+ random characters, **same value in the frontend's `.env.local`** | `npm run generate-secrets` |
| `SMTP_USER` | your Gmail address | — |
| `SMTP_APP_PASSWORD` | the 16-character Gmail App Password (spaces optional) | see section 4 |
| `EMAIL_FROM` | e.g. `Arun Negi Portfolio <you@gmail.com>` (must be the Gmail address or a verified alias) | — |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | your dashboard login (password: 8+ chars, a letter and a number) | your choice; remove the password after `npm run create-admin` |

**Usually leave as is in development:**

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `5000` | |
| `NODE_ENV` | `development` | `production` turns on strict checks |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed origin (CORS + CSRF) and base of password-reset links |
| `CORS_ORIGINS` | empty | Extra allowed origins, comma separated |
| `BACKEND_PUBLIC_URL` | `http://localhost:5000` | Public URL of this API, used in upload links. **Required in production** |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `15m` / `7d` | |
| `COOKIE_SAMESITE` | `lax` | `none` only for cross-site deployments (needs HTTPS) |
| `COOKIE_SECURE` | `true` in production | Must stay `true` in production |
| `COOKIE_DOMAIN` | empty | e.g. `.example.com` to share across subdomains |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | `smtp.gmail.com` / `465` / `true` | Or port `587` with `SMTP_SECURE=false` (STARTTLS) |
| `CONTACT_NOTIFY_EMAIL` | `SMTP_USER` | Where contact-form notifications go |
| `ALLOW_PUBLIC_SIGNUP` | `true` | `false` closes `/signup` (403) |
| `PASSWORD_RESET_TTL_MINUTES` | `30` | 5–120 |
| `UPLOAD_DIR` | `uploads` | Relative to this folder, or absolute |
| `MAX_IMAGE_BYTES` / `MAX_DOCUMENT_BYTES` | 5 MB / 10 MB | |
| `TRUST_PROXY` | `0` | Set to `1` behind one reverse proxy (Render, Railway, Nginx) so rate limits see real client IPs |
| `FRONTEND_REVALIDATE_URL` | `FRONTEND_URL/api/revalidate` | Override if the API should reach the frontend on an internal URL |
| `LOG_LEVEL` | `info` | |

The server validates all of this at startup and exits with a clear list of problems if something is missing or unsafe.

### Frontend — `my-portfolio-frontend/.env.local`

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000/api/v1` (public, not a secret) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` in development, your domain in production |
| `REVALIDATE_SECRET` | same value as the backend (server-only, never prefixed with `NEXT_PUBLIC_`) |
| `API_URL` (optional) | server-side URL of the API if it differs (internal network) |
| `API_PROXY_TARGET` (optional) | see section 9, "Different domains" |

---

## 3. MongoDB setup (Atlas)

1. Create a free cluster at <https://cloud.mongodb.com>.
2. **Database Access** → add a database user with a strong password (role: *Read and write to any database*).
3. **Network Access** → add your IP address for development, and your host's outbound IPs for production (or `0.0.0.0/0` with a strong password if your host has no fixed IPs).
4. **Connect** → **Drivers** → copy the string, replace `<password>` and add a database name, for example `…mongodb.net/portfolio?retryWrites=true&w=majority`. If the password has special characters, URL-encode them.
5. Put it in `MONGODB_URI`.

Collections and indexes are created automatically. You never need to create schemas or collections by hand.

### Importing the existing site content

```bash
npm run seed -- --dry-run   # shows what would be imported
npm run seed                # imports it
```

`seed/content.json` holds the site's current content: 20 projects, 5 articles, 3 roles, 30 skills, 7 services, profile, homepage, settings, SEO and so on. The seed is **insert-only**: records that already exist (by id) are never overwritten or deleted, so running it again after editing in the dashboard is safe.

If you change `my-portfolio-frontend/data/*.ts` before migrating, regenerate the file with `npm run build-seed`.

---

## 4. Email (Gmail App Password)

Password-reset emails and contact-form notifications are sent over SMTP.

1. Turn on **2-Step Verification** for the Google account: <https://myaccount.google.com/security>.
2. Open **App passwords**: <https://myaccount.google.com/apppasswords>. Create one named "Portfolio API".
3. Copy the 16-character password into `SMTP_APP_PASSWORD`, and your Gmail address into `SMTP_USER`.
4. Check it:

```bash
npm run check-email                      # verifies the SMTP login
npm run check-email -- you@example.com   # also sends a test email
```

Without SMTP, the API still runs (and logs a warning), but forgot-password emails and contact notifications are not sent. Messages are still stored and visible in the dashboard. In production SMTP is required.

---

## 5. Admin accounts and authentication

### First admin

```bash
npm run create-admin
```

This uses `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` and optional `INITIAL_ADMIN_NAME`, and **refuses to run once any admin exists**. Remove `INITIAL_ADMIN_PASSWORD` from `.env` afterwards.

### Sign-up and extra admins

The existing `/signup` page works, but new accounts get the `user` role: they can sign in, but the dashboard and every admin API refuse them. To give someone access (requires server access):

```bash
npm run promote-admin -- someone@example.com
npm run promote-admin -- someone@example.com --demote   # remove access (also ends their sessions)
```

Set `ALLOW_PUBLIC_SIGNUP=false` to close registration completely.

### How sessions work

```text
login ──► access_token cookie (JWT, 15 min, HttpOnly, path /api)
      └─► refresh_token cookie (JWT, 7 days, HttpOnly, path /api/v1/auth) + csrfToken in the JSON body

admin request ──► cookie + X-CSRF-Token ──► session checked in MongoDB ──► admin role checked ──► handler
access expired ──► client calls /auth/refresh once ──► new tokens (old refresh token is now invalid)
old refresh token used again ──► session revoked (token theft protection)
logout / password reset ──► session(s) revoked server-side, cookies cleared
```

- "Remember me" unticked → the refresh cookie lasts only until the browser closes.
- 10 wrong passwords lock the account for 15 minutes.
- Forgot password emails a single-use link valid for 30 minutes to `FRONTEND_URL/reset-password`.

---

## 6. Uploads

Image fields in the dashboard keep their URL input and gain a working **Upload** tab; the resume field uploads a PDF.

- Accepted: JPG, PNG, WEBP, GIF up to 5 MB; PDF up to 10 MB. The type is checked from the file contents, not the extension.
- Files are saved under `UPLOAD_DIR` with random names and served at `BACKEND_PUBLIC_URL/uploads/<name>`. MongoDB stores only the reference (`media` collection) and the URL inside the content.
- Existing remote image URLs (Unsplash) keep working unchanged.

**Persistence and backups:** uploads live on the API server's disk. On hosts with ephemeral disks (Render free tier, Heroku, most containers) they disappear on redeploy, so attach a persistent disk/volume mounted at `UPLOAD_DIR`. Back up that folder together with the database. `src/services/storage.service.js` is the only module that touches files; replace it with an object-storage implementation (S3, Cloudinary, R2) if you prefer.

---

## 7. Running everything

| Command (backend) | Purpose |
| --- | --- |
| `npm run dev` | API with auto-restart |
| `npm start` | API (production) |
| `npm test` | Automated tests (in-memory MongoDB; no external services needed) |
| `npm run lint` | ESLint |
| `npm run seed` | Import existing content (insert-only) |
| `npm run build-seed` | Regenerate `seed/content.json` from the frontend's `data/*.ts` |
| `npm run create-admin` | One-time first admin |
| `npm run promote-admin -- <email> [--demote]` | Grant or remove dashboard access |
| `npm run generate-secrets` | Print strong secrets |
| `npm run check-email [-- address]` | Verify SMTP |

Frontend: `npm run dev`, `npm run build`, `npm start`, `npm run lint`, `npx tsc --noEmit`.

---

## 8. Testing

```bash
npm test
```

80 automated tests (`node:test` + `supertest`) run against a real MongoDB engine started in memory by `mongodb-memory-server`. The first run downloads the MongoDB binary (about 600 MB) into `node_modules/.cache`. SMTP is replaced by a recording transport, so no email is sent and no production database is touched.

| File | Covers |
| --- | --- |
| `tests/auth.test.js` | signup validation, duplicates, no privilege escalation, login/generic errors, lockout, rate limits, origin checks, forged/expired/wrong-type tokens, CSRF, refresh rotation, multi-tab grace, reuse detection, logout revocation, "remember me" cookies, forgot/reset (unknown email, hash storage, invalid/expired/reused tokens, session revocation) |
| `tests/content.test.js` | seed import + idempotency, exact frontend shapes, public filtering of drafts/hidden items, pagination/filters/search, CRUD, full-replacement PUT, validation messages, 409/404/400, reference checks, mass assignment, operator injection, singletons, list saves and reordering, activity feed, unseeded database, 503 when MongoDB is down |
| `tests/media.test.js` | valid image and PDF, content-based type checks (fake PNG, SVG, HTML), purpose mismatch, size limits, auth/role/CSRF, list/delete (file removed), path traversal |
| `tests/contact.test.js` | validation, storage, notification email, HTML escaping, duplicates, honeypot, rate limit, admin list/filter/status/delete, privacy |
| `tests/security.test.js` | CORS allow-list and preflight, security headers, error format, body size limit, environment validation (dev/production rules) |

End-to-end verification (run during development, not part of `npm test`): with the API, a MongoDB server and a production build of the frontend running, a script and a real Chrome session checked the full flow. Covered: login, editing through the dashboard forms, image upload, the change appearing on the public pages after revalidation, the contact form reaching the Messages screen, logout plus back-button and direct-URL protection, signup/forgot/reset screens, and mobile layout.

---

## 9. Production deployment

### Checklist

1. **Database:** Atlas cluster, user, network access (section 3). Run `npm run seed` and `npm run create-admin` once against the production `MONGODB_URI`.
2. **API host** (Render, Railway, Fly.io, a VPS…):
   - Node 20+, start command `npm start`, `NODE_ENV=production`.
   - All variables from section 2. Production requires `FRONTEND_URL` with `https://`, `BACKEND_PUBLIC_URL`, SMTP settings and secure cookies.
   - `TRUST_PROXY=1` behind the platform's proxy.
   - A persistent disk for `UPLOAD_DIR` (section 6).
3. **Frontend** (Vercel or any Node host): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `REVALIDATE_SECRET`. Rebuild after changing `NEXT_PUBLIC_*` values, because they are inlined at build time.
4. Visit `/login`, sign in, edit something, and check that it appears on the public page.

### Domains and cookies (important)

Auth cookies must be first-party for browsers to keep them:

| Setup | What to do |
| --- | --- |
| **Same site (recommended):** `www.example.com` + `api.example.com` | `FRONTEND_URL=https://www.example.com`, `COOKIE_SAMESITE=lax`. Works in every browser |
| **Different domains:** e.g. `my-portfolio.vercel.app` + `my-api.onrender.com` | Use the frontend's built-in proxy. On the frontend set `API_PROXY_TARGET=https://my-api.onrender.com`, `NEXT_PUBLIC_API_URL=/api/v1` and `API_URL=https://my-api.onrender.com/api/v1` (for server-side rendering). Keep `COOKIE_SAMESITE=lax` and `FRONTEND_URL=https://my-portfolio.vercel.app` on the API. The browser then talks only to the Vercel domain, which forwards `/api/v1/*` and `/uploads/*` to the API |
| Different domains without the proxy | Requires `COOKIE_SAMESITE=none` (HTTPS). Safari and Firefox block these third-party cookies by default, so login will fail for many visitors. Not recommended |

In proxy mode set `BACKEND_PUBLIC_URL` to the frontend's URL (e.g. `https://my-portfolio.vercel.app`), so upload links go through the proxy too.

### Operations

- **Graceful shutdown:** SIGTERM/SIGINT stop accepting connections, finish in-flight requests and close MongoDB (forced after 10 s).
- **Health check:** `GET /api/v1/health` (503 when MongoDB is unreachable).
- **Logs:** JSON on stdout (Pino), with cookies, tokens and passwords redacted.
- **Backups:** Atlas backups for the database, plus the uploads folder.

---

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Invalid environment configuration: …` on start | Fix the listed variables in `.env` (they're named exactly) |
| `Could not connect to MongoDB` | Check `MONGODB_URI` (password URL-encoded, database name present) and Atlas **Network Access** |
| `querySrv ENOTFOUND` / `ECONNREFUSED` | Network or DNS blocks SRV lookups. Try another network, or use the non-SRV connection string from Atlas |
| Dashboard says "No content yet" | Run `npm run seed` |
| Login always says "Invalid email or password." | Wrong credentials, or the account is locked for 15 minutes after 10 failures. Reset via **Forgot password** or wait |
| Login succeeds but you bounce back to `/login` | Cookies not stored: check that `FRONTEND_URL` matches the site's exact origin, avoid mixing `localhost` and `127.0.0.1`, and see "Domains and cookies" in section 9 |
| `403 Request origin not allowed` | The site's origin isn't `FRONTEND_URL` or in `CORS_ORIGINS` |
| `403 Security token missing or invalid` | Reload the dashboard (the CSRF token lives in memory) |
| Password reset email never arrives | `npm run check-email you@example.com`. `EAUTH` means use an App Password, not your Google password. Check spam |
| Edits don't show on the public site | `REVALIDATE_SECRET` must match on both sides, and the API must reach `FRONTEND_URL/api/revalidate` (check the API log for "Frontend revalidation"). Without it, changes appear within about a minute anyway |
| Uploaded images disappear after redeploy | The host's disk is ephemeral: attach a persistent disk at `UPLOAD_DIR` |
| `429 Too many requests` | Rate limit hit; wait. Behind a proxy set `TRUST_PROXY=1`, otherwise every visitor shares one IP |
| `npm test` is slow the first time | It downloads the MongoDB test binary once |
| Proxy mode: dashboard says "Can't reach the server" and the browser console shows `file:///C:/Program Files/Git/api/v1/...` | Git Bash on Windows rewrote `NEXT_PUBLIC_API_URL=/api/v1` typed on the command line. Put it in `.env.local` instead, or prefix the command with `MSYS_NO_PATHCONV=1`, then rebuild |
