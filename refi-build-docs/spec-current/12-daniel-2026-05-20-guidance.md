# 12 — Daniel Guidance + Discipline Charter (2026-05-20)

**Date:** 2026-05-20
**Status:** Authoritative — supersedes any prior contradicting guidance in `08`/`09`/`10` until they're updated to match.
**Sources:**

- Daniel's three messages on 2026-05-20 (transcribed below)
- Product-owner discipline directive issued the same day
- Integration audit findings in `11-integration-audit-post-p2.5r-04.md`

This document is the **north star** for forward planning. Every other spec (`08`, `09`, `10`, `06`, the BFF YAML, the TS types, MSW handlers, persona fixtures, UI consumers) must read in light of this one.

---

## 1. Daniel's three messages (verbatim, 2026-05-20)

### 1.1 `spanner_ddl_all.txt` is the authoritative DDL doc

> "If you're busy thinking about integrations some useful starting points that may be helpful to quickly find out what functionality is generally available and what tables do what you'll find a document in the main repository in `./docs/architecture/spanner_ddl_all.txt` it's an updated copy of all ddl's in active spanner tables and their indexes. I do that to make it super easy for agents to understand contract shapes without it needing to do a ton of spanner queries and pulls (im really strict about not letting agents write to spanner or do any build/deploy and terraform btw, I keep those human gated on purpose)"

**Authoritative interpretation:**

- `docs/architecture/spanner_ddl_all.txt` is the **source of truth for every Spanner table shape**. The IO docs (`docs/IOs/*.md`) describe intent; the DDL describes reality.
- Daniel keeps the DDL doc updated as he changes the schema. The frontend treats the DDL as canonical.
- **Agents never write to Spanner directly.** Daniel keeps Spanner writes, builds, deploys, and terraform human-gated. The BFF code may issue Spanner reads only; writes go via Pub/Sub publishes that Daniel-implemented services consume.
- New tables the frontend proposes (BFFNonces / DocumentVersions / DocumentAcks / SupportEvents / AuthAccounts / AuthAccountLinks / AuthSessions / etc.) are submitted as DDL stubs for Daniel to review and paste into `spanner_ddl_all.txt`.

### 1.2 Keep the DDL doc updated as new tables land

> "So just keep that doc up to date with any new table ddl's and their index ddls as you create new tables for the front end."

**Action protocol for any new frontend-owned table:**

1. Propose the DDL in a frontend spec doc (e.g., `14-auth-account-design.md` for the auth-account tables).
2. Include PK choice, secondary indexes, NOT NULL constraints, NUMERIC vs FLOAT64 typing per Daniel convention, and any interleave-in-parent relationships.
3. Send the DDL stub to Daniel as a paste-ready block.
4. Daniel applies it (terraform / manual) and updates `spanner_ddl_all.txt`.
5. Only then does BFF code reference the table — never before.

### 1.3 admin-portal as the integration reference; auth-account vs trading-account distinction

> "Also, for understanding front end integrations you can have an agent examine the admin-portal app because even though the app is rough (just use it for UI interface instead of operational scripts now) it has most of the key admin actions and endpoint integrations that would also be available (or used) in the public front end app. (like the functionality needed for adding a new trading acct - separate to auth acct but they should be linked in new auth acct tables u create)"

**This is the most consequential of the three messages.** It establishes two things:

**(a) admin-portal is the BFF integration reference.** The patterns Daniel has already proven inside `apps/admin-portal/` — auth flow, REST envelope, correlation_id handling, Pub/Sub publish patterns, Spanner read patterns, error envelope, SSE conventions — are the patterns the public investor BFF should mirror. Even though admin-portal is operator-only, its internal call shapes are the canonical "this is how the frontend talks to Daniel" reference.

**(b) Auth account is separate from trading account but linked.** Today the frontend conflates them (`acct_maya_001` is treated as both the SIWE wallet identity and the trading account). Per Daniel:

```
auth_account (NEW — frontend creates these tables, Daniel applies DDL)
  ↕ link via new AuthAccountLinks table
trading_account (existing — Daniel's Accounts / AccountSettings / AccountPrefs)
```

Implications:

- The investor signs in via SIWE → resolves to an **auth account** row (wallet identity, session, profile)
- A trading account is created on Daniel's side (Accounts / AccountSettings / AccountPrefs in Spanner) when the investor connects a broker / completes KYC / accepts disclosures
- A **link row** in `AuthAccountLinks` joins the two
- One auth account may eventually manage multiple trading accounts (family, joint, IRA, etc.); one trading account could in theory have multiple auth managers (admin impersonation, couples)
- "Add a new trading account" is an investor-facing flow that mirrors admin-portal's account-create pattern

The new tables are designed in `14-auth-account-design.md` (Pass B output).

