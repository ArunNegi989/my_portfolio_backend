# API Documentation

Base URL: `{BACKEND_PUBLIC_URL}/api/v1` (development: `http://localhost:5000/api/v1`).

## Conventions

| Topic | Rule |
| --- | --- |
| Format | JSON in and out (`Content-Type: application/json`), except uploads (`multipart/form-data`) |
| Success | `{ "data": … }`, plus `"meta"` on paginated lists: `{ page, limit, total, totalPages }` |
| Errors | `{ "error": { "code": "…", "message": "…", "details": [{ "field": "…", "message": "…" }] } }` (`details` only for validation errors) |
| Ids | Content uses the frontend's string ids (`p-yoga`, `dream-byte-solutions`); pattern `^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`. Messages and media use MongoDB ObjectIds |
| Unknown fields | Silently dropped (no mass assignment) |
| Pagination | `?page=1&limit=20` — `limit` 1–100. Public project/post lists default to 100 |
| Auth | HttpOnly cookies: `access_token` (15 min, path `/api`) and `refresh_token` (7 days, path `/api/v1/auth`). Send requests with `credentials: "include"` |
| CSRF | Every `POST/PUT/PATCH/DELETE` must come from an allowed `Origin`. Admin writes must also send `X-CSRF-Token: <csrfToken>` (from login / refresh / me) |
| Caching | Responses carry `Cache-Control: no-store` |

### Status codes

| Code | Meaning |
| --- | --- |
| 200 / 201 / 202 / 204 | OK / created / accepted (signup, forgot password) / no content (delete, logout) |
| 400 `BAD_REQUEST` | Validation failed (see `details`), malformed JSON or id |
| 401 `UNAUTHENTICATED` | No session, expired or revoked session, wrong credentials |
| 403 `FORBIDDEN` / `CSRF_TOKEN_INVALID` | Not an admin, untrusted origin, or missing/invalid CSRF token |
| 404 `NOT_FOUND` | Record or route does not exist (also: database not seeded, for singletons) |
| 409 `CONFLICT` | Duplicate id / slug / unique value |
| 413 `FILE_TOO_LARGE` / `PAYLOAD_TOO_LARGE` | Upload over its limit / JSON body over 1 MB |
| 415 `UNSUPPORTED_FILE_TYPE` | File contents are not JPG, PNG, WEBP, GIF or PDF |
| 429 `RATE_LIMITED` | Too many requests (see SECURITY.md for limits) |
| 503 `SERVICE_UNAVAILABLE` | Database unreachable |

---

## Health

| Method | Path | Access | Response |
| --- | --- | --- | --- |
| GET | `/health` | Public | `200 { data: { status: "ok", database: "connected" } }` or `503` when MongoDB is down |

## Authentication — `/auth`

| Method | Path | Access | Body | Response |
| --- | --- | --- | --- | --- |
| POST | `/auth/signup` | Public, rate-limited | `{ name, email, password }` | `202 { data: { message } }` — same message whether or not the email exists. Creates a `user` (no dashboard access) |
| POST | `/auth/login` | Public, rate-limited | `{ email, password, remember? }` | `200 { data: { user, csrfToken } }` + cookies. `401` "Invalid email or password." for any failure |
| POST | `/auth/refresh` | Refresh cookie | — | `200 { data: { user, csrfToken } }` + rotated cookies; `401` and cleared cookies if invalid/reused/revoked |
| POST | `/auth/logout` | Cookies (best effort) | — | `204`, session revoked, cookies cleared |
| GET | `/auth/me` | Access cookie | — | `200 { data: { user, csrfToken } }` |
| POST | `/auth/forgot-password` | Public, rate-limited | `{ email }` | `202 { data: { message } }` — always the same; emails a single-use link if the account exists |
| POST | `/auth/reset-password` | Public, rate-limited | `{ token, password }` | `200 { data: { message } }`, all sessions of the user revoked; `400 RESET_TOKEN_INVALID` for invalid/expired/used tokens |

