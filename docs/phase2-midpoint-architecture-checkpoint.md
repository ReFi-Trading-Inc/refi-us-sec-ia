# Phase 2 Midpoint Architecture Checkpoint

**Date:** 2026-05-27
**Branch:** `phase2-ui-bff`
**Head at checkpoint creation:** `d4543d2 feat: add profile reactivation flow`
**Scope:** verify that Surfaces 1–6 form a coherent SEC 203A-2(e) Managed product boundary before Surface 7 (Exception Review).

This checkpoint is documentation-only. It does not introduce, modify, or remove product code.

---

## 1. Current Phase 2 surface inventory

### Surface 1 — Signal vs Managed mode foundation

- **Purpose:** establish the mode-aware UX foundation. Every subsequent surface gates its affordances on `subscription_mode`.
- **User-facing routes:** `/us/app/home`, `/us/app/recommendations`, `/us/app/recommendations/[id]` (mode-aware components only — no new routes).
- **BFF routes:** `GET /api/v1/investor/subscription-mode`, plus mode-aware projections in `GET /api/v1/investor/recommendations` and `GET /api/v1/investor/status`.
- **Prototype-store entities used:** `SubscriptionMode`, `RecommendationProjection`.
- **New entities added:** none in Surface 1; `SubscriptionMode` existed from Phase 1.
- **Action receipt behavior:** `selectMode` action when the user explicitly chooses a mode (path covered by onboarding, not by Surface 1 itself).
- **ManagedExecutionState behavior:** not mutated. Surface 1 reads MES only to render badges/banners.
- **E2E spec:** `apps/web/e2e/mode-branching.spec.ts` (2 tests).
- **Mutates ExecutionPolicy?** No.
- **Can submit broker orders?** No. `useSubmitOrder` was explicitly removed from investor-facing recommendation detail in commit `30aee84`.
- **Per-trade Accept behavior?** None. Surface 1 introduced the tripwire rules that block `AcceptButton`, `accept_trade`, `investor-accept`.

### Surface 2 — Automation Center policy builder

- **Purpose:** investor-facing Execution Policy draft editor. Saving never activates anything; it only persists a draft.
- **User-facing routes:** `/us/app/settings/automation`.
- **BFF routes:** `GET|PUT /api/v1/investor/execution-policy/draft`, `GET /api/v1/investor/managed/state`, `GET /api/v1/investor/execution-policy`.
- **Prototype-store entities used:** `ExecutionPolicyDraft`, `ExecutionPolicy` (read-only), `ManagedExecutionState` (read-only), `SubscriptionMode`.
- **New entities added:** `ExecutionPolicyDraft`.
- **Action receipt behavior:** `saveExecutionPolicyDraft` on PUT, with `inputsHash` and `references: [execution-policy-draft:{accountId}]`.
- **ManagedExecutionState behavior:** not mutated.
- **E2E spec:** `apps/web/e2e/automation-center.spec.ts` (5 tests).
- **Mutates ExecutionPolicy?** No. Draft is mutable; signed `ExecutionPolicy` versions are append-only and only created by Surface 3.
- **Can submit broker orders?** No.
- **Per-trade Accept behavior?** None.

### Surface 3 — Managed activation

- **Purpose:** the only path that promotes a saved draft into a signed, immutable `ExecutionPolicy` version, flips MES → `active`, and ensures `subscription_mode === "managed"`.
- **User-facing routes:** `/us/app/settings/automation/activate`.
- **BFF routes:** `POST /api/v1/investor/execution-policy/activate` (idempotent — header or derived key; replay returns 200 with `idempotentReplay: true`).
- **Prototype-store entities used:** `ExecutionPolicyDraft`, `ExecutionPolicy`, `InvestorProfileSnapshot`, `BrokerageConnection`, `DisclosureDocument`, `DisclosureAcknowledgement`, `SubscriptionMode`, `ManagedExecutionState`, `LifecycleState`, `ActivationIdempotency`.
- **New entities added:** `ActivationIdempotency`.
- **Action receipt behavior:** `activateExecutionPolicy`, with rich `references` (policy, profile, broker conn, lifecycle, MES, subscription mode, ack rows, idempotency key). On replay, `reasonCode: "idempotent_replay"`.
- **ManagedExecutionState behavior:** transitions to `active` with `executionPolicyVersion: N+1`. No transition on replay (idempotent guard short-circuits).
- **E2E spec:** `apps/web/e2e/managed-activation.spec.ts` (7 tests).
- **Mutates ExecutionPolicy?** Yes — this is the one place that calls `appendExecutionPolicy`. New immutable version per successful first-attempt activation.
- **Can submit broker orders?** No. Activation only writes the policy + state machine; broker order submission is server-internal, never investor-callable.
- **Per-trade Accept behavior?** None. Single Activate button; the user signs a policy, not a trade.

