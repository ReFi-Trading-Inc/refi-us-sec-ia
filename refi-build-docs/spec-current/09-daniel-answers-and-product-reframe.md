# 09 — Daniel Answers and Product Reframe

> **⚠️ 2026-05-20 UPDATE — see `12-daniel-2026-05-20-guidance.md`** for:
> (a) Daniel's three follow-up messages establishing `spanner_ddl_all.txt` as authoritative, admin-portal as the integration reference, and the auth-account vs trading-account linkage rule;
> (b) The product-owner discipline charter (12 rules, sprint re-org A–E);
> (c) The integration audit (`11-integration-audit-post-p2.5r-04.md`) found 11 wire-shape drifts that must be resolved in Sprint A/B before lineage UI.
>
> Forward planning: read `12` first, then this doc.

**Date:** 2026-05-19
**Status:** Answers received for open questions 1, 2, 3, 5 in `08-daniel-rescope-plan.md §11`. This document consolidates the answers, captures the **product-defining reframe triggered by Q5**, and amends the MIG-P2.5R ticket plan accordingly.

**Supersedes for forward planning:** the recommendation lifecycle UX (Accept/Reject/Request review buttons) shipped in MIG-P2.5-12. That model is incompatible with SEC Rule 203A-2(e) under Managed mode and must be replaced.

---

## 1. Answers to open questions

### Q1 — Hosting + domain

- **Source storage:** GitLab (primary). GitHub may continue in parallel.
- **Final host:** Google Cloud.
- **Domain:** `refi.trading/us` OR `refitrading.com` (both owned). To be selected for production cutover.

