# Archived Specifications

**Status:** archived
**Do not use as a source of truth for implementation.**

This folder contains documents that predate the current build documentation and have been superseded. They are preserved for historical context and for cross-reference on specific items (screen inventory, copy rules) that survived the transition.

---

## `ReFi_US_Next_GCP_Terraform_Master_Build_Spec_v2.md` (ChatGPT-generated, 7,290 lines)

**Archived on:** 2026-05-17
**Reason for archival:** written without knowledge of Daniel's architecture; conflicts in seven structural ways

### Why this document was archived

The ChatGPT-generated build spec was written without access to Daniel's Phase 1-4 architecture documents (`ReFi-Product-Dev-Phases-V1.pdf` and `Dev-PhasesV2.pdf`). As a result, it specifies a stack and patterns that are incompatible with what Daniel has built and is building. Implementing this spec would have produced a codebase that gets thrown away when it meets the real backend.

### The seven structural conflicts

| Topic | Archived spec says | Reality (per Daniel's docs) |
|---|---|---|
| Database | Cloud SQL Postgres + Drizzle | MongoDB Atlas + Redis Memorystore + GCS |
| Authentication | Custom email/password sessions with optional Identity Platform | SIWE (Sign-In With Ethereum, EIP-4361) only |
| Compliance model | Form CRS, ADV 2A, advisory agreement (US adviser registration assumed) | Chainlink CCID for KYC + Chainlink ACE for cached verdicts |
| Repository structure | Single Next.js app | Monorepo: `apps/web` + `packages/ui` + `packages/api-clients` + `packages/config` |
| Broker integration | SnapTrade as universal adapter | Per-broker drivers (Alpaca built, IBKR and Tradier next); SnapTrade dropped |
| API surface | Custom `RepositoryInterface` pattern with mock/GCP adapters | OpenAPI-generated TypeScript SDKs in `packages/api-clients`, MSW for offline dev |
| Domain types | Custom `Recommendation`, `AutomationEligibilityCheck`, `ExceptionReview` | Named contracts from V2 PDF: `OrderPreviewResult`, `RouteDecision`, `PolicyDecision`, `ClaimResponse`, `orders.evt`, `audit.evt`, `OrderIdMap`, `ExplorerRecord` |

### Items salvaged into current spec documents

The following pieces of the archived spec are still useful and were carried forward into `spec-current/`:

| Salvaged item | Lives in |
|---|---|
| SEC-sensitive language rules (blocked terms, replacement table) | `spec-current/01-us-overlay.md` section 2 |
| Customer-facing screen inventory for `/us` (Home, Portfolio, Recommendations, etc.) | `spec-current/01-us-overlay.md` "Screen-by-screen requirements" |
| Brand tokens (charcoal/mint palette, Inter/JetBrains Mono) | Already aligned with Daniel's V2 PDF; reflected in `spec-current/00-architecture-overview.md` |
| Accessibility requirements (WCAG AA, prefers-reduced-motion) | Inherited platform requirement; referenced in build plan |
| Eligibility gate concept (state/age/US-person check) | `spec-current/01-us-overlay.md` section 1 |
| Support boundary copy and behavior | `spec-current/01-us-overlay.md` `/us/app/support` section |
| Component design system rules (button variants, badge color map, table behavior) | Migrating into `packages/ui` per `spec-current/02-phase-2-build-plan.md` ticket MIG-P1-03 |

### Items deliberately not salvaged

The following pieces of the archived spec are wrong or superseded and were deliberately left behind:

- Sections 7 (auth replacement contract), 8 (repository pattern), 10 (Cloud SQL schema), 11.1-11.3 (GCP runtime services list)
- Section 12 (Terraform Cloud SQL module) — Postgres modules are not needed; MongoDB is Daniel's responsibility
- Section 14.5 fabricated "ReFi.Trading Advisors LLC" entity name
- Sections 15.1 hardcoded advisory entity placeholders
- Section 27 v1 carry-forward (duplicates v2 with conflicting types)
- All mock adapter and repository interface code

### How to read the archived spec

If you must consult the archived spec for a specific item (e.g., a screen requirement that wasn't fully carried into the US overlay doc), follow this rule:

> **Salvage the content concept. Discard the technical implementation. Translate to the current architecture.**

For example, the archived spec's `RecommendationDetailPanel` component lists sections like "What we recommend," "Why now," "Why this fits your profile" — these section names are useful and were carried into `01-us-overlay.md`. But the archived spec's `RecommendationRepository.getRecommendation(id)` interface is not — that's replaced by the OpenAPI-generated `useRecommendation(id)` hook.

### Permission to delete

This document may be deleted from the repository entirely after Phase 2 ships, once it's clear that no further cross-reference is needed. Until then, it stays in `spec-history/` with this README explaining its status.
