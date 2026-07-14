# Alpha Gate Checklist

**Version:** v1 (2026-07-14), Sprint 6 exit item per Sprint Plan v3.
**Purpose:** the sign-off gate for Alpha 1 launch. Every row is a
hard requirement; every row links to file:line evidence or a
regenerable artifact. This doc is what an examiner or diligence
reviewer reads to confirm the "top 0.01%" claim in the plan is
checkable, not aspirational.

Sign-offs at the bottom.

---

## 1. No per-trade affordance anywhere

The advisory boundary. Not a stylistic preference — it's the wall
between "internet adviser under Rule 203A-2(e)" and "trading
platform".

| Requirement                                                                    | Evidence                                                                                                                                                                               |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No route accepts a per-trade `accept` / `approve` / `submit` verb              | `apps/web/src/lib/sec203a/actions.ts:25-45` (InvestorActions allowlist); `scripts/contract-assertions.ts` "Forbidden investor actions are not in InvestorActions" enforces every merge |
| No component renders a per-trade confirmation button                           | `scripts/tripwire-investor-boundary.ts` blocklist scans every source file; a per-trade phrase (`approve trade`, `accept and execute`, `override guardrail`, etc.) fails CI             |
| InvestorAccountActionVerb is exactly the Contract V3 §13.3 allowlist (6 verbs) | `scripts/contract-assertions.ts` "InvestorAccountActionVerb is restricted to the Contract V3 §13.3 allowlist"                                                                          |
| E2E proof: automation surface never renders an Accept control                  | `apps/web/e2e/automation-center.spec.ts`                                                                                                                                               |

## 2. Cross-account isolation proven

The most-severe threat class per the threat model (§2, §3). Two
independent defences must both hold.

| Requirement                                                                                           | Evidence                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BFF-layer scope check: `admin-portal-proxy/acl.ts:enforceAccountScope()` runs before every proxy call | `apps/web/src/lib/admin-portal-proxy/acl.ts`                                                                                                                           |
| Proxy transport forwards auth-derived `x-investor-account-id`, never caller-supplied                  | `apps/web/src/lib/admin-portal-proxy/client.ts:180-190`                                                                                                                |
| E2E: spoofed `x-investor-account-id` cannot escalate scope                                            | `apps/web/e2e/admin-portal-proxy.spec.ts` "spoofed x-investor-account-id header cannot escalate scope"                                                                 |
| Property-based fuzz: admin fields injected into every endpoint fixture; zero survive                  | `scripts/proxy-redaction-fuzz.ts` (15 endpoint modules)                                                                                                                |
| SSE bridge drops cross-account events at the transport seam                                           | `apps/web/src/lib/admin-portal-proxy/endpoints/stream.ts:parseSseDataLine()`; `contract-assertions.ts` "SSE bridge drops events for other accounts, keeps own account" |

## 3. Auth fails closed in production configuration

| Requirement                                                                 | Evidence                                                                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Invalid or forged token → 401, never dev-fallback                           | `apps/web/src/lib/bff/auth.ts:36-63`; `apps/web/e2e/auth.spec.ts` "forged token is rejected"                          |
| Prod-vs-dev gate uses server-only `REFI_ENV`, not `NEXT_PUBLIC_REFI_ENV`    | `apps/web/src/lib/config/env.ts:72-77` (server-only twin comment); enforced at boot by Zod schema                     |
| JWT algorithm pinned; iss/aud enforced; exp checked with 5s clock tolerance | `apps/web/src/lib/bff/auth.ts` (jose `jwtVerify` with pinned alg + iss + aud); Sprint 1 hardening commit `607d590`    |
| Session secret in Secret Manager (prototype-only defaults documented)       | `apps/web/src/lib/config/env.ts:22-39` `PROTOTYPE_DEFAULTS` clearly marked; prod `REFI_ENV=prod` rejects the defaults |
| CSRF middleware rejects cross-origin mutations                              | `apps/web/src/lib/bff/csrf.ts`; `apps/web/e2e/csrf.spec.ts`                                                           |

## 4. Feature flags accounted for, all with owners

Every dark surface has a flag; every flag has a kill-switch procedure
in the IR runbook.

| Flag                            | Default | Owner     | Kill-switch procedure                  |
| ------------------------------- | ------- | --------- | -------------------------------------- |
| `FLAG_ADMIN_PROXY_*` (14)       | off     | proxy     | `docs/incident-response-runbook.md` §2 |
| `FLAG_ADMIN_PROXY_STREAM`       | off     | proxy     | ibid                                   |
| `FLAG_ALPHA_APPLICATION_ROUTE`  | off     | funnel    | ibid                                   |
| `FLAG_ALPHA_CLAIM_ROUTE`        | off     | funnel    | ibid                                   |
| `FLAG_ACCOUNT_CONTROLS_CENTER`  | off     | surface-4 | ibid                                   |
| `FLAG_ACCOUNT_PREFS_PATCH`      | off     | surface-4 | ibid                                   |
| `FLAG_RECORDS_CENTER_SPINE`     | off     | records   | ibid                                   |
| `FLAG_EXCEPTION_REVIEW_REFRAME` | off     | surface-7 | ibid                                   |

Source: `apps/web/src/lib/feature-flags/index.ts` (typed module, deny
by default, server-only resolution).

## 5. Records retention verified on the durable driver

