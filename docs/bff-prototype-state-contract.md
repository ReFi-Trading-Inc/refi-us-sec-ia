# BFF Prototype State Contract

**Date:** 2026-05-20
**Owner:** This repo. Lives under `apps/web/src/lib/prototype-store/` with HTTP surface under `apps/web/app/api/v1/*`.
**Status:** Phase-1 control doc. Implementation begins after the five Phase-1 docs are in place.

---

## Purpose

The investor product depends on state that Daniel's backend does not yet model (G-003, G-005, G-006, G-007). Rather than feature-flag those screens away (kills product testability) or fake them through MSW (no real state semantics), the BFF owns prototype storage for these entities with explicit "not final compliance system of record" labeling.

This contract defines: (a) the entity set, (b) the storage interface, (c) the response envelope every BFF route must use, (d) the migration path when Daniel's backend lands.

---

## Three-Bucket Recap

| Bucket                        | Pattern                                                                            | Applies to                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **A — MSW + dev label**       | Mock at network layer. No prototype persistence.                                   | G-002 auth-siwe, G-004 KYC, G-011 compliance-adapter                               |
| **B — BFF prototype storage** | Real persistence in `apps/web/src/lib/prototype-store/`. Source = `prototype-bff`. | G-003 profile, G-005 disclosure registry, G-006 lifecycle, G-007 auth↔trading link |
| **C — Upstream-only**         | Documented as constraint. No frontend replacement.                                 | G-013, G-014, G-103, G-105, G-107, G-108, G-201–203                                |

This document covers Bucket B. Bucket A is handled by existing MSW. Bucket C is no-op for the frontend.

---

## Entity inventory (current)

The store now models 14 product nouns split across 14 entity files. Naming aligns with the canonical product taxonomy — see also `memory/contract_execution_policy.md` and `memory/contract_receipt_vs_access_log.md`.

| Domain noun                           | File                            | Mutability                                                    |
| ------------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| `session`                             | `session.ts`                    | mutable                                                       |
| `advisory_profile` (draft + snapshot) | `advisory-profile.ts`           | drafts mutable; snapshots immutable per version               |
| `disclosure_document`                 | `disclosure-document.ts`        | immutable per `(doc_id, version)`                             |
| `disclosure_acknowledgement`          | `disclosure-acknowledgement.ts` | append-once per `(user, doc, version)`                        |
| `brokerage_connection`                | `brokerage-connection.ts`       | mutable projection (no creds)                                 |
| `subscription_mode`                   | `subscription-mode.ts`          | mutable                                                       |
| `execution_policy`                    | `execution-policy.ts`           | **immutable per version** — investor signs a specific version |
| `managed_execution_state`             | `managed-execution-state.ts`    | mutable status machine (does NOT change policy version)       |
| `recommendation_projection`           | `recommendation-projection.ts`  | mutable per `(account, rec_id)`                               |
| `exception_review` (+ resolutions)    | `exception-review.ts`           | reviews mutable; resolutions append-only                      |
| `decision_record`                     | `decision-record.ts`            | immutable per `(account, record_id)` with full version pins   |
| `investor_action_receipt`             | `receipt.ts`                    | append-only (state-changing actions only)                     |
| `record_access_log`                   | `record-access-log.ts`          | append-only (view/download/export)                            |
| `auth_session_link`                   | `auth-link.ts`                  | mutable per `(auth, account)`                                 |
| `lifecycle_state` (+ transitions)     | `lifecycle.ts`                  | state mutable; transitions append-only                        |

Two durable contracts that govern this set:

- **Execution Policy ≠ Managed Execution State.** The policy is the durable, signed, versioned object the investor authorizes. The state is the runtime status machine (`active | paused_by_user | paused_by_system | setup_incomplete | review_required | inactive`) under whichever policy version is current. Pause/resume mutates state only; they do not create a new policy version.
- **InvestorActionReceipt ≠ RecordAccessLog.** State-changing investor actions emit `InvestorActionReceipt`. View / download / export emit `RecordAccessLog`. Two append-only streams; never co-mingled.

## Legacy entity descriptors (kept for backfill clarity)

### 1. `InvestorProfileDraft`

**Purpose:** In-progress profile during onboarding.
**Key:** `(auth_id, draft_id)`
**Fields:** `goal`, `horizon`, `income_band`, `liquidity_need`, `risk_tolerance`, `experience`, `account_purpose`, `restrictions`, `last_updated_at`.
**Mutability:** Mutable until promoted to snapshot.

### 2. `InvestorProfileSnapshot`

**Purpose:** Immutable point-in-time profile referenced by every advisory record.
**Key:** `(account_id, profile_version)` — `profile_version` is a monotonic integer per account.
**Fields:** all `InvestorProfileDraft` fields + `content_hash`, `created_at`, `correlation_id`, `source: "prototype-bff"`.
**Mutability:** Immutable. New version on any change.

### 3. `DisclosureDocument`

