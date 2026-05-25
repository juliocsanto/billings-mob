# CI/CD Security Policy — Billings Grafico
# Owner: CISO | Last updated: 2026-05-24 | Version: 1.0

## 1. Required CI Scans

| Scan | Tool | What it catches | Fail condition | Sprint |
|---|---|---|---|---|
| Dependency audit | npm audit | Known CVEs in npm deps (OWASP A06) | HIGH or CRITICAL | Now (Sprint 0) |
| Secret scanning | TruffleHog | API keys, tokens, credentials in git history (OWASP A05) | Any verified OR unverified match | Now (Sprint 0) |
| SAST | CodeQL (github/codeql-action) | Injection, broken access, prototype pollution (OWASP A01/A03) | Any result level: error | Sprint 5 |
| SBOM generation | anchore/sbom-action | Component inventory for DPA audit evidence | Never fails CI; artifact saved | Sprint 5 |
| License check | licensee or license-checker | Copyleft licenses (GPL/AGPL) in production deps | GPL/AGPL in non-dev dep | Sprint 5 |

## 2. Vulnerability SLA

| Severity | CVSS | Pipeline action | Fix deadline | Notify |
|---|---|---|---|---|
| Critical | >= 9.0 | Block merge immediately | < 4 hours, hotfix to main | Both team members |
| High | >= 7.0 | Block merge | < 24 hours | Both team members |
| Medium | >= 4.0 | Warning annotation on PR, does not block | < 72 hours (next sprint) | Assignee only |
| Low | < 4.0 | Log only, no annotation | Current quarter backlog | No alert |

`npm audit --audit-level=high` correctly implements Critical/High blocking.
Medium findings: add `npm audit --audit-level=moderate 2>&1 | tee audit-moderate.txt` as a non-failing step
with `continue-on-error: true` and upload the artifact.

## 3. Secret Scanning Policy

**What counts as a secret (must never be committed):**
- Supabase `service_role` key (starts with `eyJ`, has elevated privileges)
- Supabase `anon` key (public but must not be hardcoded — use VITE_ env vars)
- `ANTHROPIC_API_KEY`
- `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
- `JWT_SECRET`
- `VERCEL_TOKEN`
- Any string matching pattern `sk-`, `eyJ` longer than 40 chars, or `-----BEGIN`

**TruffleHog configuration (required fix):**
```yaml
- uses: trufflesecurity/trufflehog@v3.82.6   # pin to exact version, not @main
  with:
    path: ./
    base: ${{ github.event.repository.default_branch }}
    head: HEAD
    extra_args: --results=verified,unverified  # REMOVE --only-verified