**Implication:** BFF deploys to Google Cloud (Cloud Run is the obvious target — matches Daniel's deploy pattern per `docs/IOs/trade-manager_IO_details.md:?` `us-west1-docker.pkg.dev/$PROJECT_ID/apps/trade-manager:latest`). CI/CD wires to GitLab; mirror to GitHub optional. See `10-bff-architecture-decision.md` for the host-vs-Next.js-routes call.

### Q2 — Spanner project

- **Current canonical (final from Daniel):** `refinity-dev-sp` (Spanner project; instance + database TBD with Daniel — likely `core` per `admin-portal` IO doc).
- **Alternates seen in Daniel's IO docs (treat as stale labels, not different projects):**
  - `refinity-dev / refinity-spanner / refinity-db` — appears in `exec-gateway` IO doc as default; outdated.
  - `refin-main / refin-db` — appears in `trade-manager` IO doc; outdated.

**Implication:** BFF reads from `refinity-dev-sp`. Every IO/as-built doc reference to `refinity-dev*` or `refin-main*` should be treated as outdated label and rewritten in `06-backend-contract-map.md` during P2.5R-01. The `admin-portal` IO doc's `refinity-dev-sp / core` convention was correct; the others lagged behind a project rename.

### Q3 — BFF endpoint ownership

- **Daniel will ratify our BFF endpoints.** The frontend team writes the BFF; Daniel reviews and confirms shapes.

**Implication:** `apps/routing-api` skeleton stays empty; we build the BFF. The endpoint list in `08-daniel-rescope-plan.md §7` becomes the proposal to Daniel. Once ratified, that list is the authoritative investor-facing surface.

### Q5 — Investor "Accept" semantics under 203A-2(e)

**This is the answer that reframes the product.**

The investor does NOT accept individual recommendations under Managed mode. Per SEC Rule 203A-2(e), exclusive-platform advice does not require per-recommendation client approval; it requires the client to authorize the **execution policy** once (strategy, scope, risk guardrails, broker connection, disclosures, advisory agreement), after which the platform automatically executes eligible software-generated intents.

**Daniel's `template.admin action=rebalance target_account_id=X` is NOT the investor-accept command.** It is an internal/admin/system command for ops use only — exposing it as an investor-facing button would create a compliance issue (staff-directed portfolio management).

#### Canonical 5-command model

The end-to-end flow becomes:

| #   | Command                                    | Origin                                                     | Investor surface                                                            |
| --- | ------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `client.execution_policy.activate`         | **Investor (one-time per policy version)**                 | "Turn on Managed Execution" — the _only_ investor accept moment             |
| 2   | `system.account_intent.generated`          | Daniel backend (portfolio-engine → account-intent-builder) | No investor surface; appears in records / lineage                           |
| 3   | `system.account_intent.approved_by_policy` | Daniel backend (risk-engine + policy checks)               | No investor surface; appears in lineage as "policy: allow"                  |
| 4   | `system.execution_plan.submit`             | Daniel backend (exec-gateway → trade-manager)              | No investor surface; appears in lineage as "submitted to broker"            |
| 5   | `client.exception.approve`                 | **Investor (only when intent falls outside policy)**       | "Approve Exception" — the _only_ per-decision investor button under Managed |

#### Tier-level button vocabulary

**ReFi Signal (advisory only — no broker execution):**

- ✅ Review
- ✅ Save
- ✅ Dismiss
- ✅ Upgrade to Managed
- ❌ Accept (implies ReFi will act — it won't in Signal)

**ReFi Managed (automated execution within investor-approved policy):**

- ✅ Turn on Managed Execution (one-time, per policy version)
- ✅ Pause Managed Execution
- ✅ Edit guardrails (creates new policy version, re-activation required)
- ✅ View record
- ✅ Approve Exception
- ✅ Reject Exception
- ❌ Accept recommendation (would imply per-recommendation approval — wrong model)
- ❌ Reject recommendation
- ❌ Request manual review

**Admin (operator only — never client-specific advice):**

- ✅ Run simulation (sandboxed; non-client)
- ✅ Inspect records
- ✅ Export evidence
- ✅ Investigate failed broker event
- ✅ Pause system globally
- ✅ Flag incident
- ✅ Review model governance
- ❌ Rebalance this client because staff thinks it is right
- ❌ Approve this client's recommendation
- ❌ Edit this client's allocation manually
- ❌ Tell the user whether to approve

#### Required payload for the activation command (Daniel will implement)

`client.execution_policy.activate`:

```json
{
  "user_id": "string",
  "account_id": "string",
  "strategy_id": "string",
  "investor_profile_version": "string",
  "disclosure_version_set": "string",
  "advisory_agreement_version": "string",
  "execution_policy_id": "string",
  "execution_policy_version": "string",
  "broker_connection_id": "string",
  "automation_scope": { "...": "..." },
  "risk_guardrails": { "...": "..." },
  "restrictions": { "...": "..." },
  "pause_rules": { "...": "..." },
  "notification_preferences": { "...": "..." },
  "signed_at": "datetime",
  "ip_address": "string (HMAC-hashed at write)",
  "device_fingerprint": "string (hashed)"
}
```

Required payload for `client.exception.approve`:

```json
{
  "exception_id": "string",
  "account_intent_id": "string",
  "execution_policy_id": "string",
  "user_id": "string",
  "approved_changes": { "...": "..." },
  "signed_at": "datetime",
  "ip_address": "string (HMAC-hashed)",
  "device_fingerprint": "string (hashed)"
}
```

---

## 2. What this reframe invalidates in the current frontend

The Q5 answer **directly invalidates** these shipped pieces of MIG-P2.5 work:

| Shipped item                                                                         | Why it's wrong                                                                                                                                                        | Replacement                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/us/app/recommendations/[id]/page.tsx` "Approve for execution" button   | Under Managed, the investor has already authorized via execution policy; per-recommendation approval breaks the 203A-2(e) model                                       | Tier-aware UI: Signal mode shows "Save / Dismiss / Upgrade to Managed"; Managed mode shows view-only with lineage panel (unless in Exception Review, then "Approve Exception / Reject Exception") |
| `usePatchRecommendation()` "accept" action (MIG-P2.5-12)                             | Same as above                                                                                                                                                         | Replace with `useActivateExecutionPolicy()` (one-time per policy version) and `useApproveException()` (per-exception)                                                                             |
| `usePatchRecommendation()` "reject" + "request_review" actions                       | "Reject" maps to "Dismiss" in Signal (UI-only state); "Request review" is automatic system routing under Managed, not investor-driven                                 | Move Reject/Review to system-driven exception routing                                                                                                                                             |
| Recommendation detail page `LifecycleActions` component                              | Buttons are wrong for both tiers                                                                                                                                      | Replace with `<TierAwareActions tier={signal                                                                                                                                                      | managed} exceptionState={...} />` |
| Dashboard `NextActionCard` showing "Review pending recommendation" for Managed users | Managed users don't review per-rec; the next-action surface for Managed is "Activate Managed Execution" (if not yet active) or "Approve Exception N" (if any pending) | Tier-aware next action                                                                                                                                                                            |
| MSW handler `PATCH /v1/recommendations/:id action=accept                             | reject                                                                                                                                                                | request_review`                                                                                                                                                                                   | Wrong action verb model           | Replace with `POST /api/v1/execution-policy/activate` and `POST /api/v1/exceptions/{id}/approve` (and reject) |
| Persona fixtures that include rec_m_001 in `status: pending` waiting for accept      | Doesn't reflect the Managed reality                                                                                                                                   | Rework: under Managed persona, no recs are in "pending investor accept"; they're in `executed`, `pending_submit`, `exception_review`, etc.                                                        |

---

## 3. The tier model (NEW — must land in P2.5R)

Three tiers, each with a distinct UI surface and command vocabulary:

### 3.1 ReFi Signal

- **What it is:** advisory only. The platform produces recommendations; the investor reads them; the investor manually trades at their own broker (or not).
- **Why it exists:** lowest-friction onboarding tier; also serves users who want signals without delegating execution.
- **No automated execution.** ReFi places no orders.
- **Compliance posture:** 203A-2(e) still applies — advice must come from the platform's software, not from staff.
- **UI:** Recommendations list + detail. Buttons: Save, Dismiss, Upgrade to Managed. No "Accept."

### 3.2 ReFi Managed

- **What it is:** the investor authorizes (once) a strategy + risk guardrails + broker connection + disclosures + advisory agreement, after which the platform executes eligible software-generated intents automatically.
- **Activation:** `client.execution_policy.activate` event with the full payload above.
- **Per-recommendation investor approval:** NONE. The activation IS the approval.
- **Exception Review:** when an intent falls outside the approved policy (e.g., risk-engine returns `rejected`, or a guardrail like `max_single_asset_weight` would be breached), the intent is routed to an Exception Review queue. Only here does the investor see an Approve/Reject button.
- **Compliance posture:** This is the canonical 203A-2(e) Internet Adviser model — operational interactive website, software-generated advice, exclusive-platform delivery.
- **UI:** Recommendations list + detail (view-only) + Exception Review queue + Managed Execution control panel (pause / edit guardrails / view records).

### 3.3 Admin

- **What it is:** operator surface. Never per-client advice.
- **Available actions:** simulation, records inspection, evidence export, broker-event investigation, global pause, incident flagging, model governance review.
- **Prohibited actions:** anything that initiates account-specific advice, approves a client's recommendation, edits a client's allocation, or tells a client whether to approve.
- **UI:** Admin portal (separate from investor app); covered by Daniel's `admin-portal` service for ops. We may build admin-overlay screens on top, but they must never re-introduce client-specific advice paths.

### 3.4 Mode visibility in the UI

- Every authenticated page header shows the current tier as a small pill (`Signal` / `Managed` / `Admin`).
- Tier transitions (Signal → Managed) are confirmed via the activation flow; downgrades (Managed → Signal) are explicit policy revocations with audit trail.
- The dashboard `AccountStateCard` shows the tier as part of account state.

---

## 4. Updated MIG-P2.5R ticket plan (delta from `08-daniel-rescope-plan.md §9`)

### REMOVE / REPLACE

- ~~MIG-P2.5-12 (rec lifecycle PATCH — Reject + Request review)~~ — **already shipped, now obsolete**. The PATCH endpoint stays in MSW for backward compat during transition but UI must stop using `accept`/`reject`/`request_review` actions on `Recommendation`. Replaced by P2.5R-16 + P2.5R-17 below.
- ~~"Approve for execution" button on recommendations/[id]/page.tsx~~ — replaced by P2.5R-18 tier-aware action component.

### NEW TICKETS (insert into Wave B / C)

**P2.5R-16 — Tier model + tier-aware account state** (M, Wave B)

- Daniel source: implicit (no service today; we model client-side from `AccountSettings`, `execution_policy_id`, `execution_policy_version`).
- Files touched:
  - new `packages/api-clients/src/tier.ts` (`type Tier = "signal" | "managed" | "admin"`, helpers `useTier()`, `requireTier()`)
  - update `apps/web/app/us/app/home/_components/dashboard.tsx` (`AccountStateCard` shows tier badge)
  - new header pill: `apps/web/app/us/app/_components/TierBadge.tsx`
- Acceptance: every authenticated page shows current tier; tier read from BFF `/api/v1/profile`; tier transitions logged.

**P2.5R-17 — Execution Policy Activation flow** (L, Wave B)

- Daniel source: `client.execution_policy.activate` payload spec (§1 Q5 above).
- Files touched:
  - new `apps/web/app/us/app/managed/activate/page.tsx` (multi-step flow: confirm strategy → confirm guardrails → confirm broker → confirm disclosures → sign)
  - new `useActivateExecutionPolicy()` hook in `packages/api-clients/src/hooks/`
  - new BFF route `POST /api/v1/execution-policy/activate`
  - MSW handler under `handlers.execution-policy.ts`
  - copy in `_content/managed.ts`
- Acceptance: activation captures the full Q5 payload; signature timestamp + hashed IP + hashed device fingerprint persisted; activation event published to Daniel via the agreed Pub/Sub topic (TBD); UI confirms with policy version + signed_at receipt; tier flips Signal → Managed.

**P2.5R-18 — Exception Review queue + approve/reject** (L, Wave C)

- Daniel source: `client.exception.approve` payload spec (§1 Q5).
- Files touched:
  - new `apps/web/app/us/app/managed/exceptions/page.tsx` (queue)
  - new `apps/web/app/us/app/managed/exceptions/[id]/page.tsx` (detail + approve/reject)
  - new `useExceptions()`, `useApproveException()`, `useRejectException()` hooks
  - new BFF routes `GET /api/v1/exceptions`, `GET /api/v1/exceptions/:id`, `POST /api/v1/exceptions/:id/approve|reject`
  - MSW handler `handlers.exceptions.ts`
  - copy in `_content/managed.ts`
- Acceptance: only intents in exception state appear; approve writes `client.exception.approve` event with full payload; reject writes equivalent; lineage panel shows the original `RiskSnapshot.reasons[]` that caused the exception; never auto-approves; default is reject if no action within TTL.

**P2.5R-19 — Replace per-rec Accept/Reject/Review with tier-aware actions** (M, Wave B)

- Files touched:
  - rewrite `apps/web/app/us/app/recommendations/[id]/page.tsx` `LifecycleActions` → `TierAwareActions`
  - Signal tier: Save / Dismiss / Upgrade to Managed
  - Managed tier (non-exception): view-only with lineage
  - Managed tier (in exception queue): redirect link to `/us/app/managed/exceptions/:id`
- Acceptance: no "Approve for execution" button anywhere under Managed; Signal mode "Save" stores client-side (or to BFF user-prefs); "Dismiss" hides from list; "Upgrade to Managed" routes to activation flow.

**P2.5R-20 — Dashboard NextActionCard tier-aware rewrite** (S, Wave B)

- Files touched: `apps/web/app/us/app/home/_components/dashboard.tsx` `NextActionCard`
- Acceptance: Signal tier → "Upgrade to Managed" (if onboarding complete) or "Complete onboarding"; Managed tier → "Approve N exceptions" (if any pending) or "No action needed"; never "Review pending recommendation."

**P2.5R-21 — Persona fixtures rework for tier model** (M, Wave A/B boundary)

- Files touched: `packages/api-clients/src/mocks/fixtures/personas/{maya-thompson,david-kim,sarah-patel}.ts`
- Acceptance: Maya = Managed tier (active policy, no exceptions pending); David = Signal tier (eligible, not yet activated Managed); Sarah = Managed tier with one pending Exception (intent blocked by tax-impact threshold); persona-level `executionPolicy: { id, version, activated_at, signed_at_hash }` field added; recommendation statuses align to Daniel's lifecycle, not our prior `pending|accepted|rejected|expired|review|denied` set.

### AMENDED TICKETS

- **P2.5R-05 (RecommendationDetail lineage bridge)** — also surface tier; for Managed (non-exception) the page is view-only.
- **P2.5R-07 (Dashboard 11-card rewrite)** — Add card "Execution Policy" (active policy id + version + signed_at + last edit) for Managed users; show "Not activated" for Signal.
- **P2.5R-09 (Managed Execution Activation rewire)** — supersede with P2.5R-17 above (same intent, now with Q5-canonical payload).

### TICKET-COUNT IMPACT

- Original P2.5R: 15 tickets, ~17 days parallel.
- After Q5 reframe: 17 net (5 new − 3 removed/folded). Estimated +3 days for the activation + exception flows, partially offset by removing the per-rec action surface. Net ~20 days parallel.

---

## 5. SEC 203A-2(e) cross-check (post-reframe)

| Rule element                                   | Pre-reframe posture                                                           | Post-reframe posture                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Internet-only delivery                         | Recommendations list + per-rec accept button                                  | Recommendations list + Exception Review queue; activation is the only investor action                                    |
| Software-generated advice (no staff tailoring) | Per-rec accept allowed staff "you should accept this" suggestions to bleed in | Per-rec action removed; staff has no path to influence per-client decisions                                              |
| Operational interactive website                | ✅                                                                            | ✅ — strengthened by the activation receipt + exception trail                                                            |
| Records preservation                           | Per-rec accept events recorded                                                | Policy activation + exception decisions recorded with signature + hashed IP + device fingerprint (richer evidence chain) |
| Multi-client ongoing service                   | Implicit                                                                      | Explicit via `client.execution_policy.activate` count                                                                    |
| Advisory personnel boundary                    | Support classifier blocks advice-seeking                                      | Same, plus admin tier explicitly forbidden from per-client rebalance                                                     |

**Verdict:** the reframe strengthens 203A-2(e) compliance. The pre-reframe "Accept recommendation" pattern was actually a 203A-2(e) risk because it could be read as staff-mediated approval.

---

## 6. Sequencing impact on the plan

Updated dependency graph (replaces `08-daniel-rescope-plan.md §9 graph`):

```
P2.5R-00 (BFF ADR, this doc + 10-bff-architecture-decision.md)
  → P2.5R-01 (contract map rewrite)
  → P2.5R-02 (OpenAPI rewrite)
  → P2.5R-03 (new schemas — now includes ExecutionPolicy, Exception)
  → P2.5R-04 (MSW handlers — now includes execution-policy + exceptions)
  → P2.5R-21 (persona rework for tier model)
  → P2.5R-16 (tier model)
  → P2.5R-17 (Execution Policy Activation flow)
  → P2.5R-19 (tier-aware rec actions)
  → P2.5R-05 (lineage bridge, tier-aware)
  → P2.5R-06 (evidence strip)
  → P2.5R-07 (dashboard 11+1 cards)
  → P2.5R-08 (dashboard BFF projection)
  → P2.5R-18 (Exception Review)
  → P2.5R-20 (next-action tier-aware)
  → P2.5R-10 (lifecycle scenarios — now must cover tier transitions + exception scenarios)
  → P2.5R-11 (records center)
  → P2.5R-12 (evidence console)
  → P2.5R-13 (support boundary hardening)
  → P2.5R-14 (E2E proof suite — add tier + exception tests)
  → P2.5R-15 (cutover guide)
```

---

## 7. Forwarding note to Daniel

Send Daniel a single message that consolidates:

1. **Confirm BFF endpoint list** (`08-daniel-rescope-plan.md §7`) — frontend will own; please ratify path + shape per endpoint.
2. **Confirm Pub/Sub topics for client commands** — proposed names (Daniel may rename):
   - `client.execution_policy.activate`
   - `client.execution_policy.pause`
   - `client.execution_policy.update`
   - `client.exception.approve`
   - `client.exception.reject`
   - Plus subscriptions for the system-side commands listed in §1 Q5.
3. **Confirm Spanner project = `refinity-dev-sp`** (final), with instance + database name + reads-only role for BFF service account.
4. **Confirm `auth-siwe` and `identity-ccid` timeline** — if not in P2.5R window, we ship BFF-owned stubs.
5. **Confirm correlation_id policy** — BFF generates per investor action and propagates downstream.
6. **Confirm stream_id visibility** — investor UI hides `AAPL~rf` form, shows `AAPL` only; operator UI may show streams.

---

## 8. Document history

- 2026-05-19 — Initial publication. Captures answers to Q1, Q2, Q3, Q5. Q4 (auth-siwe/identity-ccid timeline) and Q6–10 still open.
