# Backend Implementation Plan

How the existing `my-portfolio-frontend` maps onto this backend. Every row below comes from reading the actual frontend code (pages, admin screens, `types/content.ts`, `lib/data/index.ts`, `lib/admin/store.ts`), not from a generic template.

## 1. What the frontend already had

| Area | Before | After |
| --- | --- | --- |
| Public pages | Server components read typed modules in `data/*.ts` through `lib/data/index.ts` | `lib/data/index.ts` reads the public API with `"use cache"` + `cacheTag`; `data/*.ts` stays as the seed source and as an offline fallback |
| Admin dashboard | 13 screens edit a client store (`lib/admin/store.ts`) persisted to `localStorage` | Same screens and forms; the store loads from and saves to the admin API |
| Auth pages | `/login`, `/signup`, `/forgot-password` with demo functions in `lib/auth/index.ts` | Real API calls; new `/reset-password` page; dashboard guarded |
| Contact form | Validated, sends nothing (demo) | `POST /api/v1/contact`, stored in MongoDB, optional email notification; new admin "Messages" screen |
| Image fields | `ImageSourceInput` (URL or picked file → temporary `blob:` URL) | URL or upload → `POST /api/v1/admin/media` → stored URL |
| Resume field | PDF picker that only set a `/resume/<name>` path | PDF uploaded through the media endpoint |
| Sign out | Disabled "Sign out (Phase 2)" menu item | Revokes the session, clears state, redirects to `/login` |

The content shapes in `types/content.ts` are kept unchanged: the API returns exactly those objects (string `id` keys such as `p-yoga`, `dream-byte-solutions`), so no public component had to change its props.

## 2. Page → editable fields → model → endpoints → consumer

Public endpoints are under `/api/v1`, admin endpoints under `/api/v1/admin` (authenticated admin + CSRF check on writes).