```
Rationale: `--only-verified` silently passes secrets whose provider API is unreachable at scan time
(Anthropic, Supabase). All matches must be reviewed.

**When a secret is found:**
1. Pipeline fails immediately — do not merge.
2. Rotate the secret in Vercel env vars and Supabase vault within 15 minutes.
3. Assume the secret is compromised from the moment of the first commit that introduced it.
4. Open a Critical GitHub issue: `[SECURITY] Secret exposed in git history — <key type>`.
5. If the key had production access: execute the LGPD Incident Response Runbook (§7).
6. After rotation: git history rewrite with `git filter-repo` + force-push (coordinate between both team members).

## 4. Dependency Audit Policy

| Level | `npm audit` flag | CI behavior |
|---|---|---|
| HIGH + CRITICAL | `--audit-level=high` | Fails the `security` job — blocks merge |
| MODERATE | `--audit-level=moderate` with `continue-on-error: true` | Warning annotation only — does not block |
| LOW | Not checked in CI | Handled in quarterly dependency review |

**Exception process:** If a HIGH/CRITICAL vuln has no fix available:
1. Open a GitHub issue tagged `security/exception`.
2. Document: CVE ID, CVSS score, affected package, exploitability in context, mitigating controls.
3. CISO approves in writing (issue comment) with a fix deadline.
4. Add the CVE to `.nsprc` or `audit-ci.json` with a mandatory expiry date.
Exceptions older than 30 days without a fix = automatic merge block reinstated.

## 5. Missing Controls — Priority and Owner

| Control | Why required | Priority | Owner |
|---|---|---|---|
| Pin TruffleHog to SHA/version tag | Supply chain integrity | Sprint 0 (now) | DevOps |
| Remove `--only-verified` from TruffleHog | Unverified secrets pass silently today | Sprint 0 (now) | DevOps |
| MODERATE audit warnings surfaced | Visibility into accumulating CVE debt | Sprint 0 (now) | DevOps |
| Post-build secret grep in `dist/` | Catch secrets baked into build output | Sprint 0 (now) | DevOps |
| CodeQL SAST | Injection, access control, prototype pollution | Sprint 5 | DevOps |
| Log scrubbing CI check | `relations` and `notes` fields must never appear in logs (LGPD) | Sprint 5 | Backend Dev |
| SBOM generation (anchore/sbom-action) | DPA audit evidence for ANPD/LGPD | Sprint 5 | DevOps |
| License scanning (license-checker) | Copyleft GPL risk in commercial SaaS | Sprint 5 | DevOps |

## 6. LGPD-Specific CI Requirements

**Enforced now (Sprint 0):**
- CI must never print, echo, or log the contents of any env var containing `KEY`, `SECRET`, `TOKEN`.
  GitHub Actions masks secrets automatically — verify with `echo "::add-mask::$SECRET"` in setup steps.
- Build artifacts (`dist/`) must not contain any hardcoded string matching the secret patterns in §3.
  Post-build check: `grep -rE "(ANTHROPIC|service_role|JWT_SECRET|WHATSAPP_API_TOKEN)" dist/ && exit 1 || true`

**Enforced in Sprint 5:**
- Log scrubbing: integration test asserting no API response or structured log entry contains
  the literal field names `relations` or `notes` with values populated.
- `DELETE /users/:id` cascade test: assert ALL rows removed from `observations`,
  `observation_versions`, `audit_log`, `cycles` for the deleted user (LGPD Art. 18).
- DPA coverage check: any PR adding a `fetch()` call to a new external domain requires
  a DPA entry in `docs/dpa-inventory.md`.

**Data processor DPA status (must be resolved before production):**

| Processor | DPA status |
|---|---|
| Vercel | Must obtain — SCCs apply (US servers) |
| Supabase | Must obtain — sa-east-1 (data in Brazil, favorable) |
| Meta (WhatsApp Cloud API) | Meta DPA available — must be signed |
| Sentry | Must obtain — configure PII scrubbing before enabling |
| Anthropic | Must obtain — assess LGPD Art. 33 international transfer |
| Google/Firebase (FCM) | Must obtain — no clinical data transmitted, lower risk |
| Asaas (Sprint 7+) | Brazilian company, LGPD-native — obtain before Sprint 7 |

## 7. Incident Response — 2-Person Team Runbook

**Roles:**
- Incident Commander: Julio (juliocsanto3@gmail.com) — triage, communication, ANPD notification
- Responder: second team member — technical remediation

**Severity classification:**
- P1 (data breach involving `relations` or health data): ANPD notification within 72h (LGPD Art. 48)
- P1 (auth bypass or RLS failure): treat as data breach
- P2 (secret exposed in git): rotate within 15 min, evaluate P1 escalation
- P3 (HIGH vuln found, no breach): fix within 24h per SLA

**P1 runbook:**
1. T+0: Incident Commander declares P1, opens GitHub issue `[INCIDENT] P1 — <description>`
2. T+0–15m: Responder disables affected endpoint (Vercel: set `FEATURE_FLAG_DISABLED=true` or redeploy)
3. T+15–30m: Incident Commander identifies affected users via Supabase query on `audit_log`
4. T+30m–2h: Responder patches and deploys hotfix
5. T+2–24h: Incident Commander drafts ANPD notification (if health data involved)
6. T+72h: ANPD notification submitted if P1 confirmed (LGPD Art. 48 deadline)
7. T+1 week: Post-mortem in `docs/runbooks/postmortems/YYYY-MM-DD.md`