`user` = `{ id, name, email, role: "admin" | "user" }`.

Password rules (signup and reset): at least 8 characters, a letter and a number, at most 72 bytes.

### Example: sign in and save

```js
const api = "http://localhost:5000/api/v1";
const login = await fetch(`${api}/auth/login`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@example.com", password: "…" }),
}).then((r) => r.json());

await fetch(`${api}/admin/profile`, {
  method: "PUT",
  credentials: "include",
  headers: { "Content-Type": "application/json", "X-CSRF-Token": login.data.csrfToken },
  body: JSON.stringify(profile),
});
```

---

## Public content (read-only, no auth)

| Method | Path | Returns | Notes |
| --- | --- | --- | --- |
| GET | `/profile` | `Profile` | 404 until seeded |
| GET | `/home` | `HomeContent` | 404 until seeded |
| GET | `/settings` | `SiteSettings` without `siteUrl` | 404 until seeded |
| GET | `/projects` | `Project[]` + `meta` | Published only, by `order`. Filters: `category`, `featured=true|false`, `q` (title, summary, context, category, technologies, slug) |
| GET | `/projects/:slug` | `Project` | Published only |
| GET | `/posts` | `BlogPost[]` + `meta` | Published only, newest first. Filters: `category`, `q` (title, excerpt, category, tags, slug) |
| GET | `/posts/:slug` | `BlogPost` | Published only |
| GET | `/experience` | `Experience[]` | By `order` |
| GET | `/skills` | `{ categories: SkillCategory[], skills: Skill[] }` | |
| GET | `/services` | `Service[]` | `visible: true` only, by `order` |
| GET | `/education` | `{ education: Education[], certifications: Certification[] }` | |
| GET | `/testimonials` | `Testimonial[]` | Only `isDemo: false` and `visible: true` |
| GET | `/social-links` | `SocialLink[]` | `visible: true` only, in saved order |
| GET | `/seo` | `PageSeo[]` | Per-page SEO for the static routes |
| GET | `/uploads/:file` | the file | Served outside `/api/v1`, with `nosniff`, a sandboxing CSP and `Cross-Origin-Resource-Policy: cross-origin` |

All shapes match `my-portfolio-frontend/types/content.ts` exactly.

## Contact form

| Method | Path | Access | Body | Response |
| --- | --- | --- | --- | --- |
| POST | `/contact` | Public, rate-limited (5 / 10 min / IP) | `{ name (2–100), email, projectType? (≤120), message (20–5000), website? }` | `201 { data: { message } }`. `website` is a honeypot: if filled, nothing is stored. Identical email + message within 10 minutes is stored once. Notifies `CONTACT_NOTIFY_EMAIL` when SMTP is configured |

---

## Admin API — `/admin` (admin role required)

Every route below requires a valid session **and** the `admin` role (`401` / `403` otherwise). Writes also require `X-CSRF-Token` and an allowed `Origin`.