| Public page / section | Editable fields (admin screen) | Model | Public endpoint | Admin endpoints | Frontend consumer |
| --- | --- | --- | --- | --- | --- |
| Home hero, marquee, section headings, featured projects, contact CTA | `heroName`, `heroRole`, `heroRoles[]`, `heroRoleInterval`, `heroSupportingText`, `primaryCtaLabel`, `secondaryCtaLabel`, `techLabels[]`, `sections[]{key,label,visible,eyebrow,title}`, `featuredProjectSlugs[]`, `contactHeadline`, `contactText` (**Pages & sections**) | `HomeContent` (singleton) | `GET /home` | `PUT /admin/home` | `getHomeContent()` → `app/(public)/page.tsx`, `Hero`, `Marquee`, `ContactSection`, `ContactCta`; `PagesScreen` |
| Profile: about preview, About page, stats, contact details, resume | `name`, `shortName`, `role`, `headline`, `intro`, `summary`, `aboutParagraphs[]`, `focusAreas[]`, `email`, `phone`, `location`, `availability`, `availableForWork`, `resumePath`, `stats[]`, `portraitImage`, `aboutImage` (**Profile**) | `Profile` (singleton) | `GET /profile` | `PUT /admin/profile` | `getProfile()` → `AboutPreview`, About page, `Navbar`, `Footer`, `ContactSection`; `ProfileScreen` |
| Site settings, footer, page imagery, intro, smooth scroll, WhatsApp | `siteName`, `tagline`, `defaultOgImage`, `introEnabled`, `introAudioEnabled`, `smoothScroll`, `whatsappNumber`, `footerNote`, `footerHeadline`, `footerInvitation`, `footerCtaLabel`, `footerHighlights[]`, `pageImages{skillsHero,educationSide,projectsHero,blogHero}` (**Settings**) | `SiteSettings` (singleton). `siteUrl` stays an env var (`NEXT_PUBLIC_SITE_URL`) | `GET /settings` | `PUT /admin/settings` | `getSettings()` → root layout metadata, intro boot script, `Footer`, page heroes; `SettingsScreen` |
| Projects list + case studies | all `Project` fields: `slug`, `title`, `category`, `context`, `experienceId`, `period`, `summary`, `overview`, `problem`, `goals[]`, `solution`, `features[]`, `technologies[]`, `process[]`, `results[]`, `liveUrl`, `githubUrl`, `featured`, `status`, `order`, `cover`, `gallery[]`, `representativeImagery`, `detailsPending`, `seoTitle`, `seoDescription` (**Projects**: list, new, edit, duplicate, feature toggle, delete) | `Project` | `GET /projects` (published, paginated, `category`/`q` filters), `GET /projects/:slug` | `GET /admin/projects` (all statuses, paginated, filters), `POST /admin/projects`, `PUT /admin/projects/:id`, `DELETE /admin/projects/:id` | `getProjects()`, `getProjectBySlug()`, `getFeaturedProjects()` → `/projects`, `/projects/[slug]`, home, experience timeline; `ProjectsTable`, `ProjectForm` |
| Blog list + articles | `slug`, `title`, `excerpt`, `category`, `tags[]`, `cover`, `content` (Markdown subset), `author`, `publishedAt`, `status`, `featured`, `seoTitle`, `seoDescription` (**Blog**) | `BlogPost` | `GET /posts` (published, newest first, paginated, `category`/`q`), `GET /posts/:slug` | `GET /admin/posts`, `POST`, `PUT /:id`, `DELETE /:id` | `getPosts()`, `getPostBySlug()` → `/blog`, `/blog/[slug]`, home; `PostsTable`, `PostForm` |
| Experience timeline | `role`, `company`, `location`, `startDate`, `endDate`, `summary`, `responsibilities[]`, `relatedProjectSlugs[]`, `technologies[]`, `order` (**Experience**) | `Experience` | `GET /experience` | `POST /admin/experience`, `PUT /:id`, `DELETE /:id` | `getExperience()` → `/experience`, home, About; `ExperienceScreen` |
| Skills showcase | skills `name`, `category`, `order`; categories `title`, `description` (**Skills**) | `Skill`, `SkillCategory` | `GET /skills` → `{ categories, skills }` | `POST /admin/skills`, `PUT /admin/skills` (bulk reorder), `DELETE /admin/skills/:id`, `PUT /admin/skill-categories` | `getSkills()` → `/skills`, home, About; `SkillsScreen` |
| Services | `slug`, `title`, `shortTitle`, `description`, `deliverables[]`, `technologies[]`, `image`, `visible`, `order` (**Services**) | `Service` | `GET /services` (visible) | `POST`, `PUT /:id`, `PUT /admin/services` (bulk reorder), `DELETE /:id` | `getServices()` → `/services`, home, contact form options; `ServicesScreen` |
| Education & certifications (About) | education `degree`, `institution`, `location`, `startYear`, `endYear`; certification `title`, `issuer` (**Education**) | `Education`, `Certification` | `GET /education` → `{ education, certifications }` | `POST/PUT/DELETE /admin/education[/:id]`, `/admin/certifications[/:id]` | `getEducation()` → About; `EducationScreen` |
| Testimonials (no public section yet) | `name`, `role`, `company`, `quote`, `isDemo`, `visible` (**Testimonials**) | `Testimonial` | `GET /testimonials` (only `isDemo: false` and `visible: true`) | `POST`, `PUT /:id`, `DELETE /:id` | `getPublicTestimonials()`; `TestimonialsScreen` |
| Social links (footer, contact) | `platform`, `label`, `url`, `visible`, order (**Social links**) | `SocialLink` | `GET /social-links` (visible) | `PUT /admin/social-links` (save the whole list, like the form does) | `getSocialLinks()` → `Footer`, `ContactSection`; `SocialLinksScreen` |
| Per-page SEO | `title`, `description`, `canonical`, `ogImage` per static page (**SEO**) | `PageSeo` | `GET /seo` | `PUT /admin/seo` (save the whole list) | `pageMetadata()` → every static page's `generateMetadata`, sitemap; `SeoScreen` |
| Contact form | `name`, `email`, `projectType`, `message` | `ContactMessage` | `POST /contact` | `GET /admin/messages` (paginated, `status`/`q`), `PATCH /admin/messages/:id`, `DELETE /admin/messages/:id` | `ContactForm`; new `MessagesScreen` |
| Uploaded images / resume | file + URL | `Media` | files served from `GET /uploads/:file` | `POST /admin/media`, `GET /admin/media`, `DELETE /admin/media/:id` | `ImageSourceInput`, `ResumeUploadField` |
| Admin overview "Recent activity" | — (written by the server on every admin change) | `ActivityLog` | — | included in `GET /admin/content` | `Overview` |
| Admin bootstrap | — | — | — | `GET /admin/content` returns every dataset in one call (the shape of the old `AdminState`) | `lib/admin/store.ts` |

### Not made editable (and why)

