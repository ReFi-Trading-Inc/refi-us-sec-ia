# Admin ↔ Investor Boundary

**Date:** 2026-05-20
**Purpose:** Define the impermeable boundary between admin/operator commands (which live in Daniel's `apps/admin-portal`) and the investor product (this repo). The boundary is enforced by code, CI, copy, and tests — not by convention.

---

## Principle

Admin commands operate the system. They are not investor-facing advisory acceptance.

This is the line:

```
[Daniel's admin-portal]                    [this repo's investor product]
─────────────────────────────              ─────────────────────────────
template.admin rebalance                   activateManagedPolicy
manual-rebalance                           pauseAutomation
force-inference                            resumeAutomation
force-training                             updateAccountPrefs
cancel-order                               refreshProfile
rollback                                   acknowledgeDisclosure
config-write                               connectBroker / disconnectBroker
controls-write                             approveUserSideException
account-initialize                         dismissSignal / saveSignal
                                           viewRecord / downloadRecord / exportRecord
```

No item on the left may be reachable through any path on the right.

---

## Enumerated admin commands (must never be reachable from `apps/web`)

Source: `/Users/za/Library/CloudStorage/Dropbox/Nature Of Commerce LLC/ReFi/Website/Daniels Back End/refinity-main-main/apps/admin-portal/backend/api/`

| Command                                                                                                    | File                                                | Why it's admin-only                                        |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| `template.admin action=rebalance target_account_id=X`                                                      | `accounts.py:561` (`dispatch_account_admin_action`) | Operator-initiated rebalance is operational, not advisory. |
| `POST /accounts/populate`                                                                                  | `accounts.py:1021`                                  | Account initialization is operational.                     |
| `DELETE /accounts/{id}`                                                                                    | `accounts.py:1259`                                  | Destructive operator action.                               |
| `POST /operations/force-inference`                                                                         | `operations.py`                                     | System operational trigger.                                |
| `POST /operations/force-training`                                                                          | `operations.py`                                     | System operational trigger.                                |
| `POST /operations/force-data-load`                                                                         | `operations.py`                                     | System operational trigger.                                |
| `POST /operations/cancel-order`                                                                            | `operations.py`                                     | Operator override of execution.                            |
| `POST /operations/rollback`                                                                                | `operations.py`                                     | Destructive operational action.                            |
| `POST /operations/trigger-rebalance`                                                                       | `operations.py`                                     | Operator-initiated rebalance.                              |
| `POST /internal/launch-init`, `launch-ss`, `publish-inference-catchup`, `rollback/run`, `populate-returns` | `internal.py`                                       | Internal operational commands.                             |
| `PUT /settings/trading-controls/{scope}/{id}`                                                              | `settings.py`                                       | Kill-switch / reduce-only; operator policy.                |
| `POST /pricing-rules/relax-all`                                                                            | `pricing-rules.py`                                  | Operator policy.                                           |
| `DELETE /locks/{type}/{key}`                                                                               | `locks.py`                                          | Operator override.                                         |
| `POST /asset-initializer/*` (initialize, batch-initialize, parity oracle)                                  | `asset-initializer.py`                              | System operational.                                        |
| `PATCH /assets/{asset}/version`, `POST /assets/{asset}/activate`, `PATCH /assets/{asset}/status`           | `assets.py`                                         | Operator asset lifecycle management.                       |
| `POST /interventions` (write)                                                                              | n/a — automatic via middleware                      | Operator audit; not investor surface.                      |

Read-only operator views (dashboard, traces, intervention log, etc.) are also admin-only — the investor's Records Center is a separate, purpose-built projection (see `bff-prototype-state-contract.md` `AdvisoryRecordProjection`).

---

## Enforcement

### 1. CI Tripwire (G-012) — required

Implemented as `scripts/tripwire-investor-boundary.ts` and wired into `.github/workflows/ci.yml` as the `Investor-boundary tripwire` step. It scans every `.ts`/`.tsx`/`.js`/`.jsx`/`.md` file under `apps/web/**` for:

1. **Admin endpoint substrings** — `admin-portal`, `/admin-actions`, every `/operations/<command>`, every `/internal/<command>`, `/interventions`, `/trading-controls/`, `/pricing-rules/relax-all`, `/asset-initializer`, `template.admin`.
2. **Forbidden action identifiers** (word-boundary): `acceptRecommendation`, `approveTrade`, `approveRebalance`, `adminRebalance`, `manualTradeSubmit`, `manualRebalance`, `forceInference`, `forceTraining`, `forceDataLoad`, `cancelOrder`, `configWrite`, `controlsWrite`, `accountInitialize`, `staffReviewAdvice`, `founderApproveRecommendation`, `editRecommendation`, `triggerRebalance`.
3. **Forbidden user-facing labels** (case-insensitive substring): "accept recommendation", "approve trade", "approve rebalance", "manual rebalance", "force inference", "force training", "config write", "controls write", "account initialize", "operator approval", "operator review", "founder approval", "staff approval", "staff review".
4. **Forbidden route paths**: any file mounted under
   - `apps/web/app/admin/`
   - `apps/web/app/api/admin/`
   - `apps/web/app/api/v1/investor/recommendations/[id]/accept/`
   - `apps/web/app/api/v1/investor/recommendations/[id]/approve/`
   - `apps/web/app/api/v1/investor/exceptions/[id]/approve/` (superseded by `/resolve`)
   - `apps/web/app/api/v1/investor/managed-policy/` (renamed to `/execution-policy` + `/managed/*`)
   - `apps/web/app/api/v1/investor/mode/` (renamed to `/subscription-mode`)

Per-line opt-out: `// allow-investor-boundary: "<pattern>" reason: "<why>"`.

A complementary `scripts/contract-assertions.ts` (run as the `Contract assertions` CI step) proves at runtime that:

- `InvestorActions` and `RecordAccessActions` are disjoint
- forbidden identifiers (including superseded `activateManagedPolicy` and `approveUserSideException`) are not in `InvestorActions`
- `ExceptionResolutions` covers the 6 required categories and rejects "approve_trade"
- decimal-string refiner accepts/rejects per the brand contract
- profile snapshots, decision records, and execution policies are immutable per version
- `InvestorActionReceipt` and `RecordAccessLog` streams never co-mingle

### 2. Route deletion

- `apps/web/app/admin/page.tsx` — **delete**. Not "return notFound()" — delete the file. The investor app has no admin surface.
- `apps/web/app/explorer/page.tsx` — **delete** unless Zeshan commits to a specific investor purpose for it.

### 3. Copy enforcement

`packages/config/blocked-terms.ts` already includes most violations. Verify presence of these terms (add any missing):

- "admin rebalance", "manual rebalance", "force rebalance", "trigger rebalance"
- "force inference", "force training", "force data load"
- "cancel order" (when investor-facing), "rollback", "config write", "controls write", "account initialize"
- "operator approval", "operator review", "compliance officer review" (when describing per-trade advice)
- "approve trade", "accept recommendation", "approve rebalance"
- "founder approval", "staff approval", "staff review"

Investor-facing language for analogous concepts:

- "Managed execution is paused" (not "operator paused your account")
- "Verification is pending" (not "awaiting compliance officer review")
- "ReFi has paused activity on this account due to a system condition" (not "operator intervention")

### 4. Type-level enforcement

The `InvestorActionName` union (from `investor-action-taxonomy.md`) excludes every admin command by construction. BFF routes typed against this union cannot accept an admin action.

### 5. Tests

- **Vitest:** assert `blocked-terms.ts` includes every term listed under "Copy enforcement."
- **Vitest:** assert no file under `apps/web/app/api/v1/**` imports or `fetch`es a URL matching `**/admin-portal/**` or any admin command path.
- **Playwright:** navigation tests starting from `/us` cannot reach any admin route by following links / forms / clicks; if a URL is constructed pointing to `/admin/*` or any admin command path, the test fails.

---

## Operator → Investor projection policy

When an operator action in Daniel's admin-portal affects an investor account (e.g. an operator pauses trading via `trading-controls`), the investor must see plain-language status, not operator vocabulary.

Examples:

| Admin event                                             | Investor-visible projection                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `TradingControlStates.mode = halt_all` (account scope)  | `ManagedPolicyState.status = paused_by_system`; banner: "Managed execution is currently paused while we verify account conditions." |
| `TradingControlStates.mode = reduce_only`               | Banner: "Trading is in protective mode; new positions are paused."                                                                  |
| `AdminInterventions` write affecting investor's account | Surfaced only if it changes a record investor can see — and then summarized in plain language. Default: not surfaced.               |
| `cancel-order` against an investor's open order         | Order shows status `canceled` with reason "canceled by ReFi during system check"; full operator detail not exposed.                 |

The projection mapping lives in `apps/web/lib/bff/projections/operator-events.ts` (to be built). Anything not on the mapping is **not** surfaced to the investor.

---

## Allowed actions (this doc)

- Delete `apps/web/app/admin/page.tsx`.
- Add the tripwire test (G-012).
- Extend `blocked-terms.ts` with any missing copy from the enforcement table.
- Implement the operator → investor projection mapping as a small, explicit allowlist.

## Prohibited actions (this doc)

- Adding any route, link, button, hook, or test fixture that references admin endpoints from `apps/web`.
- Surfacing operator vocabulary to the investor.
- Wrapping an admin command in a "safer" investor-friendly button.
- Adding an admin section to the investor settings ("for operators only" — no such thing in this product).

## Backend source of truth

Daniel's `apps/admin-portal` is the only home for admin commands. The investor BFF is the only allowed bridge for projections, and the projection allowlist is explicit (not "everything except").

## Temporary BFF-owned state

None for this boundary. Enforcement is code + tests + copy, not state.

## Record requirement

When an operator → investor projection fires (e.g. a system pause), an `InvestorActionReceipt` is written with `actor: "system"` and the upstream reason code. The investor sees a record of the pause; the record does not contain operator identity.

## UI implication

- No admin surfaces in `apps/web` — at all.
- Operator-caused state is always rendered as system state, never as "operator did X."

## Test implication

- Tripwire test (described above).
- Vitest copy-block assertion.
- Playwright unreachable-from-investor assertion.
- Vitest projection allowlist test: any code calling `projectOperatorEvent(eventType)` for a type not on the allowlist throws.
