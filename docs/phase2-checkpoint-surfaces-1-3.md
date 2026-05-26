# Phase 2 Checkpoint — Surfaces 1–3

**Date:** 2026-05-26
**Branch:** `phase2-ui-bff`
**Head:** `3c8489c` (pushed to `origin/phase2-ui-bff`)
**Base:** `e2930b9` (Phase 1 baseline on `main`)

## Pushed commits

```
3c8489c fix: make managed activation idempotent
e69d3b9 feat: add managed execution activation
40606a5 fix: make web build env deterministic
c1b569e feat: add automation center policy builder
30aee84 fix: remove signal-mode order submission, soften manual cta
2370d19 feat: add signal managed mode foundation
```

Six commits, three product surfaces, two infrastructure fixes. No `Co-Authored-By` footers per Zeshan's directive. Squash-merge not yet performed — branch is review-ready as-is.

## Surface 1 — Signal vs Managed mode foundation (`2370d19`, `30aee84`)

Established the mode-aware UX foundation that every subsequent surface builds on.

**Shipped:**

- `subscription_mode` projection (signal / managed / unset) read from the prototype store.
- `ModeStatusStrip` on the home shell, `ModeBadge` on recommendation list and detail, `data-mode` attribute on every gated component.
- Signal users see four read-only affordances per recommendation card (`signal-review-action`, `signal-save-action`, `signal-dismiss-action`, `signal-act-manually-action`). None submit broker orders.
- Managed users see a status banner + per-card managed posture; review-required items route to the Exception Review placeholder.
- `useSubmitOrder` removed from the investor-facing recommendation detail page (`30aee84`).
- Tripwire patterns added to forbid `AcceptButton`, `accept_trade`, `investor-accept`, and the matching copy phrases.

**E2E:** `apps/web/e2e/mode-branching.spec.ts` (2/2 passing).

## Surface 2 — Automation Center / Execution Policy Builder (`c1b569e`)

Draft-only Execution Policy editor. Saving never activates Managed mode; it only persists a draft.

**Shipped:**

- New entity: `ExecutionPolicyDraft` (mutable per-account working copy; distinct from `ExecutionPolicy`, which is the signed durable artifact).
- New BFF routes: `GET|PUT /api/v1/investor/execution-policy/draft`, `GET /api/v1/investor/managed/state`.
- New action ID: `saveExecutionPolicyDraft` in `InvestorActions` (taxonomy + tripwire updated).
- New page: `apps/web/app/us/app/settings/automation/page.tsx` — seven sections (mode/status header, active policy card, draft builder, "What ReFi may do", "What ReFi will not do", save controls, evidence strip).
- Active-Managed users see a banner stating saved drafts do not affect automated execution until activated.
- All numeric guardrails validated client-side and server-side: USD as decimal strings, percentages as basis points (integers), durations as preset ISO-8601 enums. No FLOAT64 anywhere.
- New api-clients hooks: `useExecutionPolicy`, `useExecutionPolicyDraft`, `useSaveExecutionPolicyDraft`, `useManagedExecutionState`, `usePauseManaged`, `useResumeManaged`.
- Nav: "Automation Center" link added.

**E2E:** `apps/web/e2e/automation-center.spec.ts` (5/5 passing).

## Surface 3 — Managed Execution Activation (`e69d3b9`, `3c8489c`)

The only path that promotes a saved draft into a signed, immutable `ExecutionPolicy` version.

**Shipped (`e69d3b9`):**

- `POST /api/v1/investor/execution-policy/activate` rewritten to read the draft as the single source of truth. Client cannot smuggle different policy contents through the body.
- Fail-closed preconditions (412 with blocked-outcome receipt): `account_not_linked`, `draft_required`, `profile_required`, `broker_not_ready`, `disclosure_unavailable`, `disclosure_not_acked`.
- Server-side computation of `riskGuardrailHash` and `restrictionsHash` (sha256 of sorted-key JSON).
- On success: append immutable `ExecutionPolicy` v(N+1) with full evidence set (signed_at, signed_by_auth_id, signed_ip_hash via HMAC-SHA256, signed_device_fingerprint_hash, correlation_id), transition lifecycle → `active`, set `ManagedExecutionState.status = active`, flip `subscription_mode → managed` when needed.
- New page: `apps/web/app/us/app/settings/automation/activate/page.tsx` — prerequisite checklist, policy summary from draft, acknowledgments, single Activate button.
- New hooks: `useActivateExecutionPolicy`, `useDisclosureRegistry`, `useInvestorStatus`.

**Idempotency hardening (`3c8489c`):**