| Content | Reason |
| --- | --- |
| Primary navigation (`data/settings.ts → navigation`) | Mirrors the app's route files; adding a page needs code anyway. No admin UI exists for it |
| Inner-page hero copy hardcoded in page components (e.g. "Selected Work", "The Toolkit") and fixed UI labels | No admin fields exist for them in the current dashboard; making them editable would mean new UI, which the brief asks not to invent |
| `siteUrl` | Deployment configuration (`NEXT_PUBLIC_SITE_URL`), not content |

## 3. Authentication

| Requirement | Implementation |
| --- | --- |
| Admin bootstrap | `npm run create-admin` reads `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`; refuses to run once any admin exists |
| Signup (existing `/signup` page) | `POST /auth/signup` creates a `user`-role account with **no dashboard access**; same generic response whether or not the email is taken (no enumeration, no duplicates). An admin promotes accounts with `npm run promote-admin -- <email>`. Can be closed with `ALLOW_PUBLIC_SIGNUP=false` |
| Login | `POST /auth/login`: bcrypt (cost 12), generic error, per-IP rate limit + per-account temporary lockout, dummy hash comparison when the account doesn't exist |
| Sessions | Short-lived access JWT (15 min) + refresh JWT (7 days), both in HttpOnly cookies. Refresh tokens are rotated on every use, stored as SHA-256 hashes on a `Session` document, and reuse of an old token revokes the session |
| CSRF | Every cookie-authenticated write must send `X-CSRF-Token` (an HMAC of the session id, returned by login/refresh/me and held in memory by the client) and come from the configured frontend origin |
| Logout | Revokes the session server-side, clears both cookies; the dashboard clears its in-memory state and redirects to `/login` |
| Forgot / reset password | Generic response; single-use random token, SHA-256 hash stored, 30-minute expiry, emailed link to `${FRONTEND_URL}/reset-password?token=…`; success revokes every session of that user |
| Dashboard protection | Backend: every `/admin/*` route requires a valid access token, an `admin` role and (for writes) the CSRF token. Frontend: `AdminShell` renders nothing until `/auth/me` confirms an admin session, re-checks on back/forward cache restores |

## 4. Caching and revalidation

- Public reads use `"use cache"` with `cacheLife("minutes")` and a tag per dataset (`projects`, `posts`, `profile`, …).
- After every admin write the backend calls `POST ${FRONTEND_URL}/api/revalidate` with `REVALIDATE_SECRET`; the route handler calls `revalidateTag(tag, { expire: 0 })` so the next visit renders fresh content.
- If `NEXT_PUBLIC_API_URL` is unset the site renders the static `data/*.ts` content (useful for design work); if the API is configured but unreachable, the site logs the error and falls back to the static content instead of returning 500s.

## 5. Decisions made during implementation

| Topic | Decision | Reason |
| --- | --- | --- |
| Password hashing | bcrypt (cost 12) via `bcryptjs` instead of Argon2id | The `argon2` native module failed to build on this machine (no prebuilt binary, no C++ toolchain); pure-JS bcrypt deploys anywhere. Passwords over bcrypt's 72-byte limit are rejected |
| `relatedProjectSlugs` | Stored on each experience entry | The Experience screen edits it directly (checkbox list), so it is real content, not derived data |
| "Remember me" | Unticked → refresh cookie without expiry (ends with the browser session) | The checkbox already existed on the login form; it now has an effect |
| Seed source | `npm run build-seed` compiles `my-portfolio-frontend/data/*.ts` into `seed/content.json` | Keeps the import identical to the site's current content |
| Different-domain deployments | Optional same-origin proxy in `next.config.ts` (`API_PROXY_TARGET`) | Keeps auth cookies first-party; Safari/Firefox block third-party cookies |
| Pages rendered on demand | `Navbar`, `SmoothScroll` and the admin layout read the pathname inside `<Suspense>` | Required by Cache Components for params unknown at build time (new projects/articles, new admin ids); without it those requests returned 500 |
| Dependencies | `nodemailer` 10 and `zod` 4 | Older majors had high-severity advisories (`npm audit`) |

## 6. Build order

1. Config, database connection, logging, error handling, security middleware.
2. Models and Zod validators that mirror `types/content.ts`.
3. Auth (users, sessions, tokens, CSRF, password reset, email service).
4. Public and admin content routes, contact, media.
5. Seed script (imports `seed/content.json`, generated from the frontend's `data/*.ts`; insert-only, never overwrites).
6. Frontend integration (API client, data layer, admin store, auth pages, uploads, contact form, messages screen, revalidation route).
7. Tests (backend: auth, CRUD, media, contact, CORS; end-to-end: admin edit → public page).
