# refi-us-sec-ia

> The ReFi.Trading US investor-product shell. A policy-bound trading platform for U.S. investors, structured around SEC Rule 203A-2(e) (Internet Adviser Exemption).

[![CI](https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/actions/workflows/ci.yml/badge.svg)](https://github.com/ReFi-Trading-Inc/refi-us-sec-ia/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![pnpm](https://img.shields.io/badge/pnpm-11-f69220)
![Next.js](https://img.shields.io/badge/Next.js-16-000000)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6)

---

## 🧭 Backend source of truth for Phase 2.6

The current source of truth for the trading backend is **`refinity_dev/refinity-main main @ 9f9dfc9`** and specifically the docs under **`refinity-main/docs/authoritative/*`**. Phase 2.5 docs are retained as historical audit evidence with supersession headers.

### If you maintain `refinity-main`, read these first

| Order | Doc                                                                                                                  | What it gives you                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1     | [`docs/phase2-6-authoritative-source-of-truth.md`](docs/phase2-6-authoritative-source-of-truth.md)                   | The Phase 2.6 source-of-truth declaration with pinned commits and the authority hierarchy.                                 |
| 2     | [`docs/phase2-6-repo-observation-report.md`](docs/phase2-6-repo-observation-report.md)                               | Evidence-anchored report from inspecting both repos. Conflicts, stale assumptions, validated assumptions.                  |
| 3     | [`docs/phase2-6-daniel-answer-resolution.md`](docs/phase2-6-daniel-answer-resolution.md)                             | Closes the four Phase 2.5 blockers with your direct answers and the authoritative docs.                                    |
| 4     | [`docs/phase2-6-signal-to-investor-product-contract-v3.md`](docs/phase2-6-signal-to-investor-product-contract-v3.md) | **Final Contract V3** (authoritative-aligned). Folds in Daniel's 2026-05-30 ratifications.                                 |
| 4a    | [`docs/phase2-6-contract-v3-plan.md`](docs/phase2-6-contract-v3-plan.md)                                             | Planning evidence for Contract V3.                                                                                         |
| 5     | [`docs/phase2-6-gap-register-v3-against-authoritative.md`](docs/phase2-6-gap-register-v3-against-authoritative.md)   | **Final Gap Register V3** with severity, owners, surface impact, production-blocker flags, and Daniel-ratification status. |
| 5a    | [`docs/phase2-6-gap-register-v3-plan.md`](docs/phase2-6-gap-register-v3-plan.md)                                     | Planning evidence for Gap Register V3.                                                                                     |
| 6     | [`docs/phase2-6-surface-reframing-map.md`](docs/phase2-6-surface-reframing-map.md)                                   | Per-surface reframing against the authoritative backend (all 16 surfaces).                                                 |
| 7     | [`docs/phase2-6-account-prefs-history-options.md`](docs/phase2-6-account-prefs-history-options.md)                   | The new AccountPrefs history scope — needs your ratification.                                                              |
| 8     | [`docs/phase2-6-admin-portal-api-consumption-map.md`](docs/phase2-6-admin-portal-api-consumption-map.md)             | Per-endpoint mapping of Admin Portal routes to investor surfaces, with ACL/scoping/cache rules.                            |
| 9     | [`docs/phase2-6-next-pr-sequence.md`](docs/phase2-6-next-pr-sequence.md)                                             | The 8-PR sequence after this observation branch.                                                                           |

### Authoritative backend docs (in `refinity-main`)

- `docs/authoritative/executive_overview.md` — system summary with mermaid pipeline diagram
- `docs/authoritative/frontend_integration_contract.md` — frontend integration contract
- `docs/authoritative/trade_lifecycle_contract.md` — lifecycle vocabulary and transitions
- `docs/authoritative/trade_auditability_contract.md` — audit reconstruction patterns
- `docs/authoritative/trade_lifecycle_retention_legal_hold.md` — retention rules

### SEC-boundary context (unchanged from Phase 2.5)

- [`docs/sec203a-product-boundary.md`](docs/sec203a-product-boundary.md)
- [`docs/admin-investor-boundary.md`](docs/admin-investor-boundary.md)
- [`docs/investor-action-taxonomy.md`](docs/investor-action-taxonomy.md)

---

## Table of contents

- [What this repo is](#what-this-repo-is)
- [Why the separation matters](#why-the-separation-matters)
- [Architecture at a glance](#architecture-at-a-glance)
- [Project layout](#project-layout)
- [Doc index](#doc-index) — full per-category reading list
- [Stack](#stack)
- [Quick start](#quick-start)
- [The four enforcement gates](#the-four-enforcement-gates)
- [Branching and PRs](#branching-and-prs)
- [Phase status](#phase-status)

---

## What this repo is

This is the **investor-facing shell** — the Next.js application, the BFF that fronts it, and the static SEC-boundary controls that constrain both. It is **not** the trading backend.

The trading backend lives in [`gitlab.com/refinity_dev/refinity-main`](https://gitlab.com/refinity_dev/refinity-main) and owns signal generation, portfolio analytics, account-intent generation, risk evaluation, execution policy enforcement, broker lifecycle, and the trade-lifecycle records in Spanner. This repo consumes that backend through a contract boundary documented in [`docs/phase2-5-signal-to-investor-product-contract.md`](docs/phase2-5-signal-to-investor-product-contract.md).

The two repos are intentionally separate. The boundary between them is not a convention — it is **enforced by code, CI, copy, and tests**.

---

## Why the separation matters

SEC Rule 203A-2(e) (the Internet Adviser Exemption) requires that recommendations to the investor be **operationally interactive and software-generated**. Three things follow:

1. **No human-in-the-loop on the advice path.** Staff cannot create, alter, approve, or supplement individualized recommendations. There is no founder review, no manual override, no per-trade approval surface. Support helps with the app — never with investment decisions.
2. **No per-trade investor Accept.** In Managed mode, the investor signs a standing execution policy. After that, eligible recommendations flow to the broker under that policy's guardrails. There is no "Approve for Execution" button by design.
3. **The investor-product surface and the operator surface are physically separate codebases.** Admin commands — `template.admin`, `target_account_id`, manual rebalances — live in the backend's `admin-portal`. They cannot be referenced anywhere in this repo. This is enforced by [`scripts/tripwire-investor-boundary.ts`](scripts/tripwire-investor-boundary.ts).

The boundary is documented in [`docs/sec203a-product-boundary.md`](docs/sec203a-product-boundary.md) and [`docs/admin-investor-boundary.md`](docs/admin-investor-boundary.md), and is verified by the tripwire (0 violations / 144 scanned files at merge), the contract assertions, and the E2E suite (67 / 67 passing).

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│  refi-us-sec-ia (this repo)                                     │
│  ─────────────────────────                                      │
│                                                                 │
│  apps/web/app/us/*       ◄── investor UI (Next.js 16, App Router)
│       │                                                         │
│       ▼                                                         │
│  apps/web/app/api/v1/*   ◄── BFF route handlers                 │
│       │                                                         │
│       ▼                                                         │
│  apps/web/src/lib/                                              │
│    bff/                  ◄── auth, session, CSRF, correlation   │
│    prototype-store/      ◄── filesystem JSON store for entities │
│      not yet owned by the upstream backend                      │
│    sec203a/              ◄── investor-action taxonomy + boundary│
│                                                                 │
│  packages/                                                      │
│    ui/                   ◄── shared component library           │
│    api-clients/          ◄── OpenAPI-generated client + hooks   │
│    config/               ◄── shared lint, ts, and blocked-terms │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │  SignalToInvestorProductAdapter
                              │  (contract boundary; see Contract V2)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  gitlab.com/refinity_dev/refinity-main  (separate repo)         │
│  ─────────────────────────────────────                          │
│  signals → template.rebalance.intent → account.intent.ready     │
│  → risk.approved | risk.rejected → orders.cmd → orders.evt      │
│  → audit.evt                                                    │
│                                                                 │
│  Services: inference-worker, portfolio-engine, portfolio-       │
│  manager, account-intent-builder, risk-engine, exec-gateway,    │
│  trade-manager, admin-portal                                    │
└─────────────────────────────────────────────────────────────────┘
```

The contract boundary is defined in [`docs/phase2-5-signal-to-investor-product-contract.md`](docs/phase2-5-signal-to-investor-product-contract.md) (V2, GitLab-aligned). The gap register that tracks open adapter work is [`docs/phase2-5-gap-register-v2-against-gitlab.md`](docs/phase2-5-gap-register-v2-against-gitlab.md).

---

## Project layout

```
.
├── apps/
│   └── web/                # Next.js 16 investor app + BFF
│       ├── app/us/         # /us route tree (eligibility, auth, onboarding, app)
│       ├── app/api/        # BFF route handlers (/api/v1/investor/*)
│       ├── src/lib/        # bff/, prototype-store/, sec203a/
│       └── e2e/            # Playwright specs (67 tests)
├── packages/
│   ├── ui/                 # shared component library
│   ├── api-clients/        # OpenAPI-generated client + React Query hooks
│   └── config/             # shared eslint / tsconfig / blocked-terms
├── scripts/
│   ├── tripwire-investor-boundary.ts   # SEC-boundary tripwire
│   ├── contract-assertions.ts          # taxonomy / receipt / immutability invariants
│   └── scan-copy.ts                    # blocked-term + placeholder scanner
├── docs/                   # architecture, contracts, audits (see Doc Index)
└── .github/workflows/      # CI + staging + prod deploy
```

---

## Stack

- **App:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 6, Tailwind CSS 3
- **State:** TanStack Query 5, React Hook Form 7, Zod 4
- **Auth:** Sign-In With Ethereum (SIWE) via RainbowKit + wagmi, session JWT (`jose`)
- **API:** OpenAPI-typed client (`openapi-typescript`), MSW for local dev fixtures
- **Testing:** Playwright 1.5+ (E2E), Vitest 3 (unit), custom contract-assertion script (invariants)
- **Build:** Turborepo 2, pnpm 11 workspaces
- **Observability:** Sentry (`@sentry/nextjs`), PostHog
- **Runtime:** Node 20+, pnpm 11+

---

## Quick start

```bash
pnpm install
pnpm dev
# → http://localhost:3000
```

Run the full local gate before opening a PR:

```bash
pnpm typecheck       # tsc --noEmit across all workspaces
pnpm lint            # eslint --max-warnings=0
pnpm contract-test   # taxonomy + receipt-vs-access-log + immutability invariants
pnpm tripwire        # SEC 203A-2(e) boundary scan
pnpm test            # contract-test + tripwire + api-clients vitest
pnpm scan-copy       # blocked-terms + placeholder scanner
pnpm e2e             # Playwright E2E (boots Next dev server)
pnpm build           # next build (catches typed-routes errors local typecheck misses)
```

The CI workflow ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same gates and is required to be green before any merge to `main`.

---

## The four enforcement gates

The investor-product boundary is held by four CI-enforced gates. They are deliberately independent so a regression cannot pass undetected through a single mechanism.

| Gate                    | Script                                                                           | What it enforces                                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tripwire**            | [`scripts/tripwire-investor-boundary.ts`](scripts/tripwire-investor-boundary.ts) | No admin endpoint references, no forbidden investor-action identifiers, no per-trade Accept labels, no `/admin/*` routes in this codebase                                                                                       |
| **Contract assertions** | [`scripts/contract-assertions.ts`](scripts/contract-assertions.ts)               | Investor-action vs record-access taxonomies stay disjoint; profile snapshots, decision records, and execution-policy versions remain immutable per id; `InvestorActionReceipt` and `RecordAccessLog` remain independent streams |
| **Copy scan**           | [`scripts/scan-copy.ts`](scripts/scan-copy.ts)                                   | No blocked terms in `_content/*.ts`; no unreplaced `[Bracketed]` placeholders in CI                                                                                                                                             |
| **E2E boundary specs**  | `apps/web/e2e/*-boundary*.spec.ts`, `support.spec.ts`, `recommendations.spec.ts` | No per-trade Accept / Approve / Submit / staff-approval affordance renders; support classifier blocks SBR-pattern prompts                                                                                                       |

---

## Branching and PRs

- `main` is the integration trunk. CI must be green and the SEC-boundary statement must be in the PR body.
- Feature branches use the prefix that matches the work — e.g. `phase2-5-*`, `fix-*`, `chore-*`.
- Commits follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). `commitlint` enforces it.
- Pre-commit runs `lint-staged` + Prettier. Pre-push runs the full lint + typecheck.
- Squash-merge is the default. The squash commit subject becomes the `main` history entry.

---

## Doc index

The documentation is organized as a **control-plane archive**: each doc either codifies a rule, records an audit, or specifies a contract. They are written to be re-read, not just written once.

### Boundary and control rules

- [`docs/sec203a-product-boundary.md`](docs/sec203a-product-boundary.md) — The SEC Rule 203A-2(e) posture encoded as enforceable product rules.
- [`docs/admin-investor-boundary.md`](docs/admin-investor-boundary.md) — The impermeable boundary between admin/operator commands and the investor product.
- [`docs/investor-action-taxonomy.md`](docs/investor-action-taxonomy.md) — Allowed and forbidden investor actions, canonicalised.
- [`docs/frontend-sec203a-contract-map.md`](docs/frontend-sec203a-contract-map.md) — How the boundary maps onto frontend code.
- [`docs/bff-prototype-state-contract.md`](docs/bff-prototype-state-contract.md) — The three-bucket rule for entities not yet owned by the upstream backend.
- [`docs/signal-vs-managed-mode.md`](docs/signal-vs-managed-mode.md) — The two subscription tiers, what differs, what stays the same.

### Contracts (current, Phase 2.5)

- [`docs/phase2-5-signal-to-investor-product-contract.md`](docs/phase2-5-signal-to-investor-product-contract.md) — **Contract V2.** Signal-to-investor-product contract, GitLab-aligned. The authoritative bridge between the trading backend and this shell.
- [`docs/phase2-5-gap-register-v2-against-gitlab.md`](docs/phase2-5-gap-register-v2-against-gitlab.md) — **Gap Register V2.** Per-gap classification (aligned / adapter-pending / BFF-owned / Daniel-confirm / skeletal).

### Audits and verifications (Phase 2.5)

- [`docs/phase2-5-final-merge-package.md`](docs/phase2-5-final-merge-package.md) — One-stop summary of what shipped in Phase 2.5.
- [`docs/phase2-5-gitlab-refinity-main-source-verification.md`](docs/phase2-5-gitlab-refinity-main-source-verification.md) — Verification that `refinity-main main @ 0a7d64d` is canonical.
- [`docs/phase2-5-gitlab-backend-capability-map.md`](docs/phase2-5-gitlab-backend-capability-map.md) — Verified file:line refs, topic names, table columns from the trading backend.
- [`docs/phase2-5-gitlab-branch-inventory.md`](docs/phase2-5-gitlab-branch-inventory.md) — GitLab branch posture (single-branch trunk).
- [`docs/phase2-5-frontend-surface-inventory.md`](docs/phase2-5-frontend-surface-inventory.md) — 16 frontend surfaces × route × BFF backing × entity × hook × test.
- [`docs/phase2-5-surface-to-gitlab-alignment-register.md`](docs/phase2-5-surface-to-gitlab-alignment-register.md) — Per-surface alignment verdict.
- [`docs/phase2-5-core-alignment-decision.md`](docs/phase2-5-core-alignment-decision.md) — Direct answers to the 16 alignment questions.
- [`docs/phase2-5-stale-e2e-cleanup.md`](docs/phase2-5-stale-e2e-cleanup.md) — E2E realignment record.

### Phase history

- [`docs/repo-truth-audit.md`](docs/repo-truth-audit.md) — Repo source-of-truth audit.
- [`docs/phase2-checkpoint-surfaces-1-3.md`](docs/phase2-checkpoint-surfaces-1-3.md) — Phase 2 mid-stage checkpoint.
- [`docs/phase2-midpoint-architecture-checkpoint.md`](docs/phase2-midpoint-architecture-checkpoint.md) — Phase 2 architecture mid-point.
- [`docs/current-gaps-register.md`](docs/current-gaps-register.md) — Working gaps register.

### Superseded (kept for historical audit)

- `docs/phase2-5-daniel-*.md`, `docs/phase2-5-signal-contract-live-backend-delta.md` — pre-GitLab assumptions, retained so the audit trail is reconstructible.

---

## Phase status

| Phase                                   | Status                                                                                                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1                                 | Boundary, taxonomy, and tripwire established. Shipped.                                                                                                                                                                                                               |
| Phase 2                                 | Surfaces 1–3 + Exception Review + Disclosure Re-ack + Profile Reactivation + Managed Pause/Resume. Shipped.                                                                                                                                                          |
| **Phase 2.5**                           | **GitLab backend alignment, Contract V2, Gap Register V2, full E2E green. Shipped on `main`.**                                                                                                                                                                       |
| **Phase 2.6**                           | **Backend source-of-truth realignment to `refinity-main main @ 9f9dfc9` + `docs/authoritative/*`: Contract V3, Gap Register V3, 16-surface reframing, Admin Portal outbound proxy. Docs on `main`; proxy + PR-D (AccountPrefs History Contract) branches unmerged.** |
| Phase 3 (Surface 4 / Automation Center) | Blocked on PR-D (AccountPrefs History Contract, Daniel ratification gate) + PR-E (Admin Portal proxy). The four Phase 2.5 Daniel-confirmation items were resolved in Phase 2.6 (see below).                                                                          |
| Phase 4 (Adapter implementation)        | Blocked on Phase 2.6 PR sequence (PR-E onward).                                                                                                                                                                                                                      |
| Production                              | Blocked on adapter implementation, durable BFF storage, broker integration, legal/compliance review. (audit-writer + compliance-adapter were de-classified as shell blockers in Gap Register V3 — on-chain audit infra, deferred.)                                   |

The four Phase 2.5 Daniel-confirmation items are resolved in [Phase 2.6 Daniel answer resolution](docs/phase2-6-daniel-answer-resolution.md) (risk verdicts binary ALLOW\|DENY; Spanner-backed template registry; `signal: 0` preserved; no backend per-account ExecutionPolicy). Historical context: [Gap Register V2 §10](docs/phase2-5-gap-register-v2-against-gitlab.md), [Contract V2 §7.2](docs/phase2-5-signal-to-investor-product-contract.md). For how the alpha funnel, the game, and this product connect, see the [system integration map](docs/system-integration-map.md).

---

## License

UNLICENSED — proprietary to ReFi Trading Inc.

---

## Contact

For boundary, compliance, or contract questions: open an issue with the `boundary` label. For backend coordination: see [`gitlab.com/refinity_dev/refinity-main`](https://gitlab.com/refinity_dev/refinity-main).