- New entity: `ActivationIdempotencyRecord` keyed by idempotency key → policyVersion.
- Header-driven (`Idempotency-Key: <X>` → `header:<X>:<accountId>`) or server-derived (`derived:sha256({scope, accountId, draftUpdatedAt, sortedAcks, advisoryAgreementVersion})`).
- `deviceFingerprint` and `correlationId` intentionally excluded from the derivation so refreshes / network replays still dedupe.
- Replay returns HTTP 200 with `{ idempotentReplay: true, subscriptionModeFlipped: false, policy: <existing> }` and emits a receipt with `reasonCode: "idempotent_replay"`. First activation still returns HTTP 201.
- Idempotency lookup runs **after** all fail-closed preconditions: a stale replay still fails closed if any prerequisite has regressed.

**E2E:** `apps/web/e2e/managed-activation.spec.ts` (7/7 passing). New `E2E_USERS.idempotency` account isolates idempotency tests from the parallel UI activation test.

## SEC 203A-2(e) product boundary (preserved across all three surfaces)

The boundary statements below hold under every surface and are enforced by the tripwire + spec assertions, not just by convention.

1. **No per-trade investor acceptance.** No `acceptRecommendation`, `approveTrade`, `accept_trade`, `investor-accept`, `AcceptButton` identifiers or matching copy phrases anywhere in the investor app. Managed runs from the active `ExecutionPolicy`; Signal is advisory only.
2. **No broker order submission from Signal.** `useSubmitOrder` does not appear in any investor-facing page or hook. Confirmed in tripwire and in the recommendation-detail spec.
3. **No operator commands from the investor app.** Admin endpoints (`admin-portal`, `/admin-actions`, `/operations/force-*`, `/internal/launch-*`, `/trading-controls/*`, etc.) cannot be referenced from `apps/web/**`.
4. **No staff approval / founder review.** Forbidden identifiers `founderApproveRecommendation`, `staffReviewAdvice`, `staff approval`, `founder approval`, `operator approval` are tripwired.
5. **Activation is the only path to a signed policy version.** Saving a draft never appends a new `ExecutionPolicy`. Pause/Resume mutates `ManagedExecutionState` only, never the policy version. Surface 3 activation is the sole `appendExecutionPolicy` caller from the investor route tree.
6. **Investor view/download/export ≠ investor action.** Read events emit `RecordAccessLog`, not `InvestorActionReceipt`. The two audit classes remain disjoint (asserted by contract-test).
7. **No FLOAT64 across the BFF boundary.** USD values flow as `DecimalString`; percentages as integer basis points; durations as preset ISO-8601 enums.

## Daniel backend reconciliation status

Full reconciliation performed against `/Users/za/Library/CloudStorage/Dropbox/Nature Of Commerce LLC/ReFi/Website/Daniels Back End/refinity-main-main` (operates as final truth per `memory/scope_repo_boundary.md`).

**Outcome:** No must-fix gaps before push. All deltas are bucket-2 (BFF-owned prototype state, gap G-006) and expected under the documented migration plan.

**Confirmed matches:**

- No per-trade Accept in Daniel either (Signal-mode intents sit at `status="ready"` awaiting next template signal).
- Broker order submission is internal to `trade-manager` service via Pub/Sub; not investor-callable. Boundary preserved.
- `correlation_id` propagation pattern matches: UUID per request, written to every `procedure_history` row + Pub/Sub attribute.
- Disclosure ack model closely matches: ours `{docId, version, userId, ipHash, userAgentHash, acceptanceSource}` ↔ Daniel's `UserConsents{consent_key, consent_version, user_id, ip_hash, user_agent_hash, acceptance_source}`. Renaming at cutover is mechanical.
- Pause/Resume semantics align with Daniel's admin actions `pause_autopilot` / `resume_autopilot` (boundary inversion: investor-callable in our BFF; admin-callable in Daniel — at cutover the BFF mediates).

**Adopted from Daniel:** the idempotency-key pattern (`3c8489c`) mirrors Daniel's deterministic `intent_id = SHA256({template_id, action_id, account_id})` dedup discipline.

## Known backend cutover deltas (defer-acceptable)