### Surface 4 — Managed pause / resume controls

- **Purpose:** investor self-service control of automated execution. Pause/resume mutate `ManagedExecutionState` only.
- **User-facing routes:** controls embedded in `/us/app/settings/automation` (no new route).
- **BFF routes:** `POST /api/v1/investor/managed/pause`, `POST /api/v1/investor/managed/resume`. Routes shipped in earlier phases; Surface 4 only added UI consumers.
- **Prototype-store entities used:** `ManagedExecutionState`, `ExecutionPolicy` (read for version pin).
- **New entities added:** none.
- **Action receipt behavior:** `pauseManaged` / `resumeManaged`. Receipts include `managed-execution-state:{accountId}` reference.
- **ManagedExecutionState behavior:** `active → paused_by_user` (pause), `paused_by_user → active` (resume). `paused_by_system` is refused by the resume route with `system_pause_must_clear_upstream` (412).
- **E2E spec:** `apps/web/e2e/managed-pause-resume.spec.ts` (5 tests).
- **Mutates ExecutionPolicy?** No.
- **Can submit broker orders?** No.
- **Per-trade Accept behavior?** None.

### Surface 5 — Disclosure re-acknowledgement

- **Purpose:** when a disclosure version pinned in the active policy is superseded in the registry, the investor must re-acknowledge before Managed automation continues. The active policy is never mutated by re-ack.
- **User-facing routes:** `/us/app/settings/automation/disclosures`. Blocked banner also renders on `/us/app/settings/automation` when re-ack is required.
- **BFF routes:** `GET /api/v1/investor/disclosures/reacknowledgement` (read-only eligibility view, no receipt), `POST /api/v1/investor/disclosures/reacknowledge` (durable ack write; conditional MES auto-restore).
- **Prototype-store entities used:** `DisclosureDocument`, `DisclosureAcknowledgement`, `ExecutionPolicy`, `ManagedExecutionState`.
- **New entities added:** none — reuses `DisclosureAcknowledgement`.
- **Action receipt behavior:** `acknowledgeDisclosure` (existing taxonomy entry), with references to the new ack row, the unchanged policy version, and (when restored) the MES.
- **ManagedExecutionState behavior:** restored to `active` only when `mesBefore.status === "paused_by_system"` AND `reasonCode.startsWith("stale_disclosure")` AND no stale ack remains. Otherwise untouched.
- **E2E spec:** `apps/web/e2e/disclosure-reack.spec.ts` (8 tests).
- **Mutates ExecutionPolicy?** **No.** Re-acknowledgement deliberately preserves the active policy version. If policy terms also changed, the user goes through Surface 3 instead.
- **Can submit broker orders?** No.
- **Per-trade Accept behavior?** None.

### Surface 6 — Profile reactivation

- **Purpose:** when the active policy's pinned advisory profile version is stale (aging or materially changed), the investor either re-confirms (aging-only) or routes to activation review (material change).
- **User-facing routes:** `/us/app/settings/automation/profile`. Blocked banner also renders on `/us/app/settings/automation`.
- **BFF routes:** `GET /api/v1/investor/profile/reactivation` (read-only eligibility view), `POST /api/v1/investor/profile/reconfirm` (durable confirmation; conditional MES auto-restore; 409 on material change).
- **Prototype-store entities used:** `InvestorProfileSnapshot`, `ExecutionPolicy`, `ManagedExecutionState`, `DisclosureDocument`, `DisclosureAcknowledgement` (read for cross-blocker check).
- **New entities added:** `ProfileConfirmation`.
- **Action receipt behavior:** `refreshProfile` (existing taxonomy entry), with references to the profile snapshot, the new confirmation row, the unchanged policy, and (when restored) the MES.
- **ManagedExecutionState behavior:** aging-only path may restore `paused_by_system` → `active` when `reasonCode.startsWith("stale_profile")` AND no other system-pause blocker remains. Material-change path never touches MES.
- **E2E spec:** `apps/web/e2e/profile-reactivation.spec.ts` (11 tests).
- **Mutates ExecutionPolicy?** **No.** The active policy is preserved across reconfirmation. Material profile change rejects with `material_change_requires_policy_review` and routes the user to Surface 3 to mint a new policy version.
- **Can submit broker orders?** No.
- **Per-trade Accept behavior?** None.

