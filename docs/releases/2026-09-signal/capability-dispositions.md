<!-- Tracked canonical copy, committed 2026-08-22. Baseline: main @ 607a7ae (pre-C0). Sections B/C are superseded in part by c0-capability-audit.md, which found the browser-direct surface this table missed; retained because sections C (local-change dispositions) and D (critical-path map) remain current. -->

# Disposition Tables — Managed surfaces, local changes, critical path

**Classification only. Nothing modified.** Baseline `origin/main @ 607a7ae` (post-#46).

---

# B. The 15 reachable Managed/execution surfaces

Split first by the property that matters: **does it create mutable business state?**
6 of the 10 routes go through `bffMutate`; 4 are `GET` reads.

## B1. Mutating routes — presumptively out of the Signal artifact (6)

| Path                         | Method | Business function         | Exists in Sept Signal architecture?                                                                                                                                                                  | Class                | Tests                                                        |
| ---------------------------- | ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------ |
| `execution-policy/`          | PUT    | update execution policy   | No — execution is Managed                                                                                                                                                                            | `REMOVE_FROM_SIGNAL` | managed-activation                                           |
| `execution-policy/activate/` | POST   | activate execution policy | No                                                                                                                                                                                                   | `REMOVE_FROM_SIGNAL` | managed-activation                                           |
| `execution-policy/draft/`    | PUT    | save policy draft         | No                                                                                                                                                                                                   | `REMOVE_FROM_SIGNAL` | automation-center                                            |
| `managed/pause/`             | POST   | pause autopilot           | No — `pause_autopilot` is Managed-paper gated                                                                                                                                                        | `REMOVE_FROM_SIGNAL` | managed-pause-resume                                         |
| `managed/resume/`            | POST   | resume autopilot          | No — `resume_autopilot` gated                                                                                                                                                                        | `REMOVE_FROM_SIGNAL` | managed-pause-resume, disclosure-reack, profile-reactivation |
| `exceptions/[id]/resolve/`   | POST   | resolve an exception      | **Partly** — resolution categories include `update_profile`, `reconnect_broker`, `acknowledge_disclosure`, which are Signal-relevant; `approve_exception`/`reject_exception`/`pause_managed` are not | `NEEDS_DAN_CONTRACT` | exception-review                                             |

`exceptions/[id]/resolve` is the one genuine judgement call in this group. Three
of its six `ExceptionResolutions` are Signal-relevant consent/connection
remedies. Splitting it may be right; deleting it wholesale would remove
Signal behaviour.

## B2. Read-only routes — lower risk, still not Signal surface (4)

| Path                                | Method | Class                | Rationale                                                                       |
| ----------------------------------- | ------ | -------------------- | ------------------------------------------------------------------------------- |
| `orders/`                           | GET    | `REMOVE_FROM_SIGNAL` | Signal produces no orders; the read implies an order domain that must not exist |
| `orders/[client_order_id]/lineage/` | GET    | `REMOVE_FROM_SIGNAL` | same                                                                            |
| `managed/state/`                    | GET    | `REMOVE_FROM_SIGNAL` | Managed Execution State has no meaning with no Managed product                  |
| `exceptions/`                       | GET    | `NEEDS_DAN_CONTRACT` | same split as `exceptions/[id]/resolve`                                         |

A GET is not harmless here. §17's test is reachability, not mutation — and an
exposed `orders` read tells an auditor an order domain exists.

## B3. Pages (5)

| Path                                      | Business function                                   | Class                | Rationale                                                                                                    |
| ----------------------------------------- | --------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `us/app/settings/automation/`             | Automation Center — policy activation, pause/resume | `REMOVE_FROM_SIGNAL` | the Managed control surface itself                                                                           |
| `us/app/settings/automation/activate/`    | activate execution policy                           | `REMOVE_FROM_SIGNAL` | Managed activation                                                                                           |
| `us/app/settings/automation/profile/`     | **advisory-profile reactivation**                   | **`MOVE_TO_SIGNAL`** | §7.5 keeps advisory profiles on the Signal surface. Managed-era URL, Signal business function. 12 e2e tests. |
| `us/app/settings/automation/disclosures/` | **disclosure re-acknowledgment**                    | **`MOVE_TO_SIGNAL`** | §7.5 keeps disclosures and consents on the Signal surface. Same pattern.                                     |
| `us/app/exceptions/`                      | exception review                                    | `NEEDS_DAN_CONTRACT` | follows the `exceptions` split                                                                               |

Confirms the hypothesis: **two of the five pages are Signal functionality wearing
Managed URLs.** Their supporting routes — `profile/reconfirm`,
`profile/reactivation`, `disclosures/reacknowledge` — already sit outside
`automation/` and are unaffected; only the page location and IA move.

## B4. Summary

```
REMOVE_FROM_SIGNAL     9   (3 exec-policy, 2 managed writes, 3 reads, 2 pages… see note)
MOVE_TO_SIGNAL         2   (profile reactivation, disclosure re-ack)
NEEDS_DAN_CONTRACT     3   (exceptions GET, exceptions resolve, exceptions page)
HARD_DISABLE_FOR_SIGNAL 0  (preferred only where removal breaks a shared boundary)
KEEP_SIGNAL            0
```

Counting note: 10 routes + 5 pages = 15. `REMOVE_FROM_SIGNAL` = 7 routes + 2 pages.

**`HARD_DISABLE` is deliberately empty.** §14 wants the absence of an execution
path to be _"a structural property of deployment and IAM, not a product promise
enforced only by a frontend flag."_ Removal is the stronger reading; disablement
should be the exception, justified case by case.

---

# C. The 21 local changes

| Change                                                          | Class                | Rationale                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bff/handler.ts` — release gate                                 | `LAND_WITH_REWRITE`  | The finding stands: `main` asserts the gate at `contract-assertions.ts:666` and never calls it. But if the Managed verbs' routes are removed, the gate guards nothing reachable. It becomes a **defence-in-depth backstop**, not the primary boundary — worth landing, worth rewriting the rationale. |
| `receipt.ts` — receipt verb vocabulary                          | `LAND_UNCHANGED`     | `receiptVerbFor` / `InvestorActionReceiptVerb` already on `main`; pure consumer update, Signal-neutral.                                                                                                                                                                                               |
| `account-prefs-invariants.test.ts`                              | `LAND_WITH_REWRITE`  | Content is Signal-relevant (the four launch preferences). Must not introduce the `packages/api-clients → apps/web` inversion — re-home to the owning layer.                                                                                                                                           |
| `e2e/api.ts`, `e2e/hydration.ts`                                | `LAND_UNCHANGED`     | Infrastructure helpers, model-agnostic.                                                                                                                                                                                                                                                               |
| `playwright.config.ts`                                          | `LAND_WITH_REWRITE`  | `REFI_RELEASE_STAGE: "managed_paper"` exists to satisfy the gate for Managed specs. If those specs go, the setting inverts to `signal`.                                                                                                                                                               |
| `profile-reactivation.spec.ts` (12 tests)                       | `LAND_WITH_REWRITE`  | Signal behaviour; URLs change with the `MOVE_TO_SIGNAL` page.                                                                                                                                                                                                                                         |
| `disclosure-reack.spec.ts`                                      | `LAND_WITH_REWRITE`  | same                                                                                                                                                                                                                                                                                                  |
| `support.spec.ts`                                               | `LAND_UNCHANGED`     | Signal surface, unaffected.                                                                                                                                                                                                                                                                           |
| `eligibility.spec.ts`                                           | `LAND_UNCHANGED`     | Signal surface.                                                                                                                                                                                                                                                                                       |
| `exception-review.spec.ts`                                      | `NEEDS_DAN_CONTRACT` | follows the exceptions decision.                                                                                                                                                                                                                                                                      |
| `managed-activation.spec.ts`                                    | `PARK_FOR_MANAGED`   | tests a removed surface.                                                                                                                                                                                                                                                                              |
| `managed-pause-resume.spec.ts`                                  | `PARK_FOR_MANAGED`   | tests a removed surface.                                                                                                                                                                                                                                                                              |
| `compliance/` (CONTROL_MATRIX)                                  | `LAND_WITH_REWRITE`  | Valuable and becomes more so — it is the evidence artifact counsel reads at Gate B. Rows must be re-verified against post-#46 reality.                                                                                                                                                                |
| `docs/security/THREAT_MODEL-alpha-handoff.md`                   | `LAND_UNCHANGED`     | alpha-handoff scope, independent.                                                                                                                                                                                                                                                                     |
| `docs/branch-disposition-register.md`, `branch-delete-list.txt` | `LAND_WITH_REWRITE`  | Condense into `docs/archive/branch-audit-2026-08-22.md` as previously agreed; not launch-critical.                                                                                                                                                                                                    |
| `artifacts/`, `PROD_BRIEF.md`, `.xlsx`, `.claude/`              | _(excluded)_         | awaiting separate adjudication, unchanged.                                                                                                                                                                                                                                                            |
| `september-12-launch/`                                          | `NEEDS_DAN_CONTRACT` | do not commit without Daniel's authorization.                                                                                                                                                                                                                                                         |

Nothing has been modified. The dropped `RecommendationProjection` freshness
change is preserved in branch history and a backup archive; it returns with the
`AccountRecommendation` model.

---

# D. September critical-path map

## D1. Daniel / backend

| Capability                                | Status                                                              | Criticality                                 |
| ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| Canonical index membership (S&P 500)      | not delivered                                                       | **DATE-CRITICAL**                           |
| Portfolio construction + activation       | not delivered                                                       | **DATE-CRITICAL**                           |
| Reconciled Alpaca account valuation       | not delivered                                                       | **DATE-CRITICAL**                           |
| `AccountRecommendation` + legs            | not delivered                                                       | **DATE-CRITICAL**                           |
| Investor API schemas / connection package | not delivered                                                       | **DATE-CRITICAL** — gates our schema freeze |
| Account authorization                     | partially specified (`ACCOUNT_AUTHORIZATION` route constant exists) | **DATE-CRITICAL**                           |
| Recommendation freshness                  | contract settled; source pending                                    | blocked, not date-critical                  |

**Every one of the first six is DATE-CRITICAL**, because Gate A requires that the
real backend recommendation path _can be integrated and tested_. Fixtures cannot
satisfy that criterion. This is the single largest risk to September 13 and it is
not ours to resolve.

## D2. This repo — frontend + BFF

| Workstream                                    | Depends on Daniel?                | Can start now?              |
| --------------------------------------------- | --------------------------------- | --------------------------- |
| Structural no-execution shell (B1–B3)         | No                                | **Yes — start immediately** |
| Production-artifact E2E + CI                  | No                                | **Yes — start immediately** |
| Support-boundary server-side reclassification | No                                | **Yes — start immediately** |
| Account isolation proof                       | No                                | Yes                         |
| Identity / session integration                | Partly (identity-ccid)            | Partly                      |
| Onboarding flow                               | Partly (schemas)                  | Mostly                      |
| Disclosures / consent machinery               | No (content is Gate B)            | Yes                         |
| Records / receipts                            | No                                | Yes                         |
| Product membership UX                         | Yes (templates/membership schema) | No                          |
| Preferences / exclusions UX                   | Partly (four fields known)        | Partly                      |
| **Recommendation summary + legs UI**          | **Yes — wire contract**           | **No**                      |

Three workstreams are fully unblocked and belong to Gate A regardless of what
Daniel delivers: the no-execution shell, production-artifact E2E in CI, and the
support-boundary server-side reclassification. They are also the three most
likely to be audited.

## D3. The three clocks

1. **Product** — September 13 release candidate.
2. **Backend dependency** — when Daniel can produce a real recommendation through
   Investor API. Currently the binding constraint.
3. **Regulatory** — Gate B, decoupled from September 13 by the milestone
   redefinition, but with the longest lead time on document drafting.

Clock 2 determines whether Gate A is achievable. Clock 3 no longer gates
September 13 but should start now, because counsel review of a finished product
is faster than counsel review plus drafting from zero.

---

# E / F — noted, no action

- **No `AccountRecommendation` schema will be implemented** until
  `05_account_investor_lifecycle_checklist.md` or the exported Investor API
  contract arrives. Conceptual shape is known; literals are not invented.
- **Daniel's privately shared files stay out of the repository** until he
  authorizes it. The README references them by name and marks them
  "not yet in this repository".

# Two additional classifications requested

- **`alpha-claim`** — acquisition plumbing, not regulated advisory surface.
  Flag-gated (`FLAG_ALPHA_CLAIM_ROUTE`, serves only when exactly `"on"`, else
  404). Class: `NEEDS_PRODUCT_DECISION` — whether Man vs Machine hands users
  into Signal on September 13. It should not contaminate the core contract; its
  flag default (`off`) already keeps it out of the artifact unless chosen.
- **`subscription-mode`** — a user-facing Signal-vs-Managed choice is
  meaningless when Signal is the only product. Backend may retain the concept
  for forward compatibility. Class: `REMOVE_FROM_SIGNAL` **as investor-facing
  UX**; retain the session/tier plumbing.
