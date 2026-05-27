# Changelog

All notable changes to billings-mob are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [1.2.0] — 2026-05-27

### Added

- Supabase Auth with magic-link login, replacing anonymous localStorage session (Sprint 2 item #6)
- Service Worker for offline-first operation via Workbox — observations are accessible without network (Sprint 2 item #7)
- Client-side vector clock with `useObservationSync` hook — PATCH requests now carry `client_vector_clock` for server-side conflict detection per ADR-004 (Sprint 2 item #8)
- `DayDetailModal` — modal opens when the user taps a day on the chart, showing current observation data (Sprint 2 item #9)
- Editing of past-day observations from `DayDetailModal` with pre-populated form and save flow (Sprint 2 item #10)
- `GET /api/observations/:id/versions` endpoint — returns ordered edit history for a single observation (Sprint 2 item #11)
- Collapsible "Histórico de edições" section in `DayDetailModal` using the new versions endpoint (Sprint 2 item #11)
- `useObservationVersions` hook — fetches version history with loading and error states (Sprint 2 item #11)

### Fixed

- `detectConflict` now correctly compares the client-supplied `client_vector_clock` against the stored clock, resolving CODE-001 false-negative conflict detection
- `PATCH /api/observations/:id` schema now accepts `client_vector_clock` (optional, backward-compatible), resolving ARCH-001
- Vercel deployment no longer fails due to stale `VERCEL_ORG_ID` secret — blocker from Sprint 1 resolved
- ESM module resolution error (`ERR_MODULE_NOT_FOUND`) in API serverless functions corrected via `api/package.json`
- Vercel CLI deploy step no longer passes invalid `--scope` flag; org is resolved via `VERCEL_ORG_ID` env var
- SPA base path set to `/` in Vite config — eliminates blank page on Vercel production deploy
- CI TruffleHog base-commit reference fixed for push-to-main events
- CI TypeScript `waitFor` module resolution fixed by adding `@testing-library/dom` as an explicit devDependency

### Security

- Rate limiting applied to all 6 API endpoints: 60 req/60 s on observation and cycle endpoints; 10 req/60 s on `/api/users/me` — resolves SEC-001
- SEC-003 risk documented: custom `role` claim in `user_metadata` is set server-side via Edge Function; client cannot escalate privileges. Formal audit tracked for Sprint 3.

### Changed

- GitHub Actions runtime upgraded from Node.js 22 to Node.js 24 across `billings-mob` and `billings-web` CI pipelines (required before 2026-06-02 deprecation)
- Coverage measurement now explicitly excludes Supabase client configuration files and the `AuthGate` React wrapper, which require integration/E2E testing rather than unit tests. Branch coverage: 85.93%.

---

## [1.1.0] — 2026-05-25

### Added

- Hono.js REST API deployed as Vercel Serverless Functions
- `GET /POST /api/observations` — list and create daily observations with vector clock
- `GET /PATCH /api/observations/:id` — fetch single observation and update with conflict detection (ADR-004)
- `GET /api/observations/versions/pending` — conflict queue for instructor review
- `PATCH /api/observations/versions/:id/resolve` — instructor-authority conflict resolution
- `GET /POST /PATCH /api/cycles` — full CRUD for Billings cycle records
- `POST /api/instructor-student-links` and `PATCH /api/instructor-student-links/:id` — link management between instructor and student
- `GET /api/users/me` — authenticated user profile endpoint
- Vector clock implementation (`incrementVectorClock`, `dominates`, `detectConflict`) in `api/_lib/vectorClock.ts`
- Audit log sanitization via `sanitizeForAuditLog()` — LGPD Art. 11 compliance
- RLS enforced via `createAuthenticatedClient(jwt)` on all user-facing routes (OWASP A01)
- Zod validation with `.strict()` on all PATCH schemas (OWASP A03)
- 149 unit and integration tests — statements 92%, branches 80%, functions 89%, lines 92%

### Security

- `relations` and `notes` fields never written to `audit_log` table (`sanitizeForAuditLog` enforced)
- Error responses sanitized to remove LGPD-sensitive field names
- `createServiceClient()` (service role) used exclusively for append-only `audit_log` writes

---

## [1.0.0] — 2026-05-24

### Added

- React 18 + Vite 5 + TypeScript 5.6 project scaffold
- Tailwind CSS integration
- Supabase project (`gcwxwrjzbbqkuzcweyut`, `sa-east-1`) with initial schema migration
- Auth magic-link (email) enabled in Supabase
- Vercel projects configured for `billings-mob` (PWA) and `billings-web` (dashboard)
- 5-job CI pipeline: lint, typecheck, test, security (TruffleHog v3.82.6 + npm audit MODERATE), build
- Branch protection on `main`
- TypeScript `strict: true` (ADR-002)
