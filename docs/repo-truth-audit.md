# Repo Truth Audit — Phase 0

**Date:** 2026-05-20
**Audit scope:** Both repositories that constitute the ReFi.Trading / ReFinity product surface.
**Method:** File-level inspection of both repos by exploration agents. Every claim is anchored to a file path. Unknowns are marked `UNKNOWN — searched: …`.

---

## 1. Two-Repo Architecture (confirmed)

| Repo                                        | Role                                                                                | Stack                                | Maturity                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `~/.../Daniels Back End/refinity-main-main` | Backend truth — trading pipeline, admin portal, Spanner contracts, Pub/Sub topology | 27 services, Python + Next.js admin  | Trading pipeline **mature**; IA / investor-facing layer **absent** |
| `~/.../refi-us-sec-ia` (this repo)          | Investor frontend for SEC Rule 203A‑2(e) Internet Adviser product                   | Next.js 16 / React 19 / pnpm + turbo | ~70% of investor surface scaffolded; BFF endpoints not implemented |

**Source-of-truth hierarchy holds:** Daniel's repo wins on contracts (DDL, fixtures, topics, lifecycle), this repo wins on investor UX surfaces. They are not fused — this repo currently has no live wire to Daniel's backend; it talks to MSW mocks shaped against `packages/api-clients/openapi/refi-api.yaml`.

---

## 2. Daniel's Backend — Confirmed Reality

### 2.1 Service inventory (`apps/*`)

**Mature (Python, Pub/Sub-driven):**
`portfolio-manager`, `portfolio-engine`, `account-intent-builder`, `risk-engine`, `exec-gateway`, `trade-manager`, `data-loader`, `inference-worker`, `trainer`, `training-scheduler`, `asset-initializer`, `parity-runner`, `common`.

**Mature UI/API:** `admin-portal` (Next.js static export frontend + FastAPI backend, 35 routers under `/api/v1/*`).

**Skeleton only — do not assume capability:** `auth-siwe`, `compliance-adapter`, `identity-ccid`, `explorer-api`, `routing-api`, `token-policy-api`, `audit-writer`, `anchor-job`, `merkle-builder`, `refin-indexer`, `pubsub-bus`, `node`.

This matters: SIWE, KYC (CCID), compliance verdicts, identity, and audit-writer **do not have real backends yet** even though the frontend has hooks shaped against them.

### 2.2 Execution lifecycle (canonical)

```
data-loader → dev-bars
inference-worker → dev-signals
portfolio-manager (signals → TemplateTargets, portfolio_actions_history) → dev-template.rebalance.intent
account-intent-builder → dev-account.intent.ready  [AccountIntents, AccountIntentHistory]
risk-engine → dev-risk.approved / dev-risk.rejected  [RiskSnapshots]
exec-gateway → dev-orders.cmd  [ExecutionPlans, Orders, OrderIdMap, TradeInputSnapshots]
trade-manager → dev-orders.evt, dev-audit.evt  [OrderEvents, BrokerOrderAttempts, BrokerInteractionsLog, Fills, Positions, PositionSnapshots]
admin-portal (consumer)  [AuditEvents, AdminInterventions, UiEventTimeline]
```

Source: `docs/architecture/trade_lifecycle_contract.md` (102 KB), `docs/architecture/spanner_ddl_all.txt`, `docs/architecture/topics_subs_dlqs.txt`.

### 2.3 Spanner schema highlights

- **127 tables.** Investor-facing relevant cores: `Users`, `Accounts`, `UserConsents`, `AccountConsents`, `AccountSettings`, `AccountPrefs`, `AccountSnapshots`, lifecycle tables listed above, plus audit (`AuditEvents`, `AdminInterventions`, `UiEventTimeline`).
- **`AccountSettings`** stores broker creds (SnapTrade + raw `api_key`/`api_secret`/`api_passphrase`) directly in Spanner. Secret Manager refs are partially modeled (`credential_ref_json`) but Trade Manager reads plaintext fields — flagged risk.
- **FLOAT64 precision risk** on `TemplateTargets.membership_weight`, `gross_target`, `net_target`, `leverage`, drift thresholds, turnover throttle, max single-asset weight, plus `Orders.limit_price`/`stop_price`/`avg_fill_price`, `Fills.price`/`qty`. Equities-priced fields tolerable; weights and thresholds should migrate to NUMERIC (gap registered).
- **Investor-profile schema is ABSENT.** `Users` has `user_id, email, status` only. No questionnaire, suitability, risk tolerance, time horizon, jurisdiction, tax status, KYC/KYB tables. `Accounts.status` is a simple flag — no `prospect → onboarding → active → paused → terminated → archived` lifecycle.

### 2.4 Admin Portal HTTP surface

