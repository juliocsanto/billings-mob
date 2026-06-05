# Billings Grafico — Student PWA

[![CI](https://github.com/juliocsanto/billings-mob/actions/workflows/ci.yml/badge.svg)](https://github.com/juliocsanto/billings-mob/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/cobertura-%3E80%25-brightgreen)](https://github.com/juliocsanto/billings-mob/actions)
[![Version](https://img.shields.io/badge/versao-1.4.3-blue)](CHANGELOG.md)
[![Sentry](https://img.shields.io/badge/monitored%20by-Sentry-362D59?logo=sentry)](https://sentry.io)

Progressive Web App for students of the **Billings Ovulation Method (BOM)**.
Production: **https://billings-mob.vercel.app**

---

## What is the Billings Method

The Billings Ovulation Method is a methodology for understanding the female cycle based on
the daily observation of cervical mucus, bodily sensation, and other biological signs. The student
records what she perceives each day; her certified CENPLAFAM/WOOMB instructor analyzes that
history and guides the student based on established clinical patterns. The system does not
perform automatic classifications: all clinical interpretation is the exclusive responsibility
of the instructor.

---

## Who this application is for

| Profile | Role |
|---|---|
| BOM Student | Records daily cycle observations from a mobile device |
| CENPLAFAM/WOOMB Instructor | Monitors students via the web dashboard (billings-web) |
| Developer | Read the "How to run locally" section below |

---

## Main features

**Daily Record**
The student records, for each day of the Cycle, the Stamp (mucus category), the type of mucus
observed, the bodily sensation, the presence of bleeding, and a free-text description.
The DayDetailModal displays the version history of each record, allowing past days to be
edited with full traceability.

**Offline-first**
The Service Worker (Workbox) queues requests locally when the device
has no connection. On reconnection, automatic sync sends the pending records to the
API using the vector clock to detect Version Conflicts before applying the changes.

**Synchronization via vector clock**
Each Daily Record carries a version vector (simplified CRDT). When the student
edits a record already modified by the instructor, the system detects the Version Conflict
and routes it to the instructor panel for resolution — without losing either version.

**Link with instructor**
The student searches for and requests a Link with her instructor directly from the app. The instructor
receives the request on the dashboard and accepts or rejects it. After the Link is established, the instructor
begins to view the student's records in real time.

**Push notifications**
The student configures notification preferences (new comments, daily reminders).
Notifications are sent via FCM with granular permission controls.

---

## Architecture

The repository contains two artifacts deployed in the same Vercel project: the student PWA
(directory `src/`, React 18 + Vite) and the serverless API (directory `api/`, Hono.js). The PWA
makes REST calls to the project's own API; the instructor dashboard (billings-web)
consumes the same API via `VITE_API_URL`.

```
+--------------------+    +--------------------+
|  Student (PWA)     |    | Instructor         |
|  React 18 + Vite   |    | billings-web       |
|  Workbox SW        |    | React 18 + Vite    |
+--------------------+    +--------------------+
         |                         |
         +----------+--------------+
                    |
         +----------+----------+
         | Vercel Serverless   |
         | API Hono.js /api/*  |
         | Rate limit + Auth   |
         +----------+----------+
                    |
         +----------+----------+
         | Supabase (sa-east-1)|
         | PostgreSQL + RLS    |
         | Auth + Realtime     |
         +---------------------+
```

**API structure:**

```
api/
  observations/      — Daily Records (POST, GET, PATCH)
  cycles/            — Cycles (POST, GET, PATCH)
  users/             — Profile + push preferences
  instructor-student-links/  — Student-instructor Link
  webhooks/          — WhatsApp webhook reception
  _lib/
    vectorClock.ts       — Pure domain: CRDT (zero dependencies)
    whatsapp/            — Port + Adapters (hexagonal architecture)
    notifications/       — NotificationService + factory
    auth.ts              — JWT middleware
    rateLimit.ts         — Sliding-window rate limiting
    sanitizeAuditData.ts — LGPD pre-log sanitization
```

Full architecture documentation: [`ARCHITECTURE.md`](ARCHITECTURE.md)

---

## API Endpoints

All endpoints require the `Authorization: Bearer <jwt>` header (Supabase JWT of the
authenticated student or instructor).

| Method | Path | Description |
|---|---|---|
| GET | /api/observations | Lists Daily Records for the authenticated student |
| POST | /api/observations | Creates a new Daily Record |
| GET | /api/observations/:id | Returns a Record by ID with version history |
| PATCH | /api/observations/:id | Updates a Record (vector clock + Conflict detection) |
| GET | /api/observations/versions/pending | Lists open Version Conflicts (instructor) |
| PATCH | /api/observations/versions/:id/resolve | Resolves a Version Conflict (instructor authority) |
| GET | /api/cycles | Lists the student's Cycles |
| POST | /api/cycles | Creates a new Cycle |
| PATCH | /api/cycles/:id | Updates a Cycle |
| GET | /api/users/me | Returns the authenticated user's profile |
| GET | /api/users/push-preferences | Returns push notification preferences |
| PUT | /api/users/push-preferences | Updates push notification preferences |
| POST | /api/instructor-student-links | Requests a student-instructor Link |
| PATCH | /api/instructor-student-links/:id | Accepts or revokes a Link |
| GET | /api/webhooks/whatsapp | Meta verification handshake |
| POST | /api/webhooks/whatsapp | WhatsApp message reception |

Full OpenAPI contract available in `ARCHITECTURE.md` section 6.

---

## How to run locally

### Prerequisites

- Node.js 24+
- npm
- Supabase account with a project created
- Vercel CLI: `npm install -g vercel`

### Installation

```bash
git clone https://github.com/juliocsanto/billings-mob.git
cd billings-mob
npm install
cd api && npm install && cd ..
```

### Environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your project values:

```
# Supabase — obtain at app.supabase.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# Sentry — Frontend (optional in development)
VITE_SENTRY_DSN=

# Sentry — serverless API (optional in development)
SENTRY_DSN=

# Sentry — source map upload (CI/production only)
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=billings-mob

# Redirect URL after magic link
VITE_AUTH_REDIRECT_URL=https://billings-mob.vercel.app
```

> Never commit `.env.local`. The `.gitignore` already protects this file.
> `SUPABASE_SERVICE_ROLE_KEY` is used only at runtime by the serverless API;
> configure it as an environment variable in the Vercel Dashboard, never in the frontend.

### Commands

```bash
npx vercel dev          # API + PWA at http://localhost:3000

npm run dev             # PWA only at http://localhost:5173
npm run build           # Production build
npm run typecheck       # TypeScript without emitting files
npm run lint            # ESLint PWA
npm run lint:api        # ESLint API (zero-warning gate)
npm test                # Vitest — all tests
npm run test:coverage   # Vitest with coverage report
npm run test:e2e        # Playwright E2E
```

---

## Security and compliance

- **LGPD:** The `relations` and `notes` fields never appear in audit logs.
  The `sanitizeForAuditLog()` function is enforced in all handlers before
  writing to `audit_log`.
- **RLS:** All reads and writes of user data go through the
  authenticated client (`createAuthenticatedClient(jwt)`). The service role is used
  exclusively for appending to `audit_log`.
- **Clinical restriction:** The `stamp` enum never contains the values `fertil`,
  `infertil`, `seguro`, or `inseguro`. Clinical classification is the exclusive
  responsibility of the certified instructor.
- **Validation:** Zod with `.strict()` on all API input schemas.

---

## Useful links

| Resource | URL |
|---|---|
| Production (PWA + API) | https://billings-mob.vercel.app |
| Instructor dashboard | https://billings-web.vercel.app |
| Supabase Dashboard | https://app.supabase.com/project/gcwxwrjzbbqkuzcweyut |
| Vercel Dashboard | https://vercel.com/juliocsanto/billings-mob |
| Sentry | https://sentry.io |
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

---

## Related repositories

- **billings-web** (instructor dashboard): https://github.com/juliocsanto/billings-web

---

## Clinical Notice

Clinical cycle interpretation is the exclusive responsibility of the certified
CENPLAFAM/WOOMB instructor. This system does not replace professional monitoring
nor does it automatically classify any day as fertile, infertile, safe or unsafe.