---

## 2. SEC 203A-2(e) product-boundary statement

**ReFi Managed is not a staff-directed advisory product.**

ReFi Managed is a user-authorized digital execution mode where eligible software-generated recommendations may be submitted automatically through a connected broker only inside the investor's signed Execution Policy.

- The user does not accept individual eligible recommendations in Managed mode.
- The user activates, pauses, resumes, updates, or re-signs the Managed execution authority.
- Exception Review applies only when automation cannot proceed under the signed policy.
- No human staff member can create, edit, approve, or tailor client-specific investment advice outside the operational interactive website.

This statement governs every Phase 2 surface. The tripwire (`scripts/tripwire-investor-boundary.ts`) and the contract-test (`scripts/contract-assertions.ts`) enforce it structurally; the e2e suite enforces it behaviorally.

---

## 3. Investor action taxonomy

### A. Mode actions

| Action           | Receipt action ID         | Surface                                              |
| ---------------- | ------------------------- | ---------------------------------------------------- |
| choose Signal    | `selectMode`              | onboarding (Phase 1) / Surface 1 (read-only display) |
| choose Managed   | `selectMode`              | onboarding / Surface 3 (activation implies Managed)  |
| activate Managed | `activateExecutionPolicy` | Surface 3                                            |
| pause Managed    | `pauseManaged`            | Surface 4                                            |
| resume Managed   | `resumeManaged`           | Surface 4                                            |

### B. Eligibility actions

| Action                            | Receipt action ID                                                     | Surface                                                          |
| --------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| acknowledge disclosure            | `acknowledgeDisclosure`                                               | onboarding (initial), Surface 3 (activation), Surface 5 (re-ack) |
| re-acknowledge updated disclosure | `acknowledgeDisclosure` (same ID, distinct route + richer references) | Surface 5                                                        |
| confirm unchanged profile         | `refreshProfile`                                                      | Surface 6                                                        |
| update profile (new snapshot)     | `refreshProfile`                                                      | onboarding (planned Surface 8+)                                  |
| reconnect broker                  | `connectBroker`                                                       | onboarding / Account                                             |
| refresh stale broker data         | (system-driven; no investor action ID)                                | n/a (background)                                                 |

### C. Policy actions

| Action                               | Receipt action ID                               | Surface                           |
| ------------------------------------ | ----------------------------------------------- | --------------------------------- |
| create draft policy                  | `saveExecutionPolicyDraft`                      | Surface 2                         |
| save draft policy                    | `saveExecutionPolicyDraft`                      | Surface 2                         |
| activate policy                      | `activateExecutionPolicy`                       | Surface 3                         |
| re-sign policy after material change | `activateExecutionPolicy` (mints a new version) | Surface 3 (routed from Surface 6) |

### D. Recommendation actions

**Signal mode (advisory only):**

- review
- save (`saveSignal`)
- dismiss (`dismissSignal`)
- act manually outside ReFi (no in-app action — user goes to their broker)

**Managed mode:**

- **no per-trade Accept**
- **no accept-and-execute**
- **no approve-for-execution**
- Exception Review only when automation cannot proceed (planned Surface 7)

The Managed-mode list is enforced by the tripwire's forbidden-id and forbidden-label patterns and by `apps/web/src/lib/sec203a/actions.ts` (`ForbiddenInvestorActionName`).

---

## 4. State model map