---

## 2. Discipline charter (product-owner directive, 2026-05-20)

The goal is to move from "Claude is doing the right things" (memory + diligence) to "the repo enforces the right things" (CI + tests).

### 2.1 Implementation discipline target

```text
OpenAPI is the contract.
Generated types come only from OpenAPI.
MSW fixtures obey generated types.
Hooks consume generated types.
UI cannot call retired routes.
BFF route handlers map to Daniel-backed Spanner reads, Pub/Sub writes, or declared BFF-owned shims.
Tests fail when any layer drifts.
```

### 2.2 The 12 rules

1. **OpenAPI is the only API source of truth.** `packages/api-clients/openapi/refi-api.yaml` defines every wire shape and route. Anything else mirrors it.
2. **Do not hand-edit `generated/api.ts`** except as a temporary bridge. Regenerate from `refi-api.yaml` before closing P2.5R-03. The hand-edited Daniel-canonical types added in the P2.5R-03 additive pass are explicitly a _bridge_ — they get replaced by codegen output.
3. **CI guards drift.** A CI check fails if `generated/api.ts` differs from `openapi-typescript`'s output against the current YAML.
4. **P2.5R-03 is contract work only.** No new visible UI.
5. **P2.5R-04 rewrites MSW handlers + persona fixtures** to the new BFF shapes. The legacy `/orders/preview`, `POST /orders`, and `PATCH /recommendations/:id` actions are forbidden in new code.
6. **Retired-route tests forbid:** `/orders/preview`, raw investor `POST /orders`, `PATCH /recommendations/:id action=accept|reject|request_review`, `approveAction`/`rejectAction`/`requestReviewAction` on recommendation detail.
7. **Tier-action tests prove the matrix:**

   | Tier                    | Recommendation detail actions |
   | ----------------------- | ----------------------------- |
   | Signal                  | Save, Dismiss, Upgrade        |
   | Managed, no exception   | View record only              |
   | Managed, with exception | Open Exception Review         |
   | Admin                   | No investor CTA               |

   No Accept button anywhere except Exception Review.

8. **Persona schema tests** validate Maya, Sarah, David, and Admin fixtures against the canonical types.
9. **Enum tests block** retired status values: `mined`, `reverted`, `acked`, `cancelled` (British spelling), `partial`. Daniel's lifecycle enum from `apps/common/trade_lifecycle/states.py` is the only valid source.
10. **String-decimal tests** verify all money / quantity / price / equity / notional / exposure / fill fields are TS `string` (not `number`) where Daniel's DDL is NUMERIC. Floats over the wire = silent precision loss.
11. **`BFF_DEPENDENCY` header** on every BFF route handler. Source type (Spanner | Pub/Sub | External API | BFF-owned), Daniel source citation, tables/topics, failure mode, fail-closed behavior, correlation_id handling, PII handling.
12. **No P2.5R-05 lineage UI** until P2.5R-03 and P2.5R-04 are green.

### 2.3 Two-layer type system

Daniel's backend truth is **not** the same as the investor UI view. Two layers:

**Daniel-canonical layer** (mirrors `spanner_ddl_all.txt` exactly):

- `AccountIntent`
- `RiskSnapshot`
- `ExecutionPlan`
- `Order`
- `OrderEvent`
- `BrokerOrderAttempt`
- `Fill`
- `ExecutionSaga`
- `Position`
- `TradingControlState`
- `TemplateTarget`

**UI projection layer** (BFF-composed, investor-facing):

- `Recommendation`
- `RecommendationDetail`
- `Exception`
- `ExecutionPolicy`
- `DashboardSummary`
- `ActivityEvent`
- `RecordView`

**The BFF maps Daniel-canonical objects into UI projections.** UI projections never pretend to be Daniel-native objects. When a BFF route returns a UI projection, the projection's TS type is named distinctly (e.g., `DashboardComposite` is a projection; `OrderRow` is canonical).

### 2.4 Compliance tripwires (SEC Rule 203A-2(e))

Treated as product-control issues, not copy issues.

**Forbidden copy scan** (extends the existing `scan-copy` blocked-terms list):

- "advisor will review"
- "founder review"
- "manual approval"
- "staff recommendation"
- "our team will adjust your portfolio"
- "contact us for trade advice"

**Required evidence fields on every recommendation detail:**

- `account_intent_id`
- `risk_snapshot_id` (or the `snapshot_hash` it carries)
- `snapshot_hash`
- `execution_policy_id`
- `model_version`
- `profile_version`
- `disclosure_version_set`
- `correlation_id`
- `created_at`
- `decision_source = "software"`

**Support boundary** — already enforced by `apps/web/app/us/_lib/support-boundary/` classifier; the test layer adds explicit assertions:

