# ReFi.Trading USA — Build Documentation

**Status:** UI Phase 2 entry
**Last updated:** 2026-05-17
**Owner:** Zeshan Ahmad (CEO), Daniel Oosthuyzen (CTO)

---

## What this is

This folder holds the authoritative build documentation for the ReFi.Trading USA product surface mounted at `https://refi.trading/us`. It supersedes the earlier ChatGPT-generated build spec, which is archived in `spec-history/` and **should not be used as the basis for implementation**.

## Document hierarchy

Read these in order. Each builds on the one before.

### 1. `spec-current/00-architecture-overview.md`
The system topology. One picture of how the UI, backend services, brokers, identity, compliance, and audit pieces fit together. Start here so you have the right mental model before reading anything else.

### 2. `spec-current/01-us-overlay.md`
What the US-specific product surface adds on top of Daniel's core platform. State eligibility gate, US-specific copy and compliance language, broker filtering, regulatory disclosures. This is the only spec that is uniquely about `/us`; everything else is platform-wide.

### 3. `spec-current/02-phase-2-build-plan.md`
The ticket-by-ticket execution plan for UI Phase 1 catch-up (monorepo bootstrap, component migration, API client scaffolding) and UI Phase 2 delivery (SIWE auth, KYC onboarding, live compliance gating). Tickets reference Daniel's V2 PDF directly.

### 4. `spec-current/03-claude-code-master-prompt.md`
The verbatim prompt to give Claude Code. Tells it which documents are authoritative, which questions to surface before writing code, and the execution order.

### 5. `decisions/open-questions.md`
The five decisions Zeshan needs to make before Claude Code starts. Tracked here with status, owner, and decision date.

### 6. `spec-history/README.md`
Pointer to archived documents and an explanation of why they were archived.

## Source-of-truth documents (external)

These live outside this folder but are the foundation for everything in `spec-current/`:

1. **`Dev-PhasesV2.pdf`** (108 pp). Daniel's integrated UI low-level architecture. Contains:
   - Monorepo layout (`apps/web` + `packages/ui` + `packages/api-clients` + `packages/config`)
   - SIWE authentication contract and error codes
   - CCID/KYC onboarding flow
   - Compliance Adapter cache + verdict contract (`ALLOW | REVIEW | DENY`)
   - Per-domain component map (Identity, Explorer, Trading, Admin)
   - Phase 1, 2, 3, 4 UI checkpoints with exit criteria
   - State taxonomy (`Loading`, `Empty`, `Partial`, `404`, `429`, `5xx`)
   - Observability and budget requirements (Web Vitals, correlation IDs)

2. **`ReFi-Product-Dev-Phases-V1.pdf`** (16 pp). Daniel's Phase 1–4 backend architecture. Contains:
   - Core services (Data Loader, Inference Worker, Portfolio Engine, Risk Engine, Execution Gateway, Trade Manager)
   - Data stores (MongoDB Atlas, GCS, Redis Memorystore)
   - Pub/Sub event bus topology
   - Phase 2 additions (SIWE, CCID, ACE Policy Service, Compliance Adapter)
   - Phase 3 additions (Audit Writer, Merkle Builder, ReFIN L2, CCIP anchoring, Explorer API)
   - Phase 4 additions (Asset Routing, Token Policy Module, On-Chain Driver, zk-VaR, DePIN)
   - **Note:** V1 still shows SnapTrade in diagrams. SnapTrade was dropped after V1 was written. The current truth is per-broker drivers (Alpaca built, IBKR and Tradier next).

3. **`ReFi-Trading-IP.pdf`**. NRC/IRAP AI system description. Context only; not a build spec.

## What to do with the archived ChatGPT spec

`spec-history/ReFi_US_Next_GCP_Terraform_Master_Build_Spec_v2.md` is archived. It was a thoughtful piece of work on compliance posture and customer-facing language, but it was written without knowledge of Daniel's architecture and conflicts with it in seven structural ways (database, auth, compliance model, repo structure, broker integration, API surface, data contracts). See `spec-history/README.md` for details.

**Useful pieces salvaged into `spec-current/01-us-overlay.md`:**
- SEC-sensitive language rules and the blocked-term list
- Customer-facing screen inventory for `/us`
- Brand tokens (already aligned with Daniel's spec)
- Accessibility requirements
- Eligibility gate concept
- Support boundary copy and rules

Everything else from the archived spec is superseded.

## Reading guide by role

**Zeshan (CEO):** Read `00-architecture-overview.md` and `decisions/open-questions.md`. Answer the five open questions.

**Daniel (CTO):** Read `00-architecture-overview.md` to confirm it matches what you've built. Confirm the OpenAPI publication path, the per-broker muxxer interface shape, and Phase 2 service readiness in `decisions/open-questions.md`.

**Claude Code operator:** Read `03-claude-code-master-prompt.md`. It points to everything else in the right order.

**Future engineers joining the team:** Read in numeric order: `00`, `01`, `02`. Skim `03`. Reference `decisions/` for context on past calls.