| Entity                      | Owner                            | Purpose                                                        | Primary key                                        | Append-only?                                       | User-facing?                              | SEC evidence-bearing?                              | Daniel cutover status                                                                                                                           |
| --------------------------- | -------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | ----------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `SubscriptionMode`          | BFF prototype (G-007 area)       | Signal vs Managed projection                                   | `accountId`                                        | No (overwrite-on-write)                            | Yes (mode badges, banners)                | Indirectly (mode dictates which receipts can fire) | Maps to `Accounts.autopilot_enabled` BOOL — direct translation at cutover.                                                                      |
| `ExecutionPolicy`           | BFF prototype (G-006)            | Investor-signed durable policy artifact (versioned)            | `accountId__v{N}`                                  | Yes                                                | Indirectly (version + summary surfaced)   | Yes — the legal/product fulcrum                    | No backend equivalent. Stays BFF-owned post-cutover; layered atop `Accounts + AccountTemplates + RiskLimits`.                                   |
| `ManagedExecutionState`     | BFF prototype (G-006)            | Runtime status machine                                         | `accountId`                                        | No (overwrite-on-write)                            | Yes (status banner)                       | Indirectly (status drives evidence)                | Decomposed across `Accounts.status` + `ExecutionPlans.status` + `execution_saga.status` + `autopilot_enabled`. BFF derives union at cutover.    |
| `DisclosureDocument`        | BFF prototype (G-005)            | Disclosure registry by `(docId, version)`                      | `docId__version`                                   | Yes                                                | Yes (review surface)                      | Yes                                                | Maps to backend disclosure registry once Daniel publishes one.                                                                                  |
| `DisclosureAcknowledgement` | BFF prototype (G-005)            | Ack rows per `(userId, docId, version)`                        | `userId__docId__version`                           | Yes (idempotent putIfAbsent)                       | Yes (review surface)                      | Yes                                                | Maps cleanly to `UserConsents` / `AccountConsents` (field-for-field rename at cutover).                                                         |
| `InvestorProfileSnapshot`   | BFF prototype (G-003)            | Immutable profile version history                              | `accountId__v{N}`                                  | Yes                                                | Yes (review summary)                      | Yes                                                | Daniel `update_prefs` writes profile fields; BFF retains version history at cutover.                                                            |
| `ProfileConfirmation`       | **BFF only — no backend analog** | Durable record of the _act_ of confirming an unchanged profile | `accountId__v{N}`                                  | Yes (idempotent per version)                       | Yes (review confirmation, Records Center) | Yes — SEC 203A-2(e) evidence enrichment            | Stays BFF-owned post-cutover. Surfaced in Records Center via BFF projection.                                                                    |
| `InvestorActionReceipt`     | BFF prototype                    | Per-action audit log                                           | append-only event log                              | Yes                                                | Yes (Records Center)                      | Yes                                                | Maps to Daniel's `*_procedure_history` tables (account_intent_builder, risk_engine, exec_gateway, portfolio_engine). BFF projection at cutover. |
| `AuthSessionLink`           | BFF prototype (G-007)            | auth_id ↔ account_id binding                                   | `authId__accountId`                                | Yes                                                | No (internal)                             | Indirectly (every receipt carries authId)          | Backend `Accounts.user_id` provides equivalent at cutover.                                                                                      |
| `LifecycleState`            | BFF prototype (G-006)            | Account-level lifecycle (prospect/onboarding/active/...)       | `accountId` (current) + append-only transition log | Mixed (state overwritten, transitions append-only) | Indirectly (active state gates execution) | Yes (transitions logged)                           | `Accounts.status` is the cutover analog for current state; transitions remain BFF audit.                                                        |
| `ActivationIdempotency`     | BFF prototype                    | Idempotency-key → policyVersion map                            | `idempotencyKey`                                   | No (overwrite-on-write; idempotent semantically)   | No (internal)                             | Indirectly (prevents duplicate signed versions)    | Mirrors Daniel's deterministic `intent_id = SHA256({template_id, action_id, account_id})` pattern.                                              |

Future BFF projections (not yet present): `BrokerOrderStatus`, `RecommendationException`, `RecordAccessLog`, `ExceptionReviewQueue`.

---

## 5. ManagedExecutionState transition table

Authoritative state machine for the prototype BFF. The same machine will be projected from Daniel's eventing pipeline at cutover.

