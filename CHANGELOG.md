# Changelog

All notable changes to billings-mob are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [1.4.4] - 2026-06-05

### Changed
- README reescrito em Português-BR correto: acentos e cedilhas restaurados em todo o documento, badge de versão atualizado para v1.4.3 (#28)

### Added
- `docs/sprint6.7-review-report.md`: relatório consolidado de 4 code reviews da Sprint 6.7 — Clean Code, DDD, Clean Architecture e Anti-Hacking — com achados categorizados por severidade e planos de ação (#28)

---

## [1.4.3] - 2026-06-04

### Changed
- Design System Wise-inspired aplicado em 100% dos componentes: DayDetailModal, App.jsx (todas as abas), AuthGate, LinkInstructorPage, NotificationPreferencesPage
- 8 novos tokens semânticos: primaryLight/Border, successLight/Border, warningLight/Border, errorLight/Border

### Fixed
- SELECT * eliminado em api/observations/[id].ts, api/cycles/index.ts, api/observations/versions/index.ts — resolve DT-006
- DayDetailModal: role="dialog", aria-modal, aria-labelledby, focus trap, Escape handler — WCAG 2.1 AA
- App.jsx: role="navigation", role="tablist", aria-selected nos botões de aba — WCAG 2.1 AA

### Security
- Restrição clínica: removida classificação "Fase Fértil" do phaseMap — label neutro "Muco" via fallback (decisão Tech Lead 2026-06-04)

---

## [1.4.2] — 2026-06-04

### Fixed

- Aba Gráfico em `App.jsx` (linhas 404–569): todos os tokens de cor legados `C.*` substituídos pelos equivalentes `DS.*` do Design System Wise-inspired, completando a migração iniciada na v1.4.1
- Cards de estatísticas agora usam fundo branco com sombra (`DS.surface` + `DS.shadowCard`) em vez de bege creme (`C.card`), alinhando-se ao restante do layout
- Botão "Exportar PDF" atualizado para `DS.primary` (navy `#37517E`) com texto branco (`DS.surface`), eliminando o marrom/bordô antigo (`C.terra`)
- Card "Ápice" atualizado para tint âmbar `#FEF3C7` (anteriormente salmon `C.terraLight`), melhorando a distinção visual do evento
- Seletor de ciclo: indicador de tab ativo migrado de `C.terra` para sublinhado `DS.primary` (navy), mantendo consistência com os demais controles de navegação
- Header, legenda, linhas de gráfico (Muco/Sangramento) e lista recente: tokens `C.textSec`, `C.amber`, `C.rose`, `C.textMuted` substituídos pelos equivalentes `DS.*`

---

## [1.4.1] — 2026-06-04

### Changed

- Design system Wise-inspired aplicado ao PWA: paleta navy (`#1B2B4B`), teal (`#2BBFBF`) e cinza (`#F0F4F8`) definida no objeto `DS` em `src/constants.js` como fonte única de tokens de cor, tipografia e espaçamento
- `DayDetailModal` redesenhado: overlay navy semitransparente, chips de stamp coloridos por categoria, botões de ação com estilos primário/secundário alinhados ao `DS`
- Calendário em `App.jsx`: chip teal para o dia atual, chip navy para dias com registro, chip cinza para dias sem registro; botão FAB estilizado com tokens do `DS`
- Tela de login em `AuthGate.tsx`: cores e estilos de input/botão atualizados para refletir a paleta do design system

---

## [1.4.0] — 2026-06-02

### Added

- Sentry React SDK (`@sentry/react`) integrado em `src/main.jsx` — captura de erros no PWA com `lgpdBeforeSend` e `lgpdBeforeBreadcrumb` que removem campos clínicos e de identificação pessoal antes de qualquer transmissão ao Sentry
- Sentry Node SDK (`@sentry/node`) integrado em `api/_lib/errorHandler.ts` — captura de exceções da API Hono.js com a mesma política LGPD de `beforeSend`
- `@sentry/vite-plugin` adicionado em `vite.config.js` para geração de source maps em builds de CI (ativado condicionalmente via `SENTRY_AUTH_TOKEN`); entry `*.map` adicionada ao `.gitignore` como medida de segurança
- Placeholders `VITE_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` adicionados ao `.env.example`; consulte `docs/runbooks/sentry-setup.md` para instruções de ativação no Vercel

### Security

- NC-02 ISO 27001:2022 (Não-Conformidade MAIOR): lacuna de monitoramento em produção resolvida — rastreamento de erros via Sentry agora disponível no PWA billings-mob e na camada de API Hono.js; campos `notes`, `observacao_descricao`, `fcm_token` e padrões de e-mail são redactados pelo scrubber LGPD antes de qualquer envio ao Sentry

---

## [1.3.8] — 2026-06-01

### Added

- Campo `observacao_descricao` (texto livre, até 500 caracteres) no `DayDetailModal` exibido exclusivamente para o stamp de sangramento, permitindo que a mulher descreva livremente o que observa (data-testid `observacao-descricao`)
- Migration `20260601000002_add_observacao_descricao.sql`: coluna `observacao_descricao text` (nullable) adicionada à tabela `observations`; campo incluído nos schemas Zod `CreateObservationSchema` e `PatchObservationSchema`
- 14 cenários Playwright E2E em `e2e/day-detail-modal-combinations.spec.ts` cobrindo combinações de sensação + tipo de muco + campo de descrição livre por stamp (grupos A: seco/muco/ápice; B: sangramento; C: ápice com lubrificante+transparente)

---

## [1.3.7] — 2026-06-01

### Fixed

- PWA: registrar `onNeedRefresh` no Service Worker para recarregar automaticamente a página ao receber novo deploy — usuárias agora recebem atualizações sem precisar fazer hard refresh manual (#22)

---

## [1.3.6] — 2026-06-01

### Fixed

- `DayDetailModal`: opção "Sem muco" explícita adicionada na seção Tipo de muco para que a mulher possa indicar deliberadamente ausência de secreção — 7 novos testes TDD cobrem: renderização da pill, seleção, toggle (desseleção), ocultação em stamps de sangramento, limpeza ao trocar de stamp, estado padrão e snapshot (#21)

---

## [1.3.5] — 2026-06-01

### Added

- `sensacao` field on the `observations` table — values: `seca`, `molhada`, `lubrificante`. Full-stack: SQL migration (`20260601000001_add_sensacao_tipo_observacao.sql`), Zod `SensacaoValues` enum, API `GET /api/observations`, `POST /api/observations`, and `PATCH /api/observations/:id` handlers persist and return the field, `ObservationData` interface updated in `useObservationSync` and `useObservationVersions` hooks, `DayDetailModal` renders the Sensação section for all observation stamps
- `tipo_observacao` field on the `observations` table — values: `sangue`, `manchas`, `outro`. Full-stack: same migration, Zod `TipoObservacaoValues` enum, API handlers updated, `DayDetailModal` renders "O que você observa" for bleeding stamps and "Tipo de muco" for non-bleeding stamps
- `SENSACAO` and `TIPO_OBSERVACAO` constants in `src/constants.js`

### Changed

- `MUCUS` constant descriptions updated to clinically precise language aligned with the Billings Ovulation Method — neutral terminology replaces prior imprecise descriptions

---

## [1.3.4] — 2026-06-01

### Added
- CodeQL SAST workflow (`.github/workflows/codeql.yml`) — javascript-typescript, security-extended queries, weekly schedule
- Playwright E2E test suite: 12 golden-path scenarios across 4 spec files (auth, observation, link-instructor, notification-preferences)

### Security
- **SEC-003 (CVSS 8.8 → 0.0):** `requireAuth` middleware now reads role from `user_profiles` (PostgreSQL, RLS-protected) instead of `user_metadata` (client-settable JWT claim)
- Migration `20260531000010_on_signup_create_profile.sql`: `handle_new_user()` SECURITY DEFINER trigger assigns `role='student'` to every new `auth.users` row
- 10 test files updated to use table-aware Supabase mock pattern (user_profiles + domain table)

### Fixed
- CI TypeCheck: `auth.test.ts` mock explicit return type annotation (TS2322)
- CI Lint: `e2e/**` added to ESLint global ignores (Playwright specs parsed without TypeScript parser)

---

## [1.3.3] — 2026-05-31

### Fixed

- `AuthGate`: email input now has an associated `<label>` — screen readers announce the field correctly (C-01)
- `AuthGate`, `LinkInstructorPage`: CSS spinner animation now respects `prefers-reduced-motion: reduce` — animation is suppressed for users who disable motion (C-02)
- All PWA inputs now show a visible 2 px focus ring on keyboard focus — `outline: none` removed, resolving WCAG 2.4.7 violation (C-03)
- `Toggle` component `aria-labelledby` now resolves correctly — label `<div>` receives the matching `id` so screen readers announce the switch label (C-05)
- Corrected missing Portuguese accents in UI text: "Método de Ovulação", "necessária", "já fez" (N-05)
- Loading spinner and error banner now carry `role="status"` / `aria-live="polite"` — dynamic state changes announced to assistive technology (W-07)

---

## [1.3.2] — 2026-05-31

### Fixed

- WhatsApp webhook endpoint now correctly exports named `GET` and `POST` handlers via `hono/vercel` — Vercel's Node.js runtime requires explicit named exports; without them the `/api/webhooks/whatsapp` route returned 404, causing Meta's hub-challenge verification to fail (e972cc0)

---

## [1.3.1] — 2026-05-29

### Added

- Real WhatsApp Cloud Adapter replacing the prior stub — integrates with Meta Graph API v19.0 to send template messages; graceful degradation active while Meta Business template approval is pending (ADR-011, S4-03b)
- `buildWhatsAppTemplate()` pure function mapping all 4 notification event types (`new_observation`, `conflict_created`, `link_request`, `link_accepted`) to approved template names and parameter lists — payloads contain no clinical data (LGPD Art. 11)
- WhatsApp webhook endpoint (`GET /api/webhooks/whatsapp`) — handles Meta hub challenge verification handshake and `POST` delivery receipt acknowledgement
- `vercel.json` rewrite rule for `/api/webhooks/whatsapp` serverless route

### Changed

- `WhatsAppMessage` interface extended with `templateName` and `templateParams` fields (ADR-011 contract update)
- `NotificationService.sendMessage()` now forwards template fields on every call, enabling the Cloud Adapter to resolve the correct Meta template payload
- Test suite expanded from 444 to 482 tests; statement coverage 97.28 %, branch coverage 89.19 %, function coverage 95 %

---

## [1.3.0] — 2026-05-29

### Added

- WhatsApp hexagonal architecture: `WhatsAppPort` interface, fully functional `MockAdapter` for development and testing, `CloudAdapter` stub (pending Meta Business approval), and env-based factory singleton — ADR-011 (S4-03)
- `NotificationService` with WhatsApp dispatch — triggers notifications on new observation creation, conflict detection, and instructor-link requests; message payloads contain no clinical data (LGPD Art. 11 compliance) — ADR-012 (S4-04)
- Instructor link request page in PWA — student can search for an instructor and submit a link request (S4-05)
- `GET /api/instructor-student-links/pending` endpoint — returns pending link requests for the authenticated instructor (S4-06)
- Push notification preferences page — student can enable/disable FCM-based push notifications per category; `GET /PUT /api/users/push-preferences` endpoints; `usePushNotifications` hook (S4-07)
- Sprint 4 schema migrations: `push_preferences`, `notification_rate_limits`, and `whatsapp_webhook_config` tables (S4-DB)

### Fixed

- FCM token no longer written to `console.log`, preventing accidental exposure of a user credential — SEC4-01
- Instructor ownership now explicitly verified on the link-accept path, preventing unauthorized acceptance — SEC4-02
- `daily_reminder_enabled` default value aligned between the database migration and application code, eliminating a silent divergence — SEC4-03

### Security

- FCM token leak via server logs closed (SEC4-01)
- Broken object-level authorization on link-accept endpoint patched — instructor can only accept requests addressed to their own account (SEC4-02)

### Changed

- Test suite expanded from 375 to 444 tests; branch coverage 89.53 %, function coverage 94.69 %, statement coverage 97.29 %, line coverage 98.05 % — all thresholds ≥ 80 % (S4-09)

---

## [1.2.1] — 2026-05-27

### Added

- 22 unit tests for `useObservationSync` hook covering: session guard, offline guard, PATCH with `client_vector_clock`, `Authorization` header, 409 conflict detection, `conflict_version_id` extraction, `loading`/`error` states, POST for new observations, network-error handling, and `syncStatus` state-machine transitions (Sprint 3 item #1 — débito Sprint 2)
- `vitest.config.ts` now includes `useObservationSync` in coverage — hook is no longer excluded from the coverage threshold

### Fixed

- ESLint `no-undef` error on `RequestInit` in test file replaced with `NonNullable<Parameters<typeof fetch>[1]>`, removing dependency on a global type not declared in the jsdom environment
- TypeScript strict-mode error TS18048 (`init` possibly `undefined`) resolved by narrowing the mock-call type to the non-nullable form of the fetch options parameter
- Unused variable `statusHistory` removed from the state-machine test, resolving TS6133 and the corresponding `@typescript-eslint/no-unused-vars` lint error

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
