# Decision Log

**Purpose:** single source of truth for partner/phase decisions; Claude and humans both read and update this.

**Maintenance rule:** new decisions are appended with date + owner; status changes are edited in place, never deleted.

**Provenance:** seeded 2026-08-08 from `Dan_Decision_Tracker_ReFi_Phase2_5.xlsx` (sheets: Dashboard, Decision Tracker, Surface Blocker Map, Dan Reply Capture, Fixture Matrix, Implementation Gates, Reference Map, Lists). Sheet decision IDs (`DAN-00x`) are preserved alongside log IDs (`D-00x`). **Reconciled 2026-08-08** against `docs/phase2-6-daniel-answer-resolution.md` (2026-05-30, answers all four tracker questions) and `docs/phase2-7-daniel-direction-resolution.md` (Daniel's written integration direction received 2026-07-28, folded in via commit `52f136d`; authoritative where it conflicts with the 2026-05-30 record). The xlsx was a stale snapshot (last updated 2026-05-29); this log, not the xlsx, is current. **Updated 2026-08-17** with Daniel's reply to the six-question ask (`docs/phase2-7-daniel-contract-mechanics-resolution.md`), which closes D-012 through D-018, closes the shape half of D-010, dates D-011, and opens D-019. **Updated 2026-08-19** with Daniel's reply to the three-item connection ask (`docs/phase2-7-daniel-connection-mechanics-resolution.md`), which closes the residual D-010 and closes D-019, narrows the 2026-08-17 `amr`/`acr` reading, and supplies the JWKS/rotation values and the dev hostname. **No contract question is open as of 2026-08-19** — D-011 is a delivery dependency, not a question.

**Status vocabulary:** DECIDED / OPEN / BLOCKED. Sheet status "Awaiting Dan" is mapped to OPEN (waiting on Daniel's answer). The sheet's full status vocabulary was: Awaiting Dan, Answered, Needs Clarification, Resolved, Blocked, Deferred.

---

## Open questions

D-001 through D-009 are DECIDED (see each entry's Resolution). D-012 through D-018 were answered by Daniel's 2026-08-17 reply — see [`../phase2-7-daniel-contract-mechanics-resolution.md`](../phase2-7-daniel-contract-mechanics-resolution.md). **D-010 and D-019 were closed by his 2026-08-19 reply** — see [`../phase2-7-daniel-connection-mechanics-resolution.md`](../phase2-7-daniel-connection-mechanics-resolution.md).

**No contract question is open as of 2026-08-19.** The one remaining row is a delivery dependency:

| ID    | Decision / question                                                                                                                                         | Status                                                                                                                                                                                                                                                                                                                                                                            | Owner  | Source                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| D-011 | Dev connection package (final endpoint, WIF values, seeded test IDs, deployed contract/image versions, exported `v1.0.0-dev.1`, deterministic dev fixtures) | BLOCKED — dated ≈ 2026-08-31 for the `investor-api` deployment, package follows once the service and dev fixtures exist. **Partially unblocked 2026-08-19:** the assertion profile is approved and the dev issuer, audience and hostname are agreed (§3 of connection-mechanics), so the BFF side can be built now — Daniel: "You can continue against these contract decisions." | Daniel | phase2-7 §8; contract-mechanics §2, §6; connection-mechanics §3, §5 |

Ours, not Daniel's — tracked here because D-011 cannot fully close without it:

| Item                                                                                                           | Status                                                                                                              | Owner  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------ |
| Provision `bff-dev.refi.trading` so the JWKS URL `https://bff-dev.refi.trading/.well-known/jwks.json` resolves | OPEN — hostname agreed 2026-08-19, not yet provisioned; keep the URL configurable on Daniel's side until it is live | Zeshan |

Confirmations / stated assumptions (no response required; will be verified against the exported contract):

- **D-016 — Template discovery:** RESOLVED AS CONFIRMATION, **explicitly confirmed by Daniel 2026-08-17**: "Template discovery will use a dedicated investor-api projection, not the Admin Portal route." The investor template adapter stays contract-bound until `v1.0.0-dev.1` defines that projection.
- **A-001 — SSE transport:** **CONFIRMED by Daniel 2026-08-17**: "The browser should subscribe through the BFF-proxied SSE route, while investor-api performs the authoritative account filter before emitting any event." No direct browser→investor-api streaming.
- **D-011** (connection package) remains tracked above. **D-010 is closed** — see below.
- **`amr` is the required v1 method claim (2026-08-19).** This NARROWS the 2026-08-17 record of "amr or acr". `acr` is additive and may arrive later; it is never a substitute. The permissive reading was implemented and has been corrected — an `acr`-only or empty-`amr` assertion is now refused at mint. See connection-mechanics §1.
- **`auth_time` must never be re-stamped (2026-08-19).** The BFF preserves it in the server-side session and copies it into every assertion; only a new underlying authentication or a step-up moves it.
- **JWKS/rotation (2026-08-19):** investor-api caches 5 minutes, refreshes once on an unknown `kid` and retries once before failing closed, and uses **only** the explicitly configured JWKS URL — never derived from `iss`. **Our required rotation overlap is a minimum of ten minutes.** Emergency revocation is explicit invalidation, not TTL expiry.

FYI item (not a decision, and deliberately EXCLUDED from the architecture reply per 2026-08-08 review — send separately as an engineering issue): admin-portal publishes `dev-training.requested` unprefixed while the scheduler subscribes to the prefixed topic — Daniel-side bug, no evidence it was ever reported (`docs/phase2-6-repo-observation-report.md` §8 item 8).

Deferred (decided-as-deferred, not open questions): investor `liquidate_all` and investor cancellation of `pending_submit` orders — see D-009.

---

## Decisions

### D-001 — Risk reason-code partition: REVIEW vs DENY

- **Sheet ID:** DAN-001
- **Status:** DECIDED (was OPEN in xlsx; sheet: "Awaiting Dan")
- **Resolution (2026-05-30):** There is no REVIEW/DENY partition — **every persisted `RiskDecision.decision = "rejected"` is a backend hard stop (DENY); risk verdicts are binary ALLOW | DENY.** All four codes (LEVERAGE_LIMIT, VAR_LIMIT, SINGLE_NAME_CONC_LIMIT, SECTOR_CONC_LIMIT) are DENY; no frontend can clear a rejected risk decision. The Phase 2.5 assumption (LEVERAGE_LIMIT/VAR_LIMIT → REVIEW) was wrong. Operational fast-rejects (STALE_PRICES, BROKER_UNAVAILABLE, RETRY_PRICES) and control-state outcomes (`TradingControlStates`) are separate, non-risk semantics; BFF-side REVIEW may exist only for those non-risk blockers. Exception Review (Surface 10) does not override risk rejects. Source: `docs/phase2-6-daniel-answer-resolution.md` §Q1. Reaffirmed by `docs/phase2-7-daniel-direction-resolution.md` §5/§9 ("a backend risk rejection remains terminal for its intent"). Implemented in commit `bbb603c` "fix(risk): enforce binary risk verdicts" (2026-07-30). History: asked (xlsx, 2026-05-29) → answered (phase2-6 doc, 2026-05-30) → implemented (bbb603c, 2026-07-30).
- **Priority:** Critical
- **Owner:** Daniel (follow-up owner per Dan Reply Capture: Zeshan)
- **Due date (per sheet):** 2026-05-30 — **Last updated (per sheet):** 2026-05-29
- **Question for Dan:** Confirm how each risk-engine rejection reason maps into investor product status: REVIEW or DENY.
- **Backend evidence:** `apps/risk-engine/src/models.py:132-144`. `RiskDecision.decision = approved | rejected` with `reasons: list[RiskReason]`. Codes seen: LEVERAGE_LIMIT, SINGLE_NAME_CONC_LIMIT, SECTOR_CONC_LIMIT, VAR_LIMIT.
- **Current assumption:** LEVERAGE_LIMIT and VAR_LIMIT map to REVIEW. SINGLE_NAME_CONC_LIMIT and SECTOR_CONC_LIMIT map to DENY.
- **Dan answer:** — **Decision outcome:** —
- **Blocks surfaces:** Surface 9 Eligibility; Surface 10 Exception Review; Surface 13 Broker submission
- **Gap rows:** GAP-REC-003; GAP-REC-004
- **Adapter impact:** Defines `risk.approved` / `risk.rejected` adapter mapping into ALLOW / REVIEW / DENY.
- **Contract update needed:** Yes. Lock RiskReason.code partition in Contract V2 and Gap Register V2.
- **Fixture update needed:** Yes. Add approved, reviewable rejection, hard-deny rejection, and unknown code fixtures.
- **Next action:** Wait for Daniel. Do not write executable risk adapter before answer lands.
- **Notes:** If Daniel adds stale-data, broker-state, control-state, unsupported-asset classes, classify each explicitly.
- **Reply capture:** Dan raw reply: — | Parsed decision: — | Follow-up needed: Yes — "Classify each RiskReason.code into REVIEW or DENY." | Contract patch: Yes | Gap Register patch: Yes | Fixture patch: Yes | Implementation ticket: "Adapter ticket: risk verdict mapper"

### D-002 — template_id registry and discovery shape

- **Sheet ID:** DAN-002
- **Status:** DECIDED (was OPEN in xlsx; sheet: "Awaiting Dan") — consumption path later superseded by Phase 2.7
- **Resolution (2026-05-30, consumption path revised 2026-07-28):** **Canonical registry is Spanner-backed** (tables: `templates`, `template_membership`, `template_rules`, `AccountTemplates`, `TemplateTargets`, `TemplateTargetAffectedStreams`, `portfolio_registry`); Pub/Sub announces runtime actions, not registry truth — discovery is pull/read. No standalone `strategy_id` (strategy identity = `stream_id + strategy_source`); no template-level minimum account requirement. Source: `docs/phase2-6-daniel-answer-resolution.md` §Q2. **Partially superseded:** the Phase 2.6 plan to consume Admin Portal `GET /api/v1/portfolio/templates` from the BFF was rejected by Daniel — "I dont want the investor BFF to use the broad Admin Portal API as an interim investor boundary"; templates are consumed via the dedicated `investor-api` service instead (see D-007). Source: `docs/phase2-7-daniel-direction-resolution.md` §3. The registry answer (Spanner canonical, pull/read) stands; only the access path changed. Related implementation: commit `0e9a73e` "fix(boundary): enforce investor API and Signal-only limits" (2026-07-30). History: asked (xlsx, 2026-05-29) → answered (phase2-6 doc, 2026-05-30) → access path revised (phase2-7 doc, 2026-07-28) → boundary enforced (0e9a73e, 2026-07-30). Surface 5 activation itself still awaits the dev connection package (D-011).
- **Priority:** Critical
- **Owner:** Daniel (follow-up owner per Dan Reply Capture: Zeshan)
- **Due date (per sheet):** 2026-05-30 — **Last updated (per sheet):** 2026-05-29
- **Question for Dan:** Confirm how the BFF should enumerate templates and read display metadata for Managed activation.
- **Backend evidence:** template_id appears across `template.rebalance.intent`, `template.admin`, admin-portal `pubsub_mgr.py:109-138`, and account-intent-builder `processor.py:384-470`.
- **Current assumption:** Templates are first-class objects, but canonical discovery source is unknown.
- **Dan answer:** — **Decision outcome:** —
- **Blocks surfaces:** Surface 5 Managed activation
- **Gap rows:** GAP-TEMPLATE-001
- **Adapter impact:** Defines template discovery BFF route, template selection UX, and join_template activation payload.
- **Contract update needed:** Yes. Add canonical endpoint/table/topic, payload shape, and announcement model.
- **Fixture update needed:** Yes. Add template list, missing template, retired template, and unsupported template fixtures.
- **Next action:** Wait for canonical source and display payload shape.
- **Notes:** Without this, investor has no clean path into Managed mode.
- **Reply capture:** Dan raw reply: — | Parsed decision: — | Follow-up needed: Yes — "Provide canonical template registry source and payload." | Contract patch: Yes | Gap Register patch: Yes | Fixture patch: Yes | Implementation ticket: "Adapter ticket: template discovery"

### D-003 — signal: 0 preservation

- **Sheet ID:** DAN-003
- **Status:** DECIDED (was OPEN in xlsx; sheet: "Awaiting Dan")
- **Resolution (2026-05-30):** **`signal: 0` is preserved** — both RF and RL streams can emit it; the behavior is source-independent (Component E starts neutral at 0, carries the prior label until a threshold crossing; after warmup 0 is uncommon). **`signal: 0` does not by itself close positions** — treat as neutral / no new stance; account-level action requires downstream evidence (`TemplateTargets`, `AccountIntents` zero-weight/closing legs). The Phase 2.5 "hold" framing was wrong: `RecommendationProjection.action` drops `"hold"` in favor of `"neutral"` or no projection; per FIC line 98, "Do not display `0` as a third investment stance." The `signals` table is a latest-state table per stream (PK `stream_id`), not history. Source: `docs/phase2-6-daniel-answer-resolution.md` §Q3. Implementation: no single dedicated commit identified; the type/fixture realignment landed via Phase 2.6 PR-C (commit `5d68f27` "Phase 2.6 PR-C: type and fixture realignment (path C)") — attribution to that commit is inferred from the PR sequence, not verified line-by-line. History: asked (xlsx, 2026-05-29) → answered (phase2-6 doc, 2026-05-30) → implemented (PR-C realignment, inferred).
- **Priority:** High
- **Owner:** Daniel (follow-up owner per Dan Reply Capture: Zeshan)
- **Due date (per sheet):** 2026-05-31 — **Last updated (per sheet):** 2026-05-29
- **Question for Dan:** Confirm whether signal: 0 rows are emitted to the signals table or suppressed upstream.
- **Backend evidence:** `apps/inference-worker/tests/test_stream_signal_publishing.py:74-110`. Signal rows carry signal in {-1, 0, 1}.
- **Current assumption:** Contract V2 is defensive and keeps signal: 0 until Daniel confirms wire behavior.
- **Dan answer:** — **Decision outcome:** —
- **Blocks surfaces:** Fixture catalog; hold recommendation path
- **Gap rows:** GAP-SIGNAL0-001
- **Adapter impact:** Decides whether hold projections are realistic or should be suppressed.
- **Contract update needed:** Maybe. If signal:0 is suppressed, remove or narrow hold branch language.
- **Fixture update needed:** Yes. Keep or remove hold fixtures based on answer.
- **Next action:** Wait for Daniel. Does not block adapter shape.
- **Notes:** Ask whether behavior differs by strategy_source, for example RF vs RL.
- **Reply capture:** Dan raw reply: — | Parsed decision: — | Follow-up needed: No — "Only needed if answer is strategy-dependent." | Contract patch: Maybe | Gap Register patch: Maybe | Fixture patch: Yes | Implementation ticket: "Fixture ticket: signal zero realism"

### D-004 — ExecutionPolicy ownership

- **Sheet ID:** DAN-004
- **Status:** DECIDED (was OPEN in xlsx; sheet: "Awaiting Dan") — answer materially rewritten by Phase 2.7 direction
- **Resolution (2026-05-30, rewritten 2026-07-28):** The question dissolved: **no per-account versioned `ExecutionPolicy` record exists in the trusted backend contract**, and neither Bucket 2 nor Bucket 3 applies. The only code `ExecutionPolicy` (`apps/common/snaptrade_driver.models.ExecutionPolicy`) is an internal broker-driver object, never surfaced to investors. There is no `policy_id`/`policy_version` envelope field; Exec Gateway does not validate them. Backend-owned account-execution state is `AccountPrefs`, `AccountConsents`/`UserConsents`, `RiskLimits`, `TradingControlStates`/`Events`, `TradeInputSnapshots`. Surface 4 was reframed as the "Account Controls Center." Source: `docs/phase2-6-daniel-answer-resolution.md` §Q4. **Materially rewritten by Phase 2.7 (§4, rewrites Contract V3 §13.1):** `AccountPrefsHistory` lives backend-side in the same Spanner DB as `AccountPrefs`, with one canonical transactional writer updating prefs + history atomically; the frontend's interim history "should not become the long-term system of record"; investor-editable fields are **exactly four** (`drift_threshold`, `min_order`, `excluded_assets`, `fractional_enabled`); `RiskLimits` and controls are read-only; trading-expanding changes require fresh disclosure re-acknowledgment per a versioned backend policy (not a frontend decision). Source: `docs/phase2-7-daniel-direction-resolution.md` §4 (including the 2026-07-30 correction removing seven mis-scoped controls). Implemented in commit `ff98743` "fix(prefs): restrict investor AccountPrefs to supported fields" (2026-07-30). History: asked (xlsx, 2026-05-29) → answered (phase2-6 doc, 2026-05-30) → rewritten (phase2-7 doc, 2026-07-28/30) → implemented (ff98743, 2026-07-30). See also D-008.
- **Priority:** Critical
- **Owner:** Daniel (follow-up owner per Dan Reply Capture: Zeshan)
- **Due date (per sheet):** 2026-05-30 — **Last updated (per sheet):** 2026-05-29
- **Question for Dan:** Choose whether versioned ExecutionPolicy stays BFF-owned or moves to GitLab-side per-account storage.
- **Backend evidence:** exec-gateway enforces policy at orders.cmd derivation in `apps/exec-gateway/src/models/domain.py`. Per-account policy record not found in refinity-main.
- **Current assumption:** BFF currently owns versioned ExecutionPolicy and carries policy_id / policy_version into envelopes.
- **Dan answer:** — **Decision outcome:** —
- **Blocks surfaces:** Surface 4 Automation Center; Execution Policy UX; proof-of-consent record
- **Gap rows:** GAP-MODE-004; GAP-EX-002
- **Adapter impact:** Defines policy write path, read path, consent record ownership, and exec-gateway trust boundary.
- **Contract update needed:** Yes. Bucket 2 or Bucket 3 must be reflected in Contract V2 and Gap Register V2.
- **Fixture update needed:** Yes. Add active policy, superseded policy, revoked policy, missing policy, unknown version fixtures.
- **Next action:** Wait for Daniel. Do not ship policy UX before ownership is settled.
- **Notes:** Storage owner also owns signed proof-of-consent. Do not split audit trail.
- **Reply capture:** Dan raw reply: — | Parsed decision: — | Follow-up needed: Yes — "Choose Bucket 2 or Bucket 3 and define consent storage owner." | Contract patch: Yes | Gap Register patch: Yes | Fixture patch: Yes | Implementation ticket: "Surface 4 ticket: execution policy ownership"

### D-005 — Integration environment and promotion sequencing

- **Added:** 2026-08-08 (not in xlsx) — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-07-28
- **Decision:** `refinity-dev` is the only active deployment, intentionally; integration completes in dev and produces a reproducible first dev release before staging/production enter CI/CD. Promotion sequence: dev release reproducible → conformance + isolation tests pass → promote the same versioned infrastructure and immutable images to staging → validate release candidate → first production Signal cohort → Managed paper trading only after paper execution/control scenarios pass. `api.dev.refi.trading` is a nice-to-have; the generated Cloud Run URL suffices. Invalidates plans treating staging as the integration target and the non-resolving production `NEXT_PUBLIC_API_BASE_URL`.
- **Source:** `docs/phase2-7-daniel-direction-resolution.md` §1. Folded in via commit `52f136d` (2026-07-28).

### D-006 — Identity, sessions, and account mapping

- **Added:** 2026-08-08 (not in xlsx) — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-07-28
- **Decision:** `identity-ccid` is the investor identity/onboarding service and issues a stable opaque `user_id`; emails, IdP subjects, and wallet addresses are linked identifiers, not IDs. One user maps to zero, one, or many accounts via `Accounts.user_id`; every account request is re-authorized against that relationship — a BFF/browser-supplied `account_id` is never sufficient. The investor BFF owns the browser session, minting it from a short-lived, single-use, asymmetrically signed identity-ccid assertion (published JWKS). Mutable facts (KYC, eligibility, consent, etc.) are never embedded as durable token permissions — checked against current backend state per request. Email-first onboarding approved and must not require a wallet; **`auth-siwe` is not the primary login** (wallet signature only later links an address to an existing `user_id`). Admin Portal account-population must not back any public signup path. Identity is separate from advisory authorization.
- **Source:** `docs/phase2-7-daniel-direction-resolution.md` §2 (closes D8 of the mock-boundary map; opens `GAP-IDENTITY-018`, `GAP-MULTIACCT-019`). Implemented in commits `dc38fae` "fix(identity): separate identity from wallet linking" (2026-07-30) and `13fd40e` "test(e2e): mint valid seeded session JWTs" (2026-07-31). Full identity-ccid exchange (PR-E″) remains blocked on identity-ccid deployment.

### D-007 — Investor backend boundary: dedicated investor-api, Admin Portal rejected

- **Added:** 2026-08-08 (not in xlsx) — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-07-28
- **Decision:** Daniel (verbatim): "I dont want the investor BFF to use the broad Admin Portal API as an interim investor boundary." A dedicated **`investor-api`** service (prefix `/api/v1/investor`, env `refinity-dev`) enforces account ownership, field allowlists, redaction, rate limits, and investor action auditing at the backend boundary. Service auth: Google OIDC tokens via Workload Identity Federation + SA impersonation, no long-lived JSON key; user context via a short-lived signed assertion (plain user-ID header not trusted); `X-Correlation-ID` tracing; `Idempotency-Key` required on mutations; contract `v1.0.0-dev.1`; 10s/≤2-jittered-retry reads, no blind mutation retry, 202 + receipt for async. Streaming via account-scoped `GET /api/v1/investor/accounts/{account_id}/events`, not Admin Portal `/api/v1/stream`. Overturns Contract V3 §13.2 and the entire Admin Portal consumption map; PR-E replaced by a typed client (PR-E′). The BFF becomes a typed client + session boundary with defence-in-depth ownership assertion, not the ACL.
- **Source:** `docs/phase2-7-daniel-direction-resolution.md` §3, §6, §7. Implemented (boundary/tripwire side) in commit `0e9a73e` "fix(boundary): enforce investor API and Signal-only limits" (2026-07-30); end-to-end client blocked on the dev connection package (D-011).

### D-008 — AccountPrefs writes and preference history

- **Added:** 2026-08-08 (not in xlsx; supersedes the Phase 2.6 Option 3c follow-up under D-004) — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-07-28
- **Decision:** `AccountPrefsHistory` lives in the same Spanner database as `AccountPrefs`; backend owns current prefs and durable history; one canonical transactional writer updates both atomically (Admin Portal and investor path share it; direct writes prohibited). Investor-editable fields: exactly `drift_threshold`, `min_order`, `excluded_assets`, `fractional_enabled`. `RiskLimits`, template risk settings, broker state, operator/system controls are read-only; no frontend capital-allocation percentage control. Every write requires authenticated confirmation + immutable action receipt; trading-expanding changes additionally require fresh disclosure re-acknowledgment, per a versioned backend policy (not a frontend decision). Seven-year retention + legal hold; salted IP/UA hashes; no device fingerprinting for alpha. BFF-facing routes: GET/PATCH `/api/v1/investor/accounts/{account_id}/preferences` and GET `.../preferences/history`. Option 3c (TS port + parity fixtures + sidecar) dropped. Resolves gaps `GAP-PREFS-HISTORY-001/WRITE-002/AUDIT-003` in architecture (blocked only on investor-api deployment).
- **Source:** `docs/phase2-7-daniel-direction-resolution.md` §4, including the 2026-07-30 correction that removed seven mis-scoped investor-editable controls (`maxPositionSizeBps`, `minimumCashReserveBps`, and five backend-owned risk limits) from the Automation Center. Implemented in commit `ff98743` "fix(prefs): restrict investor AccountPrefs to supported fields" (2026-07-30).

### D-009 — Investor-safe backend action set

- **Added:** 2026-08-08 (not in xlsx) — **Status:** DECIDED (one wire-spelling sub-item open, see D-010) — **Owner:** Daniel — **Decided:** 2026-07-28
- **Decision:** Approved investor actions: `join_template`, `leave_template` (no implied liquidation), `update_prefs` (four fields, canonical writer), `pause_autopilot` (Managed paper; prevents new/increased exposure), `resume_autopilot` (only clears the investor's own request; cannot clear a stronger restriction), and investor **`reduce_only`** (allowed — Managed paper; reductions/closeouts only). **`liquidate_all` is deferred** until confirmation/preview/step-up/idempotency/partial-fill/unknown-state/lifecycle scenarios pass in paper testing; investor cancellation of `pending_submit` orders remains deferred (ownership-boundary rationale). Backend computes the strongest effective control across investor/risk/reconciliation/broker/operator sources. Actions go through `POST /api/v1/investor/accounts/{account_id}/actions` with re-authorization, gates, step-up auth, idempotency, and an action receipt before any backend command. Records Center ships investor-safe decision receipts only — the full Admin Portal audit packet is not exposed (allowlisted order/fill/recon packet is next-alpha). Permanently excluded: system-wide halts, operator/reconciliation controls, manual rebalancing, force rebuild, risk-limit changes, order fabrication, risk-decision overrides.
- **Source:** `docs/phase2-7-daniel-direction-resolution.md` §5 (changes Contract V3 §13.3 membership; narrows §13.6 audit packet). Code changes applied 2026-07-28 in commit `52f136d`: `liquidate_all` removed from `INVESTOR_ADMIN_VERBS` and moved into `ForbiddenInvestorAdminVerb`; `reduce_only` added; backend `ACCOUNT_INTENT_KINDS` mirror deliberately unchanged. Boundary enforcement also in `0e9a73e` (2026-07-30).

### D-010 — reduce_only wire spelling / account-control request shape

- **Added:** 2026-08-08 — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-08-19 (shape 2026-08-17, spelling 2026-08-19)
- **Question:** `reduce_only` is the literal Daniel used in prose, and he described pause and reduce-only as "account-control requests" rather than plain actions; the exact wire spelling/shape had to be confirmed against the exported `v1.0.0-dev.1` contract.
- **Resolution (2026-08-17, shape):** the action wire shape uses the **existing action envelope** — there is no distinct account-control request type. `join_template` and `leave_template` carry `parameters.template_id`; Managed `reduce_only` carries `parameters.enabled` as a **boolean**. Disabling reduce-only is a control relaxation and requires step-up (D-015). What remains open is only literal field spelling, verified against the exported contract on receipt. `join_template`, `leave_template`, `reduce_only` stay unmapped in `INVESTOR_ACTION_TO_ADMIN_VERB` until then.
- **Resolution (2026-08-19, spelling — CLOSES D-010):** Daniel, treating it as settled: "The Managed action is `reduce_only`, with `parameters.enabled` as a boolean. It remains unavailable in Signal mode." So the prose literal _is_ the wire literal, and there is nothing left to verify on contract receipt. The Signal-mode exclusion is already enforced server-side by `REFI_RELEASE_STAGE` in `apps/web/src/lib/config/env.ts` rather than only documented in the allowlist — a client build constant cannot widen the action surface. `INVESTOR_ACTION_TO_ADMIN_VERB` may now map `reduce_only`; the mapping stays gated on the Managed stage, not on the spelling.
- **Source:** `docs/phase2-7-daniel-direction-resolution.md` §5 "Open item"; `docs/phase2-7-daniel-contract-mechanics-resolution.md` §6; `docs/phase2-7-daniel-connection-mechanics-resolution.md` §4.

### D-011 — Dev connection package handoff

- **Added:** 2026-08-08 — **Status:** BLOCKED (awaiting Daniel, after `investor-api` deploys) — **Dated 2026-08-17:** deployment target ≈ 2026-08-31 ("about 2 weeks", stated informally); the package follows once the service and dev fixtures are available — **Partially unblocked 2026-08-19**
- **What 2026-08-19 delivered early (so the BFF side is no longer blocked):** the assertion profile is **approved as proposed** — dev issuer `urn:refinity:bff:dev`, dev audience `urn:refinity:investor-api:dev`, ES256 only, protected-header `kid`, one assertion per call, unique `jti`, 60-second TTL. Staging and prod issuer URNs are accepted as **reserved names**; only dev is enabled now. Dev BFF hostname agreed as **`bff-dev.refi.trading`**, making the JWKS URL `https://bff-dev.refi.trading/.well-known/jwks.json` — **the host is not provisioned yet (ours to do)**, so the URL stays configurable on his side until it is live. Google OIDC service credential and `X-Refinity-User-Assertion` are separate and **both** required on protected calls. Daniel: "You can continue against these contract decisions."
- **Still outstanding in the package:** final endpoint, WIF values, seeded IDs, deployed contract/image versions, exported `v1.0.0-dev.1`, deterministic dev fixtures. These arrive together after the backend services and fixtures deploy.
- **Needed:** (1) dev API base URL (Cloud Run) + OIDC audience; (2) Workload Identity Federation configuration/identifiers; (3) seeded test IDs; (4) exported contract `v1.0.0-dev.1` with commit + image revision; (5) **the BFF issuer and JWKS URL, pinned in the dev connection sheet** (added 2026-08-17, per D-017); plus deterministic dev fixtures (Signal-only account, eligible Managed-paper account, stale-profile/missing-consent, broker disconnection, risk denial, reconciliation block, and a separate user for cross-account isolation tests). Nothing in the outbound client can be exercised end-to-end until this lands.
- **Source:** `docs/phase2-7-daniel-direction-resolution.md` §8; `docs/phase2-7-daniel-contract-mechanics-resolution.md` §2, §6; `docs/phase2-7-daniel-connection-mechanics-resolution.md` §3, §5.

### D-012 — Owning service and projection for each backend state object

- **Added:** 2026-08-08 (reframed same day after review) — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-08-17
- **Resolution (2026-08-17):** Ownership splits three ways. `identity-ccid` owns authenticated identity, the stable `user_id`, and initial user/account membership. `compliance-adapter` owns the KYC-provider exchange and the normalized KYC result. The investor authorization domain, exposed through `investor-api`, owns durable eligibility decisions, versioned advisory profiles, the disclosure registry, consent receipts, and derived account trading authorization. Investor-facing routes: `GET /onboarding/status`; `GET|POST /eligibility`; `GET /kyc` (read-only — `compliance-adapter` owns the exchange); `GET|POST /advisory-profiles`; `GET /advisory-profiles/current`; `GET /disclosures`; `GET|POST /consents`; `GET /accounts/{account_id}/authorization` — all under `/api/v1/investor`. Advisory profiles are **append-only versions** (never in-place edits). The disclosure registry keeps document key, version, content hash, effective date, status, and content reference; key + version + hash bind an acknowledgment. The initial Records Center references the exact profile, disclosure, consent, and template versions used per decision. Trading authorization is read from its own route and must not be recomputed frontend-side from KYC + eligibility + profile status. Interim frontend records remain exportable but explicitly **not authoritative** until these projections connect.
- **Source:** `docs/phase2-7-daniel-contract-mechanics-resolution.md` §1.
- **What was already decided (July):** backend ownership itself. Daniel's §1 establishes that KYC, eligibility, advisory-profile status, consent, trading authorization, and account membership are current backend state (checked per request, not embedded as durable token permissions), and his §5 puts profile/consent/template versions in the initial Records Center. Do NOT re-ask ownership.
- **What is open:** the owning service, versioning model, and investor-api projection for each state object. Will `v1.0.0-dev.1` identify the source and route for KYC, eligibility, advisory profile, disclosure/consent, and trading authorization? In particular: who owns versioned advisory-profile state (no backend version table exists per the cutover matrix) and the disclosure document registry (versions, hashes, effective dates — "Registry source TBD")? His fixture list includes a stale-profile case, which presumes this state exists somewhere.
- **Until resolved:** BFF keeps exportable interim records under the same "not the system of record" posture as preferences.
- **Source:** `docs/phase2-7-daniel-direction-resolution.md` §1/§2/§5; `docs/phase2-midpoint-architecture-checkpoint.md` §8; `docs/current-gaps-register.md` G-003/G-005/G-006.

### D-013 — Signal freshness SLA

- **Added:** 2026-08-08 — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-08-17
- **Resolution (2026-08-17):** Freshness is **backend-owned** and may vary by strategy/source and market schedule. The provisional 2h/24h thresholds must **not** become contract constants — they are formally dead and must not reappear anywhere in the frontend. Recommendation projections carry `source_as_of`, `last_evaluated_at`, `fresh_until`, `expires_at`, `freshness_status` (`fresh` | `stale` | `expired`), `freshness_policy_version`, and freshness reason codes when not fresh. The frontend **displays** these values and never infers freshness from the age of a recommendation or account-intent record. **`blocked` remains an authorization, risk, or control outcome, not a freshness state** — `freshness_status` and `RecommendationStatus` are orthogonal axes.
- **Source:** `docs/phase2-7-daniel-contract-mechanics-resolution.md` §3.
- **Original question:** What marks a recommendation stale for the Signal cohort? The provisional thresholds (fresh ≤ 2h, stale 2h–24h, blocked > 24h) have been carried as a "Daniel-confirmation item" since Phase 2.5 and were dropped from the July ask. Will recommendation/intent projections carry a freshness or `expires_at` field, and are tolerances per-strategy? Contract V3 carries a stale-`ts_utc` fixture but no threshold; no code implements a freshness rule. Blocks honest Signal-mode rendering — the first dev release and first production cohort are both Signal-only per D-005.
- **Source:** `docs/phase2-5-signal-to-investor-product-contract.md` §5, §7.3; `docs/phase2-5-signal-contract-live-backend-delta.md:133`.

### D-014 — Re-acknowledgment policy exposure to the frontend

- **Added:** 2026-08-08 — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-08-17
- **Resolution (2026-08-17):** **Mutation response is the authoritative flow**; no policy preflight endpoint in the initial contract. A `PATCH /preferences` that expands trading without the required current acknowledgment makes **no change** and returns **`409 ACKNOWLEDGMENT_REQUIRED`** carrying policy version, required disclosure key/version/hash, effective date, continuation reference, and correlation ID. The client records the acknowledgment (`POST /consents`), then retries the same preference change with the consent-receipt reference. The backend re-evaluates policy on the final mutation, so the frontend must **not** classify a change as restrictive or expanding. Consequences: the `409` is normal control flow, not an error state, and must never be blind-retried (it interacts with the July §3 "no blind mutation retry" rule); the UI cannot pre-warn before submission; the continuation reference must be carried through the disclosure flow. Idempotency-key handling on the retry is tracked as D-019.
- **Source:** `docs/phase2-7-daniel-contract-mechanics-resolution.md` §4.
- **Original question:** Daniel's §3: which preference changes require fresh disclosure acknowledgment "will be a versioned backend policy rather than a frontend decision." The UI must know before submitting whether to route through the disclosure flow. Is the policy exposed as a read endpoint, or does `PATCH /preferences` return an "acknowledgment required" state the frontend reacts to (e.g. a 4xx/409 with policy version and required disclosure ref)?
- **Source:** created by `docs/phase2-7-daniel-direction-resolution.md` §4.

### D-015 — Step-up authentication protocol and action matrix

- **Added:** 2026-08-08 (rephrased same day after review: ask for the backend's matrix, don't guess actions) — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-08-17
- **Resolution (2026-08-17):** **Signal-only first release:** `join_template`, `leave_template`, and preference changes need no step-up beyond a valid authenticated session (a trading-expanding preference change still needs the D-014 re-acknowledgment). **Managed:** step-up required before `resume_autopilot`; disabling an investor `reduce_only` request; joining a template **when that action activates Managed automation**; a trading-expanding preference change in Managed mode; and the future `liquidate_all`. **Not** required to pause, enable reduce-only, leave a template, or make a restrictive change. Organizing principle: **relaxing a control requires step-up; tightening never does.** Mechanism: investor-api enforces a maximum underlying `auth_time` age of **10 minutes** and returns `STEP_UP_REQUIRED` with a short-lived challenge bound to user, account, action, and **idempotency key**; the BFF then re-authenticates through `identity-ccid` and retries with an assertion carrying the new underlying `auth_time`. **Minting a fresh BFF assertion from an old session does not satisfy step-up.** The step-up retry reuses the same `Idempotency-Key` (challenge binding) — opposite to the D-014 re-ack retry, where the body changes. Note the two clocks: assertion TTL is 2 minutes (D-017), `auth_time` max age is 10 minutes; a valid assertion can still carry a stale `auth_time`. No Signal-only action requires step-up, so `v1.0.0-dev.1` is not blocked on identity-ccid for this.
- **Source:** `docs/phase2-7-daniel-contract-mechanics-resolution.md` §5.
- **Original question:** Which currently approved investor actions require step-up in the initial contract, and should step-up be represented as a maximum `auth_time` age, a fresh identity-ccid assertion, or a separate challenge state returned by investor-api? Daniel's §5 says the actions endpoint will "require step-up authentication where appropriate" but defines neither mechanism nor matrix; he also lists step-up as an unresolved prerequisite for future `liquidate_all`.
- **Source:** created by `docs/phase2-7-daniel-direction-resolution.md` §5; assertion claims per §2.

### D-016 — investor-api template-discovery route

- **Added:** 2026-08-08 — **Status:** RESOLVED AS CONFIRMATION (same day, after review: this was a re-ask) — **Owner:** —
- **Resolution:** Daniel already decided the architecture: dedicated investor-api, `/api/v1/investor` prefix, Admin Portal rejected, and "accounts and templates" named as the first mock-replacement group. The only unknown is the exact exported route and response schema, which he already said arrives in `v1.0.0-dev.1`. Stated to him as a confirmation, no response required: the Admin Portal template route will not be targeted; the investor template adapter stays contract-bound until `v1.0.0-dev.1` defines the dedicated investor projection.
- **Source:** `docs/phase2-6-daniel-answer-resolution.md` §Q2 (superseded); `docs/phase2-7-daniel-direction-resolution.md` §3, §7.

### D-017 — BFF→investor-api user/session assertion contract

- **Added:** 2026-08-08 — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-08-17 — **Priority:** Critical (was blocking the service client)
- **Resolution (2026-08-17):** `v1.0.0-dev.1` defines this separately from the Google OIDC service credential. Header **`X-Refinity-User-Assertion`**, carrying a **BFF-signed ES256 JWT**. The BFF uses a **stable environment-specific issuer — not a Vercel preview URL** — and publishes a **JWKS**; investor-api pins issuer and audience, fetches/caches the JWKS, and supports `kid`-based rotation. Dev audience: `urn:refinity:investor-api:dev`. **Max TTL 2 minutes.** Required claims: `iss`, `aud`, `sub`, `iat`, `nbf`, `exp`, `jti`, `sid`, `auth_time`, and `amr` or `acr`. `sub` is the stable backend `user_id`; **`auth_time` must carry the time of the underlying user authentication, not the mint time**. One assertion **per BFF→backend call** with a unique `jti`; mutation replay is governed by `jti` **and** `Idempotency-Key` — an exact repeat may return its existing receipt, reuse for a different request is rejected. **Account IDs must not appear in the assertion**; investor-api resolves and re-authorizes ownership server-side per account request. The exact BFF issuer and JWKS URL arrive in the dev connection sheet (D-011). Consequences on our side: the BFF now holds an ES256 private key and owns a stable issuer identity, a JWKS endpoint that survives Vercel redeploys, and a `kid` rotation procedure — deployment work plus a written key runbook, not a code constant. `auth_time` must be propagated from the identity-ccid assertion into the BFF session and never replaced with "now" (it is the input to D-015 step-up).
- **AMENDED 2026-08-19 — `amr` is required, `acr` is additive:** the required-claims list above records "`amr` or `acr`", and that reading is **too loose**. identity-ccid sends `auth_time` and a **non-empty `amr` array**; `acr` "may be added later, but `amr` will be the required v1 method claim". An `acr`-only assertion is therefore missing the claim investor-api reads. Minting now refuses an absent, **empty**, or `acr`-only method claim (`MissingAuthMethodError`). Method values ship with the exported contract, initially email verification code and email magic link — deliberately not enumerated in our code, since guessed spellings would silently disagree with `v1.0.0-dev.1`. Also made explicit: the BFF preserves `auth_time` and `amr` in the server-side session and copies them into each assertion, and **never** re-stamps `auth_time` on a session refresh or a new mint — only a new underlying authentication or a step-up moves it.
- **Source:** `docs/phase2-7-daniel-contract-mechanics-resolution.md` §2; amended by `docs/phase2-7-daniel-connection-mechanics-resolution.md` §1.
- **Original question:** Daniel's direction defines TWO distinct signed assertions and specifies only the first. (1) identity-ccid→BFF: short-lived, single-use, asymmetric, published JWKS, standard claims — used to establish the BFF browser session (§1, fully specified). (2) BFF→investor-api: "a separate short-lived signed user/session assertion derived by the BFF from its validated server-side session"; "the backend will not trust a plain user-ID header" (§2) — named but NOT specified. Unspecified: who signs it and with what key pair; how investor-api obtains/verifies the public key; issuer; audience; subject; TTL; jti/replay handling; whether `auth_time` propagates from the identity-ccid assertion; whether account IDs ride in the assertion or are resolved server-side; per-request generation vs brief reuse. Should `v1.0.0-dev.1` define all of this? Distinct from the Google OIDC service credential — cannot implement the service client without it.
- **Source:** `docs/phase2-7-daniel-direction-resolution.md` §1, §2. Identified 2026-08-08 during reply review (Zeshan).

### D-018 — Signal-only first-release action surface

- **Added:** 2026-08-08 — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-08-17
- **Resolution (2026-08-17):** For `v1.0.0-dev.1`, enabled: `join_template`, `leave_template`, and preference updates **through the dedicated `PATCH /preferences` route**. Preference updates create the same immutable action receipts but **must not be exposed as a second public write path through `/actions`** — so `update_prefs` is no longer a client-emittable `/actions` verb, and the `updateAccountPrefs → update_prefs` mapping in `INVESTOR_ACTION_TO_ADMIN_VERB` was removed (it would have created exactly that second path). `pause_autopilot`, `resume_autopilot`, and `reduce_only` stay unavailable until Managed paper; `liquidate_all` remains deferred. The `/actions` surface is **not** gated wholesale — the initial allowlist is simply limited to Signal-relevant actions, with no path to broker submission. Also confirmed in the same reply: template discovery via a dedicated investor-api projection (D-016); browser subscribes through the BFF-proxied SSE route with investor-api performing the authoritative account filter before emitting (A-001 confirmed); action wire shape uses the existing envelope (D-010).
- **Source:** `docs/phase2-7-daniel-contract-mechanics-resolution.md` §6.
- **Original question:** §5 approves the investor action set (join_template, leave_template, update_prefs, pause_autopilot, resume_autopilot, reduce_only; liquidate_all deferred), but §9 says "the first dev release will start with signal-only and will not expose a path from investor actions to broker submission." Not contradictory, but the release boundary is underspecified. For `v1.0.0-dev.1`: should join_template/leave_template/update_prefs already be active (they influence Signal/account-intent generation — and §4 requires the backend prefs path before investor-editable preferences generate live account intents), with pause/resume/reduce_only gated until Managed paper? Or is the entire `/actions` mutation surface gated from the first Signal release? Immediate frontend implications for which mutation surfaces ship in the first release.
- **Source:** `docs/phase2-7-daniel-direction-resolution.md` §4, §5, §9. Identified 2026-08-08 during reply review (Zeshan).

### D-020 — BFF issuer identity: URN, not hostname

- **Added:** 2026-08-17 — **Status:** DECIDED (ours to choose) — **Owner:** Zeshan — **Decided:** 2026-08-17
- **Decision:** the BFF assertion issuer is a **URN** — `urn:refinity:bff:dev`, with `:staging` and `:prod` equivalents — not a hostname. Daniel pins whatever we give him, and a hostname issuer welds our identity to wherever the app is deployed, so any hostname change would force an issuer rotation on his side. The trade-off is that a URN has no derivable `jwks_uri`, so the **JWKS URL must be stated explicitly in the dev connection sheet**; it has to be anyway, since he pins it. What we owe him is therefore two strings: the issuer URN and a stable JWKS URL on a hostname we control. `assertPublishableIssuer` accepts URNs and rejects preview-shaped hosts outside dev.
- **Open sub-item — NAMED 2026-08-19, still ours:** the stable hostname is **`bff-dev.refi.trading`**, agreed with Daniel, giving JWKS URL `https://bff-dev.refi.trading/.well-known/jwks.json`. **Not provisioned yet**, so the URL stays configurable on his side until it resolves. Confirmed in the same reply that investor-api uses **only** the explicitly configured JWKS URL — never derived from `iss`, never followed from an assertion — which vindicates the URN choice and also means a JWKS URL change is a coordinated config change on his side, not something a redeploy can do.
- **Source:** `docs/phase2-7-daniel-contract-mechanics-resolution.md` §2; `docs/security/RUNBOOK-bff-assertion-signing-key.md`.

### D-021 — Signing-key material per tier

- **Added:** 2026-08-17 — **Status:** DECIDED — **Owner:** Zeshan — **Decided:** 2026-08-17
- **Decision:** every **deployed** tier, dev included, requires a persistent ES256 key with a stable `kid` from the secret store. The per-process ephemeral key is permitted only on a single-process local machine or CI run, behind the explicit `BFF_ASSERTION_ALLOW_EPHEMERAL_KEY=1` opt-in. **Rationale:** Cloud Run runs multiple instances with ephemeral filesystems, so instance A would sign under a `kid` absent from the JWKS instance B serves — verification then fails depending on which instance answered. `REFI_ENV=dev` cannot distinguish a laptop from the deployed dev tier Daniel will call, so the fallback is an explicit switch rather than an inference from the tier name.
- **Related:** the assertion env vars are deliberately **optional in the env schema** and enforced at mint time, so a staging or prod deploy does not fail at boot on secrets that are not needed until the outbound client is wired.
- **Source:** `docs/security/RUNBOOK-bff-assertion-signing-key.md` §2; review feedback 2026-08-17.

### D-019 — Idempotency-Key on the re-acknowledgment retry

- **Added:** 2026-08-17 — **Status:** DECIDED — **Owner:** Daniel — **Decided:** 2026-08-19
- **Question:** After a `409 ACKNOWLEDGMENT_REQUIRED` and a recorded consent receipt, does the retried `PATCH /preferences` reuse the original `Idempotency-Key` or take a new one? D-017's replay rule rejects reuse of a `jti`/`Idempotency-Key` pair "for a different request", and the retry body differs by the consent-receipt reference.
- **Resolution (2026-08-19):** a **new** `Idempotency-Key`, confirming the working assumption. Daniel: "the continuation and consent-receipt references change the request. Exact retries of that final PATCH reuse its **new** key. Reusing the original key with the changed request is rejected as `IDEMPOTENCY_KEY_REUSED`." So there are two keys in the loop, not one — the original belongs to the request that 409'd, and the continuation gets its own, which is then the key its own transport-level retries reuse.
- **Opposite of the step-up loop, and now stated once in code:** `STEP_UP_REQUIRED` retries with the **same** key (the challenge is bound to it, and the body is unchanged); `ACKNOWLEDGMENT_REQUIRED` retries with a **new** one. Same-shaped 409s, opposite rules. `continuationIdempotencyKeyRule()` in `apps/web/src/lib/sec203a/step-up.ts` exists so the distinction is read from one place rather than remembered, and `IDEMPOTENCY_KEY_REUSED` is exported as the refusal — a caller defect, never a retryable failure.
- **Source:** `docs/phase2-7-daniel-contract-mechanics-resolution.md` §4, §8; `docs/phase2-7-daniel-connection-mechanics-resolution.md` §4.

---

### D-022 — D-LAUNCH-06: does the September artifact submit orders on the investor's behalf?

- **Added:** 2026-08-24 (as D-LAUNCH-06 in the release register) — **Status:** DECIDED — **Owner:** Zeshan — **Decided:** 2026-09-04
- **Resolution (2026-09-04):** **YES.** The September artifact may submit orders to Alpaca on the investor's behalf through the authoritative backend lifecycle, for investors admitted to the closed Alpha by a ReFi human. Supersedes the "Signal Dev Release 1 — no paper or live order effect" framing. Does not grant frontend order authority; does not allow applicant self-admission; does not decide the Alpaca environment (D-023).
- **Impact:** Ship Contract Amendment 1; invariant reclassification (A/B/C) and rebased authority split; C1b-2 D rows reclassified (10 → C, 13 → A, 14 → A, 26 → C, 26b new); execution-chain records to be rendered read-only; revised Gate A checklist. See `docs/releases/2026-09-signal/dlaunch06-execution-rebaseline-2026-09-04.md`.
- **Source:** Zeshan, authoritative release decision 2026-09-04.

### D-023 — D-LAUNCH-07: Alpaca environment for September acceptance (paper, live, or both)

- **Added:** 2026-09-04 — **Status:** OPEN — **Owner:** Zeshan (counsel for `live`)
- **Question:** D-022 establishes order submission but not the environment. Which Alpaca environment does September acceptance use?
- **Until decided:** the package's `paper|live` enum stays intact; the frontend forwards only the enum; PR #49's removal of raw live-key acceptance stands; no live-capital acceptance is claimed; Gate B remains the precondition for real clients with live capital.

## Historical appendix — xlsx snapshot as of 2026-05-29

Everything below this line transcribes the xlsx verbatim and reflects the tracker's state on 2026-05-29, **before** Daniel's answers (2026-05-30) and written direction (2026-07-28). Statuses like "Awaiting Dan" / "Blocked" in these tables are stale; the entries above are current. Notable supersessions: Operating rule 2's REVIEW-vs-DENY partition no longer exists (risk is binary, D-001); GATE-003..006 are satisfied by the phase2-6/2-7 resolutions; several Surface Blocker Map rows are unblocked or reframed (Surface 4 → Account Controls Center, D-004/D-008).

### Operating rules (from Dashboard sheet)

1. Do not start Surface 4 until ExecutionPolicy ownership is answered.
2. Do not write executable adapter mapping until the risk REVIEW vs DENY partition is confirmed.
3. Do not ship Managed activation until template discovery is defined.
4. Use the signal: 0 answer to simplify fixtures. It does not block the adapter shape.
5. Keep implementation in the BFF unless Daniel explicitly moves ownership upstream.
6. No per-trade Accept, no investor-accept, no staff approval, no founder review, no support-led individualized advice.

Dashboard metrics as seeded: Total Dan decisions 4; Critical 3; High 1; Answered 0; Adapter blockers open 3; Surface blockers open 4; Production blockers open 4. Sheet purpose (verbatim): "track Daniel's four backend decisions, the surfaces they block, and the exact handoff needed before adapter-aware implementation resumes."

---

### Surface Blocker Map (from sheet, verbatim)

| Surface ID | Surface Name                         | Alignment Verdict | Blocked By       | Current Status           | Backend Anchor                                             | BFF / Frontend Dependency               | Next Safe Work                                  | Production Blocker?        |
| ---------- | ------------------------------------ | ----------------- | ---------------- | ------------------------ | ---------------------------------------------------------- | --------------------------------------- | ----------------------------------------------- | -------------------------- |
| Surface 1  | Signal vs Managed mode               | Adapter required  | DAN-004          | Prototype shell exists   | account.intent.ready; account.admin states                 | Mode read/branching, subscription state | Spec adapter contract only                      | Yes                        |
| Surface 2  | Recommendations list                 | Adapter required  | DAN-001; DAN-003 | Prototype shell exists   | signals; template.rebalance.intent; risk.approved/rejected | RecommendationProjection                | Spec fixture mapping only                       | Yes                        |
| Surface 3  | Recommendation detail                | Adapter required  | DAN-001; DAN-003 | Prototype shell exists   | account.intent.ready; risk verdict                         | Recommendation detail projection        | Spec fixture mapping only                       | Yes                        |
| Surface 4  | Automation Center / Execution Policy | Blocked           | DAN-004          | Do not implement         | exec-gateway policy enforcement                            | ExecutionPolicy UX and signed consent   | Wait for ownership answer                       | Yes                        |
| Surface 5  | Managed activation                   | Blocked           | DAN-002; DAN-004 | Do not implement         | template_id; account.admin join_template                   | Template discovery and activation       | Wait for template registry and policy ownership | Yes                        |
| Surface 6  | Pause / Resume Managed               | Aligned boundary  | —                | Safe                     | account.admin pause_autopilot/resume_autopilot             | Pause/resume UI                         | Can refine after PR merge                       | No                         |
| Surface 7  | Disclosure re-acknowledgement        | BFF-owned shell   | —                | Safe as shell            | BFF disclosure registry                                    | Disclosure UX                           | Can document or prototype                       | Yes for production storage |
| Surface 8  | Profile staleness / reactivation     | BFF-owned shell   | —                | Safe as shell            | BFF profile state                                          | Profile version state                   | Can document or prototype                       | Yes for production storage |
| Surface 9  | Eligibility presentation             | Adapter required  | DAN-001          | Blocked for real adapter | risk.approved / risk.rejected                              | ALLOW / REVIEW / DENY presentation      | Wait for reason partition                       | Yes                        |
| Surface 10 | Exception Review                     | Adapter required  | DAN-001          | Blocked for real adapter | risk.rejected; TradingControlStates                        | Exception routing and resolution        | Wait for reason partition                       | Yes                        |
| Surface 11 | Records Center                       | Adapter required  | DAN-004          | Prototype shell exists   | orders.evt; audit.evt                                      | RecordArtifact projection               | Spec lineage only                               | Yes                        |
| Surface 12 | Support boundary                     | Aligned boundary  | —                | Safe                     | No support-led advice path                                 | Support UX boundary                     | Keep as boundary surface                        | No                         |
| Surface 13 | Broker submission path               | Adapter required  | DAN-001; DAN-004 | Blocked for real adapter | orders.cmd; orders.evt                                     | Policy-bound submission projection      | Wait for risk partition and policy ownership    | Yes                        |
| Surface 14 | Admin boundary                       | Aligned boundary  | —                | Safe                     | template.admin hidden from investor                        | Tripwire/admin route exclusion          | Maintain tests                                  | No                         |
| Surface 15 | Tripwire enforcement                 | Aligned boundary  | —                | Safe                     | Source-level forbidden language checks                     | No forbidden investor actions           | Maintain tests                                  | No                         |
| Surface 16 | Stale E2E coverage                   | Closed            | —                | Green                    | E2E 67/67                                                  | Stable testids and boundary checks      | Maintain after merge                            | No                         |

---

### Fixture Matrix (from sheet, verbatim)

| Fixture Family          | Depends On       | Required Cases                                                          | Purpose                                                              | Status       | Owner    |
| ----------------------- | ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ | -------- |
| Risk verdict mapping    | DAN-001          | approved; rejected REVIEW; rejected DENY; unknown code                  | Verify ALLOW / REVIEW / DENY mapping and fail-closed behavior.       | Blocked      | BFF      |
| Template discovery      | DAN-002          | template list; missing template; retired template; unsupported template | Verify Managed activation cannot proceed without canonical template. | Blocked      | BFF      |
| Signal zero             | DAN-003          | RF-only; RL-only; RF/RL agree; RF/RL conflict; signal 0 if preserved    | Verify signal row normalization and hold path realism.               | Awaiting Dan | BFF      |
| Execution policy        | DAN-004          | active; missing; expired; superseded; revoked; unknown version          | Verify consent record, policy version, and execution guardrails.     | Blocked      | BFF      |
| Admin boundary          | None             | template.admin hidden; target_account_id hidden; no investor-accept     | Verify SEC 203A-2(e) boundary is not weakened.                       | Covered      | Frontend |
| Signal tier record-only | DAN-001; DAN-004 | approved backend chain but Signal user receives record-only projection  | Verify Signal tier never routes to broker.                           | Blocked      | BFF      |
| Managed broker path     | DAN-001; DAN-004 | policy-bound order command; orders.evt; audit.evt missing               | Verify broker path and record lineage.                               | Blocked      | BFF      |

---

### Implementation Gates (from sheet, verbatim)

| Gate ID  | Gate                                 | Required Before        | Depends On   | Status  | Evidence / Exit Criteria                                      | Owner    |
| -------- | ------------------------------------ | ---------------------- | ------------ | ------- | ------------------------------------------------------------- | -------- |
| GATE-001 | Phase 2.5 PR merged into main        | Any new surface work   | PR #1        | Check   | PR #1 merged, CI green, main updated.                         | Zeshan   |
| GATE-002 | Dan decision email sent              | Waiting period         | Email        | Check   | Email sent to Daniel with four decisions.                     | Zeshan   |
| GATE-003 | Risk partition locked                | Risk adapter           | DAN-001      | Blocked | Each RiskReason.code classified REVIEW or DENY.               | Daniel   |
| GATE-004 | Template registry defined            | Managed activation     | DAN-002      | Blocked | Endpoint/table/topic and payload shape defined.               | Daniel   |
| GATE-005 | Signal zero behavior confirmed       | Fixture cleanup        | DAN-003      | Blocked | Preserve, suppress, or strategy-specific behavior documented. | Daniel   |
| GATE-006 | ExecutionPolicy ownership locked     | Surface 4              | DAN-004      | Blocked | Bucket 2 or Bucket 3 chosen; consent storage owner defined.   | Daniel   |
| GATE-007 | Contract V2 patched with answers     | Adapter implementation | DAN-001..004 | Blocked | Contract updated and reviewed.                                | Zeshan   |
| GATE-008 | Gap Register V2 patched with answers | Adapter implementation | DAN-001..004 | Blocked | Gap rows updated and blockers cleared.                        | Zeshan   |
| GATE-009 | Adapter fixtures updated             | Adapter implementation | DAN-001..004 | Blocked | Fixtures reflect Daniel answers.                              | BFF      |
| GATE-010 | Surface 4 implementation starts      | Surface 4              | GATE-006     | Blocked | ExecutionPolicy ownership resolved.                           | Frontend |
| GATE-011 | Surface 5 implementation starts      | Surface 5              | GATE-004     | Blocked | Template registry resolved.                                   | Frontend |

Raw note: the Gate status "Check" (GATE-001, GATE-002) is transcribed as-is; the sheet does not define it, and it likely means done/checked-off, but that is not confirmed.

---

### Reference Map (from sheet, verbatim)

| Reference                       | Repo           | Path                                                                | Why it matters                                             |
| ------------------------------- | -------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Final merge package             | refi-us-sec-ia | docs/phase2-5-final-merge-package.md                                | One-stop summary of Phase 2.5.                             |
| GitLab source verification      | refi-us-sec-ia | docs/phase2-5-gitlab-refinity-main-source-verification.md           | Confirms refinity-main main @ 0a7d64d as source of truth.  |
| Backend capability map          | refi-us-sec-ia | docs/phase2-5-gitlab-backend-capability-map.md                      | Backend facts read from Daniel's code with file refs.      |
| Signal contract V2              | refi-us-sec-ia | docs/phase2-5-signal-to-investor-product-contract.md                | Canonical signal-to-investor product contract.             |
| Gap Register V2                 | refi-us-sec-ia | docs/phase2-5-gap-register-v2-against-gitlab.md                     | Tracks adapter gaps and blockers.                          |
| Surface alignment               | refi-us-sec-ia | docs/phase2-5-surface-to-gitlab-alignment-register.md               | 16 surface alignment verdicts.                             |
| SEC product boundary            | refi-us-sec-ia | docs/sec203a-product-boundary.md                                    | Product boundary context for SEC 203A-2(e).                |
| Admin-investor boundary         | refi-us-sec-ia | docs/admin-investor-boundary.md                                     | Admin commands hidden from investor UI.                    |
| Investor action taxonomy        | refi-us-sec-ia | docs/investor-action-taxonomy.md                                    | Clarifies allowed and forbidden investor actions.          |
| BFF prototype state contract    | refi-us-sec-ia | docs/bff-prototype-state-contract.md                                | Defines Bucket 2 vs Bucket 3 ownership framing.            |
| Trade lifecycle contract        | refinity-main  | docs/architecture/trade_lifecycle_contract.md                       | Correlation spine Contract V2 builds on.                   |
| Envelope fixtures               | refinity-main  | contracts/fixtures/\*.json                                          | Eight envelope fixtures verified against backend contract. |
| Risk engine model               | refinity-main  | apps/risk-engine/src/models.py:132-144                              | RiskDecision and RiskReason structure.                     |
| Inference signal test           | refinity-main  | apps/inference-worker/tests/test_stream_signal_publishing.py:74-110 | signal in {-1,0,1} evidence.                               |
| Exec gateway policy enforcement | refinity-main  | apps/exec-gateway/src/models/domain.py                              | Policy enforcement at orders.cmd derivation.               |
| Admin template publishing       | refinity-main  | apps/admin-portal/backend/pubsub_mgr.py:109-138                     | template.admin evidence.                                   |
| Account intent processor        | refinity-main  | apps/account-intent-builder/src/domain/processor.py:384-470         | join_template / leave_template evidence.                   |

---

### Sheet vocabularies (from "Lists" sheet, raw)

- **Status:** Awaiting Dan; Answered; Needs Clarification; Resolved; Blocked; Deferred
- **Priority:** Critical; High; Medium; Low
- **Owner:** Daniel; Zeshan; BFF; Frontend; Legal; Joint
- **Blocker Class:** Adapter; Surface; Fixture; Production; Compliance; Documentation
- **Decision Outcome:** Use provisional; Corrected by Daniel; Bucket 2; Bucket 3; Remove dead branch; Needs follow-up