| From → To                     | Allowed mechanism                                                                                   | Disallowed mechanisms                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `inactive` → `active`         | Surface 3 activation (`POST /execution-policy/activate`).                                           | Any other route.                                                               |
| `active` → `paused_by_user`   | Surface 4 user pause (`POST /managed/pause`).                                                       | System-driven flips.                                                           |
| `paused_by_user` → `active`   | Surface 4 user resume (`POST /managed/resume`).                                                     | Auto-restore (not invoked here).                                               |
| `active` → `paused_by_system` | Blocker event (background; reason-coded by source).                                                 | User-driven flip.                                                              |
| `paused_by_system` → `active` | Blocker-specific clearing route only (Surface 5 for stale disclosure, Surface 6 for stale profile). | `POST /managed/resume` is refused with 412 `system_pause_must_clear_upstream`. |
| `setup_incomplete` → `active` | Surface 3 activation (after onboarding completes).                                                  | n/a.                                                                           |
| `review_required` → `active`  | Surface 7 exception resolution (planned).                                                           | Direct resume.                                                                 |

Hard rules:

- `paused_by_system` cannot be cleared through normal resume.
- Material profile change cannot be cleared through reconfirmation — it must go through Surface 3 to mint a new policy version.
- Stale disclosure cannot be cleared through normal resume — Surface 5 re-acknowledgement is the only path.

### Blocker reason codes (current convention)

| Reason code                | Originator                 | Cleared by                                         |
| -------------------------- | -------------------------- | -------------------------------------------------- |
| `stale_disclosure_<docId>` | system (Surface 5 trigger) | Surface 5 re-acknowledgement of the latest version |
| `stale_profile_aging`      | system                     | Surface 6 reconfirm (aging path)                   |
| `stale_profile_changed`    | system                     | Surface 3 (activation routed from Surface 6)       |
| `broker_disconnected`      | system / broker driver     | broker reconnect (planned Surface 8)               |
| `broker_data_stale`        | system / market data       | system clears when freshness restored              |
| `market_data_stale`        | system / market data       | system clears when freshness restored              |
| `system_incident`          | system / SRE               | system clears                                      |
| `execution_policy_invalid` | system / policy validator  | Surface 3 re-sign                                  |
| `unsupported_account`      | system / compliance        | n/a (terminal until upstream remediation)          |
| `unsupported_asset`        | system / asset universe    | n/a (system clears)                                |

**The current reason-code list is prototype/BFF-facing.** Daniel's backend remains the authority for backend procedure state at cutover; reason codes will be projected from Daniel's `*_procedure_history.terminal_reason_code` values into this investor-facing set.

---

## 6. Shared blocker model (Surface 7 design contract)

Surface 7 (Exception Review) must consume and emit a single investor-facing blocker model rather than carrying per-blocker variants. The shape below is the design target — **not yet implemented**.

```ts
type ManagedBlocker = {
  blockerId: string;
  blockerType:
    | "profile_stale"
    | "profile_material_change"
    | "disclosure_stale"
    | "broker_disconnected"
    | "broker_data_stale"
    | "market_data_stale"
    | "execution_policy_missing"
    | "execution_policy_paused"
    | "recommendation_exception"
    | "system_incident";
  severity: "info" | "warning" | "blocked";
  userActionRequired: boolean;
  route: string | null;
  source:
    | "bff"
    | "daniel_backend_projection"
    | "broker"
    | "market_data"
    | "system";
  createdAt: string;
  resolvedAt: string | null;
};
```

Constraints for the implementation:

- Surfaces 5 and 6 will project into this model at Surface 7 time without changing their underlying eligibility derivations.
- `recommendation_exception` is the only blocker type that may be Surface-7-specific. Every other type already has a clearing path in Surfaces 3–6.
- `source: "daniel_backend_projection"` is the cutover seam — at cutover, blockers whose source is presently `bff` will flip to `daniel_backend_projection` for the subset Daniel exposes.

---

## 7. Material profile change policy

**Material profile change** means any profile field that affects suitability, strategy selection, risk level, asset universe, guardrails, review triggers, or automation eligibility changed after the active Execution Policy was signed.

### Fields treated as material

- `riskTolerance`
- `liquidityNeed`
- `horizon`
- `goal`
- `incomeBand`
- `netWorthBand` (if/when present)
- `investmentExperience` (`experience` in current schema)
- `accountPurpose`
- `restrictedSectors`
- concentration limits (if/when present)
- tax sensitivity (if/when used by the model)
- account type
- trading permissions