**Purpose:** Versioned disclosure document registry.
**Key:** `(doc_id, version)`
**Fields:** `kind` (`crs | adv_2a | advisory_agreement | privacy_notice | algorithm_disclosure`), `effective_at`, `content_hash`, `display_status` (`pending_registration | available | superseded`), `supersedes_version?`, `requires_reack_reason?`.
**Mutability:** Immutable per `(doc_id, version)`. New version on update.

### 4. `DisclosureAcknowledgement`

**Purpose:** Per-user ack of a specific document version.
**Key:** `(user_id, doc_id, version, acked_at)`
**Fields:** `acceptance_source` (`web | recovery`), `ip_hash`, `user_agent_hash`, `correlation_id`, `source: "prototype-bff"`.
**Mutability:** Append-only.

### 5. `InvestorLifecycleState`

**Purpose:** Advisory-client lifecycle (`prospect → onboarding → active → paused → terminated → archived`).
**Key:** `account_id`
**Fields:** `state`, `entered_at`, `previous_state`, `previous_entered_at`, `reason`, `source: "prototype-bff"`.
**Mutability:** Mutable; transitions append to `InvestorLifecycleTransitions` event log (same store).

### 6. `InvestorModeState`

**Purpose:** Signal vs Managed mode selection (separate from lifecycle; mode applies only when lifecycle is `active`).
**Key:** `account_id`
**Fields:** `mode` (`signal | managed`), `selected_at`, `correlation_id`.

### 7. `ManagedPolicyState`

**Purpose:** Pause/resume + automation policy parameters.
**Key:** `account_id`
**Fields:** `status` (`active | paused_by_user | paused_by_system`), `paused_reason?`, `drift_threshold?`, `rebalance_frequency?`, `max_order_size?`, `risk_limit_profile?`, `last_changed_at`, `last_changed_by` (`user | system`).

### 8. `AuthSessionLink`

**Purpose:** Bridge SIWE auth identity to one or more trading accounts (G-007).
**Key:** `(auth_id, account_id)`
**Fields:** `linked_at`, `source` (`onboarding | recovery`), `correlation_id`.

### 9. `InvestorActionReceipt`

**Purpose:** Append-only record of every state-changing investor action.
**Key:** `receipt_id`
**Fields:** `action` (from `investor-action-taxonomy.md`), `actor` (`user | system`), `auth_id`, `account_id?`, `correlation_id`, `inputs_hash`, `outcome` (`ok | rejected | blocked`), `reason_code?`, `references` (list of entity ids touched), `emitted_at`, `source: "prototype-bff"`.
**Mutability:** Append-only. **Every** BFF state-changing endpoint must write one.

### 10. `AdvisoryRecordProjection`

**Purpose:** Investor-readable projection of the backend advisory chain (`AccountIntents` + `RiskSnapshots` + `ExecutionPlans` + `Orders` + `Fills` + `AuditEvents`).
**Key:** `(account_id, record_id)`
**Fields:** `profile_version`, `prefs_version?`, `disclosure_versions`, `model_version?`, `intent_id?`, `risk_snapshot_id?`, `plan_id?`, `order_ids`, `fill_ids`, `decision_summary`, `delivery_channel: "platform"`, `delivered_at`, `source` (`prototype-bff` while backend chain is incomplete, `backend` when wired).
**Mutability:** Immutable per record_id; new record on any new advisory event.

---

## Storage Interface

```ts
// apps/web/src/lib/prototype-store/index.ts
export interface PrototypeStore<TEntity, TKey> {
  get(key: TKey): Promise<TEntity | null>;
  put(key: TKey, entity: TEntity): Promise<void>;
  list(filter: Partial<TEntity>): Promise<TEntity[]>;
  append?(entity: TEntity): Promise<TKey>; // for event-log entities
}
```

**Backing implementation (first cut):** filesystem JSON under `.refi-prototype-store/` (gitignored) for local/dev; D1 (Cloudflare) or Vercel KV for deployed environments. Choice is implementation detail and may change — what matters is the interface above and the response envelope below.

**Data retention:** prototype store data is **not** a compliance system of record and may be wiped at any time. Tests must seed; deployed environments must back up only for operational continuity, never as evidence.

---

## BFF Response Envelope (mandatory)

Every BFF route must wrap its payload in this envelope:

```ts
type BffResponse<T> = {
  data: T;
  meta: {
    source: "backend" | "prototype-bff" | "msw" | "hybrid";
    systemOfRecord: boolean;
    upstreamGap?: `G-${string}`;
    correlationId: string;
    emittedAt: string; // ISO UTC
  };
  receipt?: {
    receiptId: string;
    action: InvestorActionName; // from investor-action-taxonomy.md
  };
};
```

Rules:

- `source: "backend"` → `systemOfRecord: true`, no `upstreamGap`.
- `source: "prototype-bff"` → `systemOfRecord: false`, `upstreamGap` required.
- `source: "msw"` → `systemOfRecord: false`, dev mode only.
- `source: "hybrid"` → projection combines real + prototype; `systemOfRecord: false`, list `upstreamGap`s in a comment field if needed.
- State-changing routes (POST/PATCH/DELETE) must emit `receipt` with a freshly-appended `InvestorActionReceipt` id.
- Every route asserts `correlationId` presence; reject with 400 if missing.

