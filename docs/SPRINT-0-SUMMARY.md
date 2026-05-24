# Sprint 0 — Completion Summary

Date: 2026-05-24

## Summary

Sprint 0 established the full development infrastructure for both repositories
(billings-mob and billings-web): CI/CD pipelines with security scans, branch
protection, TypeScript strict mode, Vercel deploy workflows, Supabase migrations
directory, and GitHub project board. All automatable items were implemented by
the devops-engineer and ciso agents; several external service connections require
one-time manual action before Sprint 1 can begin.

---

## Automated Deliverables

| What | Agent | Status | ADR |
|---|---|---|---|
| billings-web repo scaffolded (React 18, Vite, TypeScript, TailwindCSS) | devops-engineer | Done | ADR-010 |
| GitHub Project "Billings Grafico" with 5 columns | devops-engineer | Done | ADR-008 |
| CI pipeline — 5 jobs: lint, typecheck, test, security, build | devops-engineer | Done | ADR-007 |
| Branch protection on billings-mob/main (5 jobs + 1 PR review) | devops-engineer | Done | ADR-007 |
| TypeScript 5.6 strict mode on billings-mob (allowJs bridge) | devops-engineer | Done | ADR-002 |
| Vercel deploy workflows in both repos (awaiting manual connection) | devops-engineer | Done | ADR-007 |
| develop branch created and pushed in both repos | devops-engineer | Done | ADR-007 |
| supabase/migrations/ directory created in billings-mob | devops-engineer | Done | ADR-003/004 |
| TruffleHog pinned v3.82.6, --results=verified,unverified | ciso | Done | security-policy-ci.md |
| MODERATE dependency audit (warning-only, artifact upload) | ciso | Done | security-policy-ci.md |
| Post-build secret pattern scan on dist/ (LGPD) | ciso | Done | security-policy-ci.md |
| CI/CD security policy saved at docs/security-policy-ci.md | ciso | Done | — |

---

## Manual Actions Required Before Sprint 1

| What | Why | Urgency |
|---|---|---|
| Vercel: connect both repos at vercel.com/new; set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL; add VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID as GitHub Secrets in both repos | Deploy workflows exist but cannot run without Vercel project IDs and token | Blocking Sprint 1 |
| Supabase: create project (region sa-east-1 Sao Paulo); enable Auth with magic link; run migration 20260524000001_initial_schema.sql | Backend API and RLS policies depend on this project existing | Blocking Sprint 1 |
| billings-web branch protection: requires GitHub Pro or make repo public | Private repo branch protection is a GitHub Pro feature; billings-web main is currently unprotected | High — set before first PR on billings-web |
| WhatsApp Cloud API: start Meta Business registration now | Approval takes 1-7 days; blocks Sprint 4 notification features (ADR-009) | Start now — not blocking Sprint 1 but blocks Sprint 4 |

---

## Sprint 1 Entry Criteria

Sprint 1 is unblocked when all of the following are true:

1. Both billings-mob and billings-web are connected to Vercel and a preview
   deploy succeeds on the develop branch.
2. GitHub Secrets VERCEL_TOKEN, VERCEL_ORG_ID, and VERCEL_PROJECT_ID are
   set in both repositories.
3. Supabase project exists in sa-east-1 and the initial migration has been
   applied successfully.
4. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set as Vercel environment
   variables in both projects.
5. CI pipeline (all 5 jobs) passes on billings-mob/develop.
6. Meta Business registration for WhatsApp Cloud API has been initiated
   (does not need to be approved — only started).