In the current prototype, `InvestorProfileSnapshot` has no concept of "non-material" fields — every snapshot is a full field set. The check for material change is therefore `latestSnapshot.profileVersion > policy.advisoryProfileVersion`. The eligibility route additionally computes `changedFields[]` for surfacing in the UI.

### Rules

1. **Aging-only profile confirmation** can restore Managed if no other system-pause blocker remains.
2. **Material profile change** must route to Managed Activation and create a new `ExecutionPolicy` version. The reconfirm route returns 409 `material_change_requires_policy_review`.
3. **No `ProfileConfirmation` row is written for material change under the old policy.** A confirmation row under the old policy would falsely imply the user accepted the new fields under the old terms — exactly the contract violation we want to prevent.

---

## 8. Daniel backend cutover matrix

| Frontend / BFF concept                | Current prototype entity / route                                    | Daniel backend analog                                                                                                                                                 | Cutover status                                                                      | Open delta                                                                  | Owner                          |
| ------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| `SubscriptionMode`                    | `subscription-modes/*.json` + `GET /subscription-mode`              | `Accounts.autopilot_enabled: BOOL`                                                                                                                                    | Direct translation at cutover.                                                      | None.                                                                       | BFF → backend read at cutover  |
| `ExecutionPolicy`                     | `execution-policies/*.json` + `appendExecutionPolicy`               | **No analog.** Closest split: `Accounts + AccountTemplates + RiskLimits`.                                                                                             | Stays BFF-owned post-cutover.                                                       | Backend has no signed-version artifact.                                     | BFF (permanent)                |
| `ManagedExecutionState`               | `managed-execution-states/*.json` + `/managed/{pause,resume,state}` | Decomposed: `Accounts.status`, `ExecutionPlans.status`, `execution_saga.status`, `autopilot_enabled`.                                                                 | BFF derives union at cutover.                                                       | Reason-code projection needed.                                              | BFF projection                 |
| `InvestorProfileSnapshot`             | `profile-snapshots/*.json`                                          | Profile fields live in `Accounts` prefs + `update_prefs` admin command.                                                                                               | BFF keeps version history; backend writes current.                                  | No backend version table.                                                   | BFF projection                 |
| `ProfileConfirmation`                 | `profile-confirmations/*.json`                                      | **No analog.**                                                                                                                                                        | Stays BFF-owned post-cutover.                                                       | Backend models field values, not the act of re-confirming unchanged values. | BFF (permanent)                |
| `DisclosureDocument`                  | `disclosure-documents/*.json`                                       | (no backend registry yet)                                                                                                                                             | Either Daniel publishes registry, or BFF stays authoritative.                       | Registry source TBD.                                                        | TBD                            |
| `DisclosureAcknowledgement`           | `disclosure-acks/*.json`                                            | `UserConsents` + `AccountConsents` (`consent_key`, `consent_version`, `accepted_at`, `acceptance_source`, `ip_hash`, `user_agent_hash`).                              | Field-for-field rename at cutover.                                                  | Naming aliasing.                                                            | BFF → backend write at cutover |
| `RecommendationProjection`            | `recommendation-projections/*.json`                                 | `template.rebalance.intent` Pub/Sub + `AccountIntents` Spanner table.                                                                                                 | BFF projects backend intents into investor-facing card data.                        | Cleanup of prototype seeded projections.                                    | BFF projection                 |
| Exception Review (Surface 7, planned) | not yet implemented                                                 | `procedure_history.terminal_reason_code` carries blocker reasons; investor-facing exception queue does not exist backend-side.                                        | BFF builds the investor-facing queue from procedure_history projections at cutover. | Investor-facing exception schema does not exist backend-side.               | BFF projection                 |
| `InvestorActionReceipt`               | `action-receipts.jsonl`                                             | `account_intent_builder_procedure_history`, `risk_engine_procedure_history`, `exec_gateway_procedure_history`, `portfolio_engine_procedure_history` + Pub/Sub events. | BFF projects backend rows into per-action receipts at cutover.                      | Procedure_id ↔ receipt_id translation.                                      | BFF projection                 |
| Broker order status                   | (read-only in Phase 1; not surfaced as a Managed product surface)   | `Orders`, `ExecutionPlans.status`, `OrdersCmd` → `orders.evt` Pub/Sub.                                                                                                | BFF projects at cutover for Records Center / Exception Review.                      | None blocking.                                                              | BFF projection                 |
| Records Center                        | (not yet implemented as Phase-2 surface)                            | Reads from `*_procedure_history` + `Orders` + `UserConsents` + `AccountConsents`.                                                                                     | BFF projects at cutover.                                                            | Schema not finalized.                                                       | BFF projection                 |