---

## Dev Badge (non-production builds only)

A small, accessible badge in the corner of any screen whose primary data has `source !== "backend"`:

- Visible only when `process.env.NEXT_PUBLIC_REFI_ENV !== "production"`.
- Text: `Preview — prototype data`. Tooltip lists the `upstreamGap` codes.
- ARIA-live polite; never blocks interaction.
- Hidden from screen-reader main flow via `aria-label` on the wrapping landmark.

**User-facing copy never says "not wired", "mock", "stub", or "fake."** Approved phrases for user-facing states:

- "This step is being verified."
- "Broker verification is pending."
- "Compliance review is pending."
- "This record is available in preview."

---

## Migration Path (when Daniel's backend lands)

For each Bucket-B entity:

1. **Add new source.** BFF route gains an option to read from Daniel's API/Spanner alongside the prototype store.
2. **Dual-read for one release.** Return `source: "hybrid"`. If both differ, log telemetry but prefer backend.
3. **Swap.** Once dual-read shows convergence, switch primary read to backend; mark prototype data archival-only.
4. **Decommission.** After one further release without regression, delete the prototype-store implementation for that entity and remove the dev badge for any screen that now reads `source: "backend"`.

Migration is per-entity, not big-bang. The envelope contract never changes.

---

## Allowed actions (this doc)

- Implement the 10 entities above under `apps/web/src/lib/prototype-store/`.
- Persist `InvestorActionReceipt` on every state-changing BFF call.
- Render the dev badge on any screen with non-backend primary data.

## Prohibited actions (this doc)

- Adding a prototype-store entity not listed above without updating this doc first.
- Returning a payload without the `BffResponse<T>` envelope.
- Showing "mock", "stub", "fake", or "not wired" to the end user.
- Treating the prototype store as a compliance system of record (no exports labeled as evidence; no "official" downloads).
- Persisting full PII in prototype store beyond what's needed for the screen (hash IP/UA; never store raw broker credentials).

## Backend source of truth

| Entity                   | Eventual backend home                                                                                            | Today's source                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| InvestorProfile\*        | New Daniel table (`InvestorProfiles`, `InvestorProfileVersions`)                                                 | prototype-bff                                                                            |
| Disclosure\*             | New Daniel table (`DisclosureDocuments`, `DisclosureDeliveries`)                                                 | prototype-bff (+ static registry in `_content/disclosures.ts` for shape)                 |
| InvestorLifecycleState   | `Accounts.status` extended + new lifecycle table                                                                 | prototype-bff                                                                            |
| InvestorModeState        | TBD — likely `Accounts.mode` or `AccountSettings.mode`                                                           | prototype-bff                                                                            |
| ManagedPolicyState       | `TradingControlStates` (account scope) + `Accounts.autopilot_enabled`                                            | prototype-bff (writes); reads will join backend control state when wired                 |
| AuthSessionLink          | New Daniel table                                                                                                 | prototype-bff                                                                            |
| InvestorActionReceipt    | Could project to `UiEventTimeline` upstream                                                                      | prototype-bff (durable here forever — owned by frontend)                                 |
| AdvisoryRecordProjection | Project from Daniel's `AccountIntents` + `RiskSnapshots` + `ExecutionPlans` + `Orders` + `Fills` + `AuditEvents` | hybrid (backend chain exists; profile_version / disclosure_versions come from prototype) |

## Record requirement

Every state-changing investor action produces an `InvestorActionReceipt`. Receipts are surfaced in the Records Center under "Investor actions." When `AdvisoryRecordProjection.source === "backend"`, the projection includes a `references` list linking to Daniel's record ids (intent, plan, order, fill, audit).

## UI implication

- `/us/onboarding/profile` writes through BFF → `InvestorProfileDraft` → on completion promotes to `InvestorProfileSnapshot`. Dev badge visible in non-prod.
- `/us/app/documents` writes through BFF → `DisclosureAcknowledgement`. Disclosure registry projection comes from prototype + static content; renders "Verification pending" until counsel-provided docs and Daniel's registry land.
- `/us/onboarding/activation` writes through BFF → transitions `InvestorLifecycleState` from `onboarding` → `active` and writes `InvestorActionReceipt(action: "activateManagedPolicy")`.
- `/us/app/settings/automation` reads `ManagedPolicyState`; pause/resume actions write through BFF.
- `/us/app/records` lists `InvestorActionReceipt` + `AdvisoryRecordProjection` + ack history.

## Test implication

- **Vitest contract tests** assert every BFF route returns a valid `BffResponse<T>` envelope and includes a receipt on state-changing calls.
- **Prototype-store unit tests** assert immutability invariants (no overwrite of `InvestorProfileSnapshot` for an existing version; append-only for `DisclosureAcknowledgement`, `InvestorActionReceipt`, lifecycle transitions).
- **Playwright** asserts the dev badge appears in non-prod builds wherever `source !== "backend"`, and **does not** appear when env is production.
- **Migration test stub** (skipped until backend lands): asserts dual-read convergence for each entity.