| Frontend artifact                                                                                                                                                                          | Daniel-side state                                                                                                                                             | Migration approach                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ExecutionPolicy` (signed, versioned, immutable)                                                                                                                                           | No equivalent. Split across `Accounts.autopilot_enabled`, `AccountTemplates.active`, `RiskLimits.*`.                                                          | Frontend keeps the artifact; it is the SEC 203A-2(e) evidence layer Daniel does not model. BFF dual-reads at cutover. |
| `subscription_mode` enum `signal\|managed`                                                                                                                                                 | `Accounts.autopilot_enabled: BOOL`                                                                                                                            | Direct translation.                                                                                                   |
| `ManagedExecutionState.status` enum (6 values)                                                                                                                                             | Decomposed across `Accounts.status`, `ExecutionPlans.status`, `execution_saga.status`, `autopilot_enabled`.                                                   | BFF derives the union at cutover.                                                                                     |
| `account_id` format `acct-${authId}`                                                                                                                                                       | Freeform `STRING(MAX)` (e.g., `acc1`).                                                                                                                        | BFF identity-translation layer at cutover.                                                                            |
| Draft fields `maxSingleOrderUsd`, `maxPositionSizeBps`, `dailyOrderLimit`, `dailyLossPauseBps`, `drawdownPauseBps`, `maxOpenOrders`, `staleBrokerDataPauseAfter`, `staleProfilePauseAfter` | No backend home. `ACCOUNT_ADMIN_PREF_FIELDS = {drift_threshold, min_order, excluded_assets, fractional_enabled}` is the only `update_prefs` surface.          | Lobby for new backend fields OR persist as BFF-only projection layered atop Daniel's narrower preferences.            |
| `assetUniverse: string[]` (investor-set)                                                                                                                                                   | Template-set in `TemplateTargets(template_id, version)`.                                                                                                      | At cutover, becomes read-only metadata derived from selected template.                                                |
| `restrictedSectors`                                                                                                                                                                        | No backend field.                                                                                                                                             | Document as BFF-projection; consider lobbying for `RiskLimits.compliance.restricted_sectors`.                         |
| `pauseRules: string[]`                                                                                                                                                                     | No analog; pause rules live as operator settings in `RiskLimits.staleness` / `RiskLimits.compliance` JSON.                                                    | Document.                                                                                                             |
| `advisoryAgreementVersion`                                                                                                                                                                 | No versioning table; closest is a `consent_key = "terms_of_service"` row.                                                                                     | Map to consent at cutover; advisory-agreement is an SEC evidence enrichment we keep.                                  |
| Error envelope `{error:{code,message,details},meta}`                                                                                                                                       | Daniel HTTP returns `HTTPException(detail={status, dispatch_state, message})`; Pub/Sub services use reason-codes in `procedure_history.terminal_reason_code`. | BFF translation layer at cutover.                                                                                     |
| Activation receipt                                                                                                                                                                         | Closest analog: `account_intent_builder_procedure_history` row + Pub/Sub events.                                                                              | BFF reads `procedure_history` + maps to receipt projection.                                                           |

**Should-fix-before-prod (deferred):**

- Server-side `strategyId` validation against a known template catalog.
- Consent-key aliasing (accept both our `docId/version` and Daniel's `consent_key/consent_version` names).
- BFF correlation-id forwarding to downstream Daniel admin commands.
- `REQUIRED_CONSENTS` source-of-truth intersection check (never let UI present fewer disclosures than backend requires).

## Test gate results at checkpoint

```
pnpm --filter @refi/web typecheck        ✓
pnpm tripwire                            ✓  0 violations across 133 files
pnpm contract-test                       ✓  10/10
pnpm test                                ✓  contract + tripwire + vitest 9/9
pnpm --filter @refi/web build            ✓  (clean shell; NEXT_PUBLIC_REFI_ENV=prod still fails strict, as designed)
pnpm e2e automation-center.spec.ts       ✓  5/5
pnpm e2e mode-branching.spec.ts          ✓  2/2
pnpm e2e managed-activation.spec.ts      ✓  7/7
```

Total e2e coverage: 14 cases passing; 0 flakes on retry-clean runs.

## Next surface recommendation

**Pick Surface 4 from the candidates below before proceeding** (Zeshan's call). All three are well-scoped and each independently advances the SEC 203A-2(e) story.

1. **Pause / Resume Managed UI (recommended first).** The lowest-risk next surface. Hooks `usePauseManaged` / `useResumeManaged` already exist; the BFF routes are shipped. The work is purely UI: a Pause button on the Automation Center when MES is `active`, a Resume button when MES is `paused_by_user`, plus the banner copy variants. Aligns directly with Daniel's `pause_autopilot` / `resume_autopilot` admin actions, so it's "boundary-preserving" at cutover. Estimated 1 commit.
2. **Disclosure re-acknowledgement flow.** When a disclosure version supersedes the active policy version, surface an inline ack flow that produces a new `disclosure-ack` and either re-activates (calls the existing activate route, which is now idempotency-aware) or surfaces a "needs reactivation" prompt. Estimated 2 commits.
3. **Profile-staleness reactivation.** When `pauseOnProfileSuperseded` triggers `paused_by_system`, give the investor a guided path back to active via profile update + reactivation. Larger scope — touches profile entity + lifecycle + activation. Estimated 2–3 commits.

My recommendation: ship **(1) Pause / Resume Managed UI** next. It closes the Surface-3 loop (an investor who activates Managed must be able to pause it self-service), it's the smallest unit of new code, and it gives us a clean dress-rehearsal for the BFF-to-Daniel-admin translation pattern that the cutover will require for every state-change action.