**Explicit "no backend analog" items (stay BFF-owned indefinitely):**

- `ProfileConfirmation`
- Disclosure re-acknowledgement guard (`disclosure_not_in_active_policy`, `version_matches_active_policy`)
- `material_change_requires_policy_review` 409
- BFF investor-facing blocker projection (shared blocker model, §6)
- `activeExecutionPolicyVersion` as a signed artifact (covered above)
- `ActivationIdempotency` (Daniel uses deterministic `intent_id`; the BFF idempotency record is the investor-facing equivalent)

---

## 9. Test discipline status

### Specs

| Spec                                        | Surface   | Test count | Mode                                    |
| ------------------------------------------- | --------- | ---------- | --------------------------------------- |
| `apps/web/e2e/mode-branching.spec.ts`       | Surface 1 | 2          | parallel                                |
| `apps/web/e2e/automation-center.spec.ts`    | Surface 2 | 5          | parallel                                |
| `apps/web/e2e/managed-activation.spec.ts`   | Surface 3 | 7          | serial (single account writes versions) |
| `apps/web/e2e/managed-pause-resume.spec.ts` | Surface 4 | 5          | parallel                                |
| `apps/web/e2e/disclosure-reack.spec.ts`     | Surface 5 | 8          | serial                                  |
| `apps/web/e2e/profile-reactivation.spec.ts` | Surface 6 | 11         | serial                                  |

**Total: 38 e2e tests across 6 surfaces.**

### Non-e2e gates

- `pnpm --filter @refi/web typecheck` — 0 errors.
- `pnpm tripwire` — 0 violations across 143 scanned files.
- `pnpm contract-test` — 10/10 assertions.
- `pnpm test` (vitest + contract + tripwire) — 9/9 unit tests.
- `pnpm --filter @refi/web build` — green from a clean shell (env determinism handled in commit `40606a5`).

### Known dev-server issue

Individual specs pass cleanly. **Repeated back-to-back runs against a hot Next dev server (Turbopack) can degrade compilation times and induce spurious timeouts** on later specs, especially after a spec compiles a new route. The current practice before important e2e runs is:

```
rm -rf apps/web/.next apps/web/.refi-prototype-store-e2e
```

This is a Next/Turbopack dev-server quirk, not a regression. Production builds and CI parallelism are unaffected. Surface 7 will inherit the same workflow.

---

## 10. Forbidden language and action boundary

### Banned user-facing or action identifiers

(Enforced by `scripts/tripwire-investor-boundary.ts`.)

- `AcceptButton`
- `accept_trade`
- `investor-accept`
- "accept and execute"
- "approve for execution"
- "staff approval", "staff review"
- "founder review", "founder approval"
- "admin approval", "admin action" (user-facing)
- "autopilot" (user-facing)
- "terminal reason" (user-facing)
- "compliance adapter" (user-facing)
- `acceptRecommendation`, `approveTrade`, `approveRebalance`, `adminRebalance`, `manualTradeSubmit`, `manualRebalance`, `forceInference`, `forceTraining`, `forceDataLoad`, `cancelOrder`, `configWrite`, `controlsWrite`, `accountInitialize`, `staffReviewAdvice`, `founderApproveRecommendation`, `editRecommendation`, `triggerRebalance`

### Allowed replacements

- "Review" (advisory affordance)
- "Save" / "Save signal"
- "Dismiss"
- "Act manually" (Signal-mode CTA for off-platform execution)
- "Open in Exception Review" (planned Surface 7 entry point)
- "Confirm profile" (Surface 6)
- "Review updated disclosures" (Surface 5)
- "Activate Managed" / "Activate ReFi Managed" (Surface 3)
- "Pause Managed" / "Pause automation" (Surface 4)
- "Resume Managed" / "Resume automation" (Surface 4)
- "Re-sign policy" / "Review and activate updated policy" (Surface 6 routed to Surface 3)