35 routers under `apps/admin-portal/backend/api/router_registry.py`. Highlights relevant to investor frontend:

| Concern                          | Admin endpoint(s)                                                                                                        | Note                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Account CRUD + admin actions     | `GET /accounts`, `POST /accounts/{id}/admin-actions`, `POST /accounts/populate`, `DELETE /accounts/{id}`                 | `template.admin action=rebalance target_account_id=X` lives here. **Admin-only.** |
| Execution & order visibility     | `GET /execution/plans`, `/orders`, `/orders/blocked`, `/broker-interactions`                                             | Read models the investor BFF should project from.                                 |
| Risk                             | `GET /risk/intents`, `/risk/intents/{id}`, `POST /risk/simulate`                                                         | Source of RiskSnapshot projection.                                                |
| Portfolio                        | `GET /portfolio/actions`, `/portfolio/templates`, `/portfolio/memberships`, `/portfolio/rules`                           | Strategy/template metadata.                                                       |
| Trace                            | `GET /trace/{search_id}`, `GET /sagas/trace/{search_id}`                                                                 | Full advisory-chain lineage.                                                      |
| Interventions                    | `GET /interventions`                                                                                                     | Admin audit log.                                                                  |
| Operations (admin-only mutation) | `POST /operations/force-inference`, `force-training`, `cancel-order`, `trigger-rebalance`, `rollback`, `force-data-load` | **Must never leak into investor surface.**                                        |
| Settings & controls              | `GET/PUT /settings`, `PUT /settings/trading-controls/{scope}/{id}`                                                       | Includes kill-switch / reduce-only modes.                                         |
| Dashboard                        | `GET /dashboard/events`, `kpis`, `data-freshness`, `inference-status`                                                    | Operator view, not investor.                                                      |

Every mutation runs through `AdminInterventionsMiddleware` which captures `operator_id`, `action_type`, `target_aggregate_type/id`, `reason`, `payload_diff` into `AdminInterventions`.

### 2.5 Pub/Sub topology

Topics confirmed in `docs/architecture/topics_subs_dlqs.txt`: `dev-bars`, `dev-signals`, `dev-account.admin`, `dev-template.rebalance.intent`, `dev-account.intent.ready`, `dev-risk.approved`, `dev-risk.rejected`, `dev-orders.cmd`, `dev-orders.evt`, `dev-audit.evt`, `training-cmd`, `training.requested`, `models.evt`, `dev-template.admin`.

DLQ coverage is partial in documentation — most topics have DLQs but the cataloguing is incomplete. Gap registered.

### 2.6 IA-specific docs (Daniel's score)

From `docs/ops/ia_back_end_checklist.md` (as of 2026-05-04, weighted):

- Trading/Model Pipeline: **56.6%** done (28 full / 56 partial / 15 missing of 99 items)
- KYC/Compliance/Advisory Platform: **17.4%** done (7 full / 24 partial / 78 missing of 109 items)
- Combined: **36.1%**

The compliance/advisory side is where the work is. `docs/ops/ia_tech_compliance_summary.md` enumerates Rule 203A‑2(e) technical requirements; `docs/ops/ia_front_end_checklist.md` confirms the investor-facing layer is essentially not built on the backend side.

---

## 3. This Frontend Repo — Confirmed Reality

### 3.1 Stack & layout

- **Monorepo:** pnpm workspaces + turbo. Node ≥20, pnpm 11.1.2.
- **Apps:** `apps/web` only (Next.js 16, App Router, React 19).
- **Packages:** `api-clients` (OpenAPI + MSW + hooks), `ui` (Tailwind+CVA components), `config` (eslint/tailwind/tsconfig + blocked-terms dictionary).
- **CI:** `.github/workflows/ci.yml` runs typecheck → lint → OpenAPI validate → OpenAPI drift → retired-route scan → vitest → copy scan → build. Deploy workflows present.
- **E2E:** Playwright with 8 spec files including `compliance-fail-closed.spec.ts` (verdict-driven scenarios via `?scenario=` query param).

### 3.2 `apps/web` route inventory