Compliance-relevant records must survive redeploys — Rule 204-2
obligation the day the ADV files.

| Requirement                                                                                                                                                       | Evidence                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Durable-driver decision documented                                                                                                                                | `docs/phase2-6-bff-durable-store-decision.md`                                                         |
| Entities migrated to durable per S3: session, auth-link, activation-idempotency, receipt, record-access-log, consents, subscription-mode, managed-execution-state | `apps/web/src/lib/config/backing.ts:25-38`; ENTITY_MATRIX enforces valid modes                        |
| Firestore driver in place with atomic put-if-absent (idempotency semantics)                                                                                       | `apps/web/src/lib/durable-store/store.ts`                                                             |
| RecordAccessLog completeness assertion covers all records/documents/activity read routes                                                                          | `scripts/contract-assertions.ts` "Every records/documents read route uses bffReadWithAccessLog (S4c)" |
| Every mutation emits an InvestorActionReceipt                                                                                                                     | `apps/web/src/lib/bff/handler.ts` `bffMutate`                                                         |

## 6. Incident response runbook reviewed

| Requirement                                                                     | Evidence                            |
| ------------------------------------------------------------------------------- | ----------------------------------- |
| Threat model exists with STRIDE per surface                                     | `docs/security-threat-model.md`     |
| IR runbook exists with notification tree, kill-switches, per-severity timeboxes | `docs/incident-response-runbook.md` |
| Runbook reviewed within the last quarter                                        | (sign-off at bottom of this doc)    |

## 7. Rate limiting active

| Requirement                                                                            | Evidence                                                         |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Token-bucket per-class, per-key limits wired                                           | `apps/web/src/lib/bff/rate-limit.ts`                             |
| Contract assertion: capacity boundary + class/key isolation + stream tighter than read | `scripts/contract-assertions.ts` three "Rate limiter …" sections |
| Wired into `bffMutate`, SSE stream, alpha-application, alpha-claim                     | commit `5f903be`                                                 |

## 8. Evidence bundle regenerable from CI artifacts

| Requirement                                                       | Evidence                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm evidence-bundle` produces a dated, hashed bundle            | `scripts/assemble-evidence-bundle.ts`                         |
| Bundle runs all 8 gates fresh + snapshots schemas + docs + commit | `artifacts/evidence-bundle/<date>-<sha>/bundle-manifest.json` |
| Exit non-zero on any gate failure                                 | `assemble-evidence-bundle.ts:main()`                          |

## 9. Contract enforcement is bidirectional

| Requirement                                                           | Evidence                                                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Our CI validates our consumption (strict schemas + fuzz)              | `scripts/proxy-redaction-fuzz.ts`                                                                    |
| Contract V3 JSON Schemas published as CI artifact for Daniel's D7 job | `pnpm export-schemas` → `artifacts/contract-schemas/v3/manifest.json` (16 schemas + sha256 per file) |
| D7 status                                                             | **Open** — awaiting Daniel to wire the schemas into refinity-main GitLab CI                          |
| Integration scoreboard tracks per-endpoint live status                | `README.md` "Admin Portal integration scoreboard"                                                    |

## 10. Marketing Rule readiness (F-track)

| Requirement                                                                                                                   | Evidence                                                         |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Copy-compliance pass complete: regime-detection language, no crypto keyword salad, backtest framing on performance references | Sprint 1 F-track commits                                         |
| Alpha application entity captures §2.4 game fields as nullable so `/alpha-claim` is additive                                  | `apps/web/src/lib/prototype-store/entities/alpha-application.ts` |
| Verifiable-by-design page linking CI badges, tripwire, boundary docs                                                          | **Open** — Sprint 6 F-track item                                 |

---

## Blocking gaps

Items that must land before an Alpha 1 sign-off. Every gap is either
on our side or a named Daniel dependency.

| Gap                                                  | Owner  | Status                                            |
| ---------------------------------------------------- | ------ | ------------------------------------------------- |
| Session revocation list (S1 residual)                | us     | **open**, Sprint 6 hardening                      |
| D4: staging Admin Portal URL + service auth          | Daniel | **open**                                          |
| D5: parity sample payloads                           | Daniel | **open**                                          |
| D6: canonical AccountPrefs writer in `apps/common`   | Daniel | **open**, blocks live PATCH                       |
| D7: schema-validation job in refinity-main CI        | Daniel | **open**, blocks bidirectional enforcement        |
| Verifiable-by-design public page                     | us     | **open**, F-track Sprint 6                        |
| Distributed rate-limit tightener (Firestore counter) | us     | **open** if per-instance ceiling proves too loose |

An Alpha 1 signal-mode launch (10–25 invited users, read-only
recommendations) does **not** require D3 (`reduce_only` mapping — that
blocks Alpha 2 managed-paper) or the broker path. Signal-mode uses
zero broker connectivity by design.

---

## Sign-offs

| Role               | Name         | Date | Signature |
| ------------------ | ------------ | ---- | --------- |
| Engineering owner  | Zeshan Ahmad |      |           |
| Backend            | Daniel       |      |           |
| Outside counsel    |              |      |           |
| Compliance advisor |              |      |           |

Sign-offs are collected against the evidence bundle at
`artifacts/evidence-bundle/<yyyymmdd>-<shortsha>/`; the bundle sha256
manifest is what each signature commits to.