### Dashboard bootstrap

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/admin/content` | `{ profile, home, settings, projects, posts, experience, skills, skillCategories, services, education, certifications, testimonials, socialLinks, seo, activity }` — all records, including drafts and hidden ones. Singletons are `null` before seeding |

### Singletons

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET / PUT | `/admin/profile` | full `Profile` | PUT replaces the document (creates it if missing) |
| GET / PUT | `/admin/home` | full `HomeContent` | `heroRoleInterval` 1.5–10; at least one non-empty hero role |
| GET / PUT | `/admin/settings` | full `SiteSettings` (`siteUrl` ignored) | `whatsappNumber` empty or 8–15 digits |
| PUT | `/admin/skill-categories` | `{ items: SkillCategory[] }` | Title/description edits; order follows the list |

### Collections

`PUT /:id` is a full replacement: optional fields that are left out (e.g. `liveUrl`) are removed.

| Resource | List | Create | Replace | Delete | Save whole list |
| --- | --- | --- | --- | --- | --- |
| Projects | `GET /admin/projects` (paginated; `status=published|draft|all`, `category`, `featured`, `q`) | `POST /admin/projects` | `PUT /admin/projects/:id` | `DELETE /admin/projects/:id` | — |
| Blog posts | `GET /admin/posts` (paginated; `status`, `category`, `q`) | `POST /admin/posts` | `PUT /admin/posts/:id` | `DELETE /admin/posts/:id` | — |
| Experience | `GET /admin/experience` | `POST` | `PUT /:id` | `DELETE /:id` | — |
| Skills | `GET /admin/skills` | `POST` | `PUT /:id` | `DELETE /:id` | `PUT /admin/skills` `{ items }` (reordering) |
| Services | `GET /admin/services` | `POST` | `PUT /:id` | `DELETE /:id` | `PUT /admin/services` `{ items }` (reordering) |
| Education | `GET /admin/education` | `POST` | `PUT /:id` | `DELETE /:id` | — |
| Certifications | `GET /admin/certifications` | `POST` | `PUT /:id` | `DELETE /:id` | — |
| Testimonials | `GET /admin/testimonials` | `POST` | `PUT /:id` | `DELETE /:id` | — |
| Social links | `GET /admin/social-links` | `POST` | `PUT /:id` | `DELETE /:id` | `PUT /admin/social-links` `{ items }` (the screen saves the whole list; items left out are deleted) |
| SEO | `GET /admin/seo` | — | — | — | `PUT /admin/seo` `{ items }` |

Create accepts an optional client `id` (the dashboard sends one); otherwise the server generates `<prefix>-<random>`. Duplicate ids or slugs → `409`.

Validation highlights (full rules in `src/validators/content.validators.js`):

| Type | Rules |
| --- | --- |
| Project | `slug` lowercase-hyphen and unique; `title`, `category`, `summary` required; ≥ 1 technology; `cover.src` required; `liveUrl` http(s) only; `experienceId` must exist |
| Blog post | `slug` unique; `title`, `excerpt`, `category` required; `content` ≥ 50 chars; `publishedAt` `YYYY-MM-DD` |
| Experience | `startDate`/`endDate` `YYYY-MM`, end ≥ start, `endDate: null` = current role |
| Skill | `name` unique per category (case-insensitive); `category` one of `frontend, backend, databases, cms, tools` |
| Education | years `YYYY` or empty, end ≥ start |
| Testimonial | `isDemo: true` forces `visible: false` |
| URLs | links: http(s), `mailto:` or `/path`; images: http(s) or `/path` (never `javascript:`, `data:` or `blob:`) |

### Contact messages

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/messages` | Paginated, newest first. `status=new|read|archived|all`, `q` (name, email, message, project type). `meta.unread` = count of `new` |
| PATCH | `/admin/messages/:id` | `{ status: "new" | "read" | "archived" }` |
| DELETE | `/admin/messages/:id` | `204` |

### Media

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/admin/media` | `multipart/form-data`: `file` (one) + optional `purpose` = `image` or `document`. Accepted by content: JPG, PNG, WEBP, GIF (≤ 5 MB) and PDF (≤ 10 MB). Returns `201 { data: { id, url, kind, originalName, mimeType, size, createdAt } }` |
| GET | `/admin/media` | Paginated list of uploads |
| DELETE | `/admin/media/:id` | Deletes the record and the file. Does not check whether content still references the URL |

---

## Frontend revalidation webhook (called by this API)

After every admin write the API sends:

```http
POST {FRONTEND_REVALIDATE_URL or FRONTEND_URL/api/revalidate}
X-Revalidate-Secret: {REVALIDATE_SECRET}
Content-Type: application/json

{ "tags": ["projects"] }
```

Tags: `profile`, `settings`, `home`, `social-links`, `projects`, `posts`, `experience`, `skills`, `services`, `education`, `testimonials`, `seo`. Failures are logged and never fail the admin request.