- Allowed: platform navigation, account setup, model-mechanics explanation, bug reports, records export
- Blocked: "Should I buy AAPL?", "Change my risk score for me", "Tell me what to sell", "Override the algorithm"

### 2.5 No-drift PR checklist

Every PR must answer:

1. Did this change OpenAPI?
2. If yes, was `generated/api.ts` regenerated?
3. Did MSW handlers change to match?
4. Did persona fixtures change to match?
5. Did hooks preserve generated return types?
6. Did tests cover Signal, Managed, Exception, and Admin?
7. Did `scan-copy` pass?
8. Does this add any off-platform or human-advice language?
9. Does this add any retired route usage?
10. Does this preserve `correlation_id` through the full path?

No checklist, no merge.

---

## 3. Sprint sequencing (overrides earlier ticket numbering)

The earlier MIG-P2.5R-NN ordering (in `08 §9` + `09 §6`) remains correct as a dependency graph but is re-organized into named sprints for the discipline pass:

### Sprint A — Contract discipline (do first)

1. Finish P2.5R-02 — OpenAPI BFF projection rewrite ✅ done
2. **Regenerate `generated/api.ts` from `refi-api.yaml`** (replaces the hand-edited additive types from the P2.5R-03 bridge)
3. **Add CI drift guard** — fail if `generated/api.ts` differs from codegen output
4. **Add retired-route scan** — fail if any of the forbidden routes appear in source
5. **Add tier-action matrix tests** — assert the 4 rows of the matrix in §2.2 rule 7

### Sprint B — Schema discipline

6. Finish P2.5R-03 — restated as: clean Daniel-canonical vs UI-projection sections in YAML, regenerate TS, mark legacy types `@deprecated`
7. Add enum tests blocking `mined|reverted|acked|cancelled|partial`
8. Add string-decimal tests on all money/quantity fields
9. Remove legacy imports from any new code path

### Sprint C — Fixture discipline

10. Finish P2.5R-04 — rewrite MSW handlers + persona fixtures against new BFF shapes
11. Add the Admin persona (in addition to Maya/David/Sarah) for the tier-action matrix
12. Add schema validation over every persona
13. Add fail-closed fixture variants per persona

### Sprint D — BFF discipline

14. Implement first read-only BFF route (the dashboard composite is the lowest-risk candidate)
15. `BFF_DEPENDENCY` header convention applied to every route handler
16. Correlation-ID middleware
17. Error envelope shape enforced
18. Feature-flag cutover per domain via `BFF_LIVE_DOMAINS` env var

### Sprint E — Product surface (only after A/B/C/D green)

19. Records Center
20. Recommendation lineage panel (P2.5R-05)
21. Exception Review queue (P2.5R-18)
22. Execution Policy activation flow (P2.5R-17)
23. Dashboard composite consumption (P2.5R-07)

**Sprint E may not begin until Sprints A/B/C are green and at least one Sprint D route is live in staging.**

---

## 4. What changes confidence from medium to high

**Medium confidence (today):**

- The plan is right.
- Claude is moving in the right direction.
- The app still relies on discipline by memory.

**High confidence (target):**

- The repo blocks the wrong implementation.
- Legacy paths fail tests.
- Generated types cannot drift.
- Fixtures cannot lie.
- Managed users cannot see the wrong buttons.
- Every BFF route declares its backend source.
- Every investor action has a `correlation_id`.
- The compliance posture is enforced by code, not reminders.

That is the threshold.

---

## 5. Cross-references

- `08-daniel-rescope-plan.md` — Daniel-code analysis + MIG-P2.5R ticket plan (still authoritative as a dependency graph; sprint mapping above re-organizes the same tickets)
- `09-daniel-answers-and-product-reframe.md` — tier model + execution-policy.activate canonical accept payload + per-decision investor approval = Exception Review only
- `10-bff-architecture-decision.md` — BFF lives in Next.js Route Handlers at `apps/web/app/api/v1/*`; Workload Identity; per-domain `BFF_LIVE_DOMAINS` cutover flags
- `06-backend-contract-map.md` — per-BFF-endpoint mapping to Daniel source
- `11-integration-audit-post-p2.5r-04.md` — 11 wire-shape drifts to fix in Sprint A/B
- `13-admin-portal-integration-reference.md` — (Pass B output) admin-portal's actual REST surface + Spanner write + Pub/Sub patterns we mirror
- `14-auth-account-design.md` — (Pass B output) DDL stubs for AuthAccounts / AuthAccountLinks / AuthSessions / AuthSiweNonces

---

## 6. Document history

- 2026-05-20 — Initial publication. Captures Daniel's three messages of 2026-05-20 + the product-owner discipline charter + sprint re-org.