---

## 11. Surface 7 readiness decision

Surface 7 may begin only after this checkpoint confirms the following invariants. Each is true at HEAD `d4543d2`:

1. **No per-trade Accept exists.** ✓ Verified by tripwire (0 violations / 143 files) and by the 38 e2e tests' forbidden-id / forbidden-label assertions.
2. **Signal actions remain manual.** ✓ Signal users have `signal-review-action`, `signal-save-action`, `signal-dismiss-action`, `signal-act-manually-action` only. `useSubmitOrder` is absent from investor-facing pages.
3. **Managed actions remain policy-level or exception-level.** ✓ Activate / Pause / Resume / Re-acknowledge / Reconfirm are the only state-changing investor actions in Managed mode. No per-trade affordance.
4. **All eligibility blockers share one conceptual model.** ✓ The transition table (§5) is consistent across blockers; the shared blocker schema (§6) is the design target Surface 7 will implement.
5. **Exception Review will not become staff review.** Design constraint locked in §2 and §10. Surface 7 must produce no UI affordance that exposes staff-side or operator-side decision making to the investor.
6. **Exception Review will not become per-trade approval for normal eligible recommendations.** Design constraint locked in §3. Surface 7's `recommendation_exception` blocker type is the only allowed exception-style affordance and it applies only when automation cannot proceed under the signed policy.

**Decision: Surface 7 is cleared to start** under the design contract in §6 and the boundary constraints in §2, §3, and §10. Recommended scope for Surface 7:

- Exception Review queue surface (`/us/app/exceptions` already exists as a placeholder; promote to a real list).
- `GET /api/v1/investor/exceptions` (existing) + `POST /api/v1/investor/exceptions/[id]/resolve` (existing) wired to the shared blocker model.
- The `ExceptionResolution` union in `apps/web/src/lib/sec203a/actions.ts` (`approve_exception`, `reject_exception`, `update_profile`, `reconnect_broker`, `acknowledge_disclosure`, `pause_managed`) is the entire allowed resolution set; nothing else.
- No new prototype-store entity required beyond what's listed in §4. `RecommendationException` may need adding if the existing `exception-review` entity is too narrow.

---

## 12. Verification gates

Run before this checkpoint commit:

```
pnpm --filter @refi/web typecheck   ✓
pnpm tripwire                       ✓ 0 / 143
pnpm contract-test                  ✓ 10/10
pnpm test                           ✓
pnpm --filter @refi/web build       ✓
```

Full e2e suite is intentionally not re-run for this docs-only checkpoint. The most recent green results are recorded in the test discipline section (§9).

---

## 13. Major conclusions

- **The Phase 2 product boundary is internally consistent.** Every state-changing surface (1–6) routes through either a policy action, a mode action, or an eligibility action. No surface exposes a per-trade investor action in Managed mode.
- **The state machine is unified.** ManagedExecutionState transitions are documented (§5) and the auto-restore conditions in Surfaces 5 and 6 are mutually consistent: each is gated on (a) the precise `reasonCode.startsWith` matching its blocker type and (b) the absence of any other outstanding system-pause blocker.
- **The signing artifact stays BFF-owned.** `ExecutionPolicy`, `ProfileConfirmation`, and `ActivationIdempotency` carry the SEC 203A-2(e) evidence load. Daniel's backend models the operational state machine; the BFF retains the signed-artifact layer indefinitely.
- **The cutover surface area is tractable.** Per the matrix (§8), most cutover items are field renames or projection wiring. The "no backend analog" set is small and intentional.
- **No inconsistencies discovered between Surfaces 1–6.** The audit verified that:
  - Re-acknowledgement and reconfirmation both preserve the active policy version.
  - Material profile change routes to Surface 3 and writes no ProfileConfirmation row.
  - `paused_by_system` cannot be cleared by ordinary resume.
  - Idempotent activation does not flip `subscriptionMode` on replay.
  - Disclosure-only ack does not change `ExecutionPolicy.disclosureVersions` (the policy version remains the legal record of the disclosures pinned at signing time).

**Surface 7 is cleared to start** under the constraints documented above.