| Route                                                     | File                                       | Verdict                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                                       | `app/page.tsx`                             | TBD landing/redirect — REWORK                                                                                                                                |
| `/auth`, `/auth/connect`                                  | `app/auth/*`                               | Legacy redirects to `/us/auth/connect` — DELETE after `/us` is canonical                                                                                     |
| `/explorer`                                               | `app/explorer/page.tsx`                    | Unspecified demo — DELETE                                                                                                                                    |
| `/landing`                                                | `app/landing/page.tsx`                     | Marketing landing (WIP) — REWORK                                                                                                                             |
| `/us`                                                     | `app/us/page.tsx`                          | Entry gate — KEEP                                                                                                                                            |
| `/us/eligibility`                                         | `app/us/eligibility/page.tsx`              | Rule-engine-backed eligibility check w/ JWT cookie — KEEP                                                                                                    |
| `/us/auth/connect`                                        | `app/us/auth/connect/page.tsx`             | SIWE + wagmi + rainbowkit — KEEP                                                                                                                             |
| `/us/disclosures`                                         | `app/us/disclosures/page.tsx`              | Static copy, all docs pending registration — KEEP (sync with backend doc registry when ready)                                                                |
| `/us/onboarding/{kyc,profile,broker,strategy,activation}` | `app/us/onboarding/**`                     | KYC iframe stub, profile form, broker picker (Alpaca live/paper), pre-activation review, 6-item activation checklist — KEEP / minor REWORK on KYC + strategy |
| `/us/app/home`                                            | `app/us/app/home/page.tsx`                 | 8-card dashboard — KEEP                                                                                                                                      |
| `/us/app/portfolio`                                       | `app/us/app/portfolio/page.tsx`            | Holdings + simulated P&L — KEEP                                                                                                                              |
| `/us/app/recommendations`                                 | `app/us/app/recommendations/page.tsx`      | Shallow list — KEEP                                                                                                                                          |
| `/us/app/recommendations/[id]`                            | `app/us/app/recommendations/[id]/page.tsx` | Fail-closed compliance gate (MIG-P2.5-15) — KEEP / REWORK decision-record detail rendering                                                                   |
| `/us/app/activity`                                        | `app/us/app/activity/page.tsx`             | Activity log shell — KEEP / expand into full Records Center                                                                                                  |
| `/us/app/documents`                                       | `app/us/app/documents/page.tsx`            | Disclosure ack UI, client-side tracker — KEEP / sync to backend Document Registry when shipped                                                               |
| `/us/app/account`                                         | `app/us/app/account/page.tsx`              | Account settings — KEEP                                                                                                                                      |
| `/us/app/support`                                         | `app/us/app/support/page.tsx`              | Support form + fail-safe classifier (7 allowed / 6 blocked categories) — KEEP                                                                                |
| `/admin`                                                  | `app/admin/page.tsx`                       | `notFound()` — DELETE (admin lives in Daniel's repo)                                                                                                         |

### 3.3 `apps/web/proxy.ts` (formerly `middleware.ts`)

Not a Next.js middleware file per se; it does:

- Per-request CSP nonce (`x-csp-nonce`)
- Eligibility gate (`us_eligibility_v1` cookie required for `/us/auth/connect` and `/us/onboarding/*`)
- Session gate (`us_session_v1` required for `/us/app/*` + `/us/onboarding/*` + `/admin`)
- CSRF token issuance (`csrf_v1` cookie issued on entry to `/us/app/*`)
- Security headers (CSP, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS)

### 3.4 `packages/api-clients`

- **OpenAPI spec** at `openapi/refi-api.yaml` (v0.3.0, 66 KB) defines **42 endpoints** across auth, eligibility, KYC, profile, broker, recommendations, exceptions, execution policy, orders, risk snapshots, records, disclosures, activity, positions, strategies, support, dashboard.
- **Generated client** `src/generated/api.gen.ts` — **NOT in git**. Generated on demand from spec.
- **Hooks** present for auth, session, kyc, onboarding, broker, recommendations, exceptions (untracked), activity, orders, bff (untracked).
- **MSW mocks** comprehensive — personas (`david-kim`, `maya-thompson`, `sarah-patel`), compliance verdict fixtures (10 verdict scenarios), domain-specific handlers, scenarios resolver for Playwright determinism.
- **Vitest contract tests** validate handler shapes vs OpenAPI schemas and discipline (no handler returns 500).

### 3.5 Copy & compliance scanners

- `packages/config/blocked-terms.ts` — 54 terms blocked, including SEC-sensitive ("guaranteed return", "beat the market", "founder reviewed", "staff approved", "AI trading bot", "autopilot", "risk-free") and brand-voice (e.g. "personalized advice", "powered by AI"). Includes Bolt→ReFi legacy term remapping.
- `scripts/scan-copy.ts` blocks CI on violations.
- `scripts/check-openapi-drift.ts` and `scripts/scan-retired-routes.ts` (untracked) enforce contract sync.

### 3.6 Git status snapshot

~50 modified files + several deletes + 40+ untracked. Pattern: **active investor-surface buildout** — onboarding + activation + dashboard, MSW refactor from flat fixtures (`david.ts`, `maya.ts` deleted) to a `personas/` folder, plus support-boundary library and verdict-driven Playwright tests. Not cleanup, not refactor — feature build.

---

## 4. Convergence Points

These are the seams where the two repos must agree:

| Backend artifact                                                           | Frontend representation                                                         | Status                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Users`, `Accounts`, `AccountSettings`, `AccountPrefs`                     | Auth/account flows under `/us/auth`, `/us/onboarding/broker`, `/us/app/account` | Frontend talks SIWE; backend `auth-siwe` is **skeleton**                                                     |
| `UserConsents`, `AccountConsents`                                          | `/us/app/documents` ack tracker                                                 | Frontend has client-side acks; backend has versioning but **no document repository**                         |
| KYC (CCID)                                                                 | `/us/onboarding/kyc` iframe stub                                                | Backend `identity-ccid` is **skeleton** — frontend will need either a placeholder mode or backend work first |
| `TemplateTargets`, `portfolio_actions_history`                             | Portfolio, recommendations                                                      | Read-only projection via BFF (not yet built)                                                                 |
| `AccountIntents` + `RiskSnapshots` + `ExecutionPlans` + `Orders` + `Fills` | Recommendation detail, activity, records                                        | The "advisory chain" — frontend currently has shape but no live data                                         |
| `AuditEvents`, `UiEventTimeline`                                           | Records Center, activity timeline                                               | Frontend lacks Records Center page                                                                           |
| `template.admin action=rebalance`                                          | **NOT** an investor action                                                      | Confirmed: admin-only via `apps/admin-portal/backend/api/accounts.py:561`                                    |
| `TradingControlStates`, `TradingControlEvents`                             | Pause/Resume managed automation (investor-controllable subset only)             | Frontend has copy but no policy CRUD UI                                                                      |
| `AdminInterventions`                                                       | (Hidden from investor; surfaced only as plain-language status when relevant)    | OK                                                                                                           |

---

## 5. Risks (Confirmed, Not Hypothetical)

1. **No BFF.** `apps/web/app/api/v1/*` is named in the OpenAPI spec but **zero routes exist in the repo**. MSW handles every call today. Until the BFF is built, the investor app cannot talk to Daniel's backend.
2. **Auth backend is skeleton.** SIWE nonce/verify endpoints have a frontend hook chain and MSW handlers, but `apps/auth-siwe` in Daniel's repo has no real implementation.
3. **KYC backend is skeleton.** `identity-ccid` is a stub. The frontend KYC step is an iframe placeholder.
4. **Compliance verdict backend is skeleton.** `compliance-adapter` is a stub. The frontend's fail-closed compliance gate works against fixtures but has no backend partner.
5. **No investor-profile schema.** The product cannot prove "software uses personal information supplied by each client through the platform" without a persisted profile + versioning. **New backend tables needed** — Daniel confirmed in chat ("new auth acct tables u create").
6. **No disclosure document registry.** `UserConsents` versions acceptance but documents/hashes/effective-dates don't exist server-side. Frontend has `disclosures.ts` registry but ack flow is client-side only.
7. **No advisory-client lifecycle.** `Accounts.status` is a flag; the IA exemption needs `prospect → onboarding → active → paused → terminated → archived` and an active-client counter ≥ 2.
8. **FLOAT64 on weights & thresholds.** Acceptable for prices, risky for portfolio weights and policy thresholds. Frontend uses `.toFixed()` in 6 places — display-only, but order submission payload shape needs audit.
9. **No Records Center, no Exception UI, no Execution Policy UI.** Three of the most load-bearing investor surfaces for Rule 203A‑2(e) recordkeeping are absent.
10. **Decision-record detail rendering incomplete** on the recommendation detail page — model factors render but guardrail summaries, full lineage to orders/fills, and audit chain are stubs.

---

## 6. What This Repo Already Gets Right (Don't Regress)

- SEC-aware copy and a blocked-terms scanner in CI.
- Fail-closed compliance gate as a deliberate pattern.
- Support boundary classifier with server re-validation — exactly the "no-human-advice" fencing the rule requires.
- Lifecycle-only PATCH on recommendations (Reject / Request manual review) — **no per-trade Accept button**. This matches the rule and Daniel's lifecycle model.
- Eligibility rule engine with versioning + IP/UA-hash fraud signals.
- Persona + scenario switchers for deterministic Playwright testing.
- OpenAPI as the single source of truth for the BFF surface, with drift checking.

---

## 7. Phase-0 Outputs

Three docs delivered in this commit:

- `docs/repo-truth-audit.md` (this file)
- `docs/frontend-sec203a-contract-map.md`
- `docs/current-gaps-register.md`

No code changes. Phase 1 (SEC 203A‑2(e) Product Boundary documents) and Phase 2 (backend contract extraction → BFF proposal) follow, in that order, before any investor-UI code lands.
