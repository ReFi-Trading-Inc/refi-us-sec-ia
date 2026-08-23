<!-- Tracked canonical copy, committed 2026-08-22 (Revision 2). Audit baseline: main @ 42e9603; two slices have since merged — see open-items.md for current state. -->

# C0 — Signal Capability Audit

**Baseline:** clean worktree at `42e9603` · **Read-only. No file modified.**
**Revision 2 (post-review):** order-route dispositions corrected; broker-credential
target changed from "paper-only" to read-only live authorization.
**Method:** audited from clean `main`, not from the previous scratchpad or the dirty `september-launch` tree.

---

## 0. Headline: the 15-surface list was materially incomplete

The earlier inventory counted **BFF routes and pages**. It missed the browser-direct API surface entirely.

`packages/api-clients` calls **25 external endpoints straight from the browser** via `apiFetch`, bypassing every server in this repository:

```
/auth/session · /auth/refresh · /auth/revoke-all · /ccid/start · /ccid/status
/ccid/webhook/provider · /siwe/nonce · /siwe/verify · /orders · /orders/preview
/v1/account/activate · /v1/account/activation · /v1/activity · /v1/brokers/account
/v1/brokers/connect/keys · /v1/brokers/connect/start · /v1/brokers/connection
/v1/brokers/disconnect · /v1/brokers/orders · /v1/brokers/positions
/v1/brokers/supported · /v1/documents/acknowledge · /v1/profile
/v1/recommendations · /v1/strategies/current
```

This is the same architecture that produced the support defect, at ~25× the surface area. **No BFF gate, release-stage check, or `bffMutate` policy can reach any of it.** A Signal capability boundary enforced only in `bffMutate` would be enforced on roughly half the product.

`/siwe/nonce` and `/siwe/verify` are also live client hooks for the identity model Phase 2.7 replaced.

## 1. Corrections to my own earlier claims

- **`useSubmitOrder` / `useCancelOrder` are genuinely absent.** They appear only in comments; I checked because an export-list grep matched comment text. No order-write hook exists.
- **`bffReadWithAccessLog` is a fourth auth wrapper.** My first pass flagged `evidence/*`, `records/[id]`, and `orders/…/lineage` as unauthenticated. They are not — that wrapper authenticates and writes a `RecordAccessLog`. No finding there.

## 2. Route capability table (36 routes on clean main)

Genuinely unauthenticated: `/.well-known/jwks.json` and `/api/health` (both in the `public-routes` allowlist with recorded reasons), `/api/us/eligibility` (pre-auth by design), `/api/v1/investor/alpha-claim` (flag-gated, token-verified).

### Mutating routes — the `bffMutate` set (12)

| Route                          | Action                     | Disposition                | Rationale                                                    |
| ------------------------------ | -------------------------- | -------------------------- | ------------------------------------------------------------ |
| `us/support`                   | `submitSupportRequest`     | `KEEP_SIGNAL`              | Workstream B                                                 |
| `disclosures/[id]/acknowledge` | `acknowledgeDisclosure`    | `KEEP_SIGNAL`              | §7.5 Signal surface                                          |
| `disclosures/reacknowledge`    | `acknowledgeDisclosure`    | `KEEP_SIGNAL`              | §7.5                                                         |
| `profile` (POST)               | `refreshProfile`           | `KEEP_SIGNAL`              | §7.5 advisory profiles                                       |
| `profile/reconfirm`            | `refreshProfile`           | `KEEP_SIGNAL`              | §7.5                                                         |
| `subscription-mode` (POST)     | `selectMode`               | `NEEDS_DAN_CONTRACT`       | meaningless with one product; backend may retain the concept |
| `exceptions/[id]/resolve`      | `resolveException`         | **`SPLIT_SIGNAL_MANAGED`** | see §3                                                       |
| `execution-policy` (PUT)       | `updateExecutionPolicy`    | `REMOVE_FROM_SIGNAL`       | execution is Managed                                         |
| `execution-policy/activate`    | `activateExecutionPolicy`  | `REMOVE_FROM_SIGNAL`       | Managed activation                                           |
| `execution-policy/draft` (PUT) | `saveExecutionPolicyDraft` | `REMOVE_FROM_SIGNAL`       | Managed policy authoring                                     |
| `managed/pause`                | `pauseManaged`             | `REMOVE_FROM_SIGNAL`       | gated verb                                                   |
| `managed/resume`               | `resumeManaged`            | `REMOVE_FROM_SIGNAL`       | gated verb                                                   |

### Read routes touching Managed/execution (4)

`orders` · `orders/[id]/lineage` · `managed/state` · `exceptions` — all `REMOVE_FROM_SIGNAL` except `exceptions`, which follows the split. A read is not harmless: §17's test is reachability, and an exposed `orders` read asserts an order domain exists.

### Pages (5)

`settings/automation` and `settings/automation/activate` → `REMOVE_FROM_SIGNAL`.
`settings/automation/profile` → **`MOVE_TO_SIGNAL`** (advisory-profile reactivation; its routes already live outside `automation/`, so only the page and IA move).
`settings/automation/disclosures` → **`MOVE_TO_SIGNAL`** (disclosure re-acknowledgment; same).
`app/exceptions` → follows the split.

**Navigation already excludes all of them.** `NAV_ITEMS` is Home · Portfolio · Recommendations only — Managed pages are reachable by URL, not by menu. Hiding is already done; that is precisely why it is not closure.

## 3. `exceptions/[id]/resolve` — why it must split

The route accepts **any** of the six `ExceptionResolutions` uniformly, with no per-category branching:

```
update_profile · reconnect_broker · acknowledge_disclosure   <- Signal remedies
approve_exception · reject_exception · pause_managed         <- Managed
```

One capability spanning both sides of the boundary. Deleting it removes Signal remediation; keeping it admits Managed resolutions. C1 must enforce per-category.

## 4. Broker-write / IAM matrix

**This repository contains no broker-write capability at all**, which reframes item 5 of the workstream:

| Capability                       | In this repo? | Evidence                                                                         |
| -------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| Broker client (Alpaca SDK/HTTP)  | **No**        | no server-side outbound `fetch` anywhere in `src/lib` or `app/api`               |
| Order write path                 | **No**        | no submit/cancel hook; no server caller                                          |
| Execution publisher / subscriber | **No**        | no Pub/Sub, topic, or Tasks reference                                            |
| Executable-intent writer         | **No**        | no intent-creation code                                                          |
| Broker credentials at rest       | **No**        | `broker/connection` returns status only, "credentials never cross this boundary" |

**But one real exposure exists.** `us/onboarding/broker` collects Alpaca `api_key_id` + `api_secret_key` in the browser and POSTs them **browser-direct** to `/v1/brokers/connect/keys`. The schema accepts `environment: z.enum(["paper", "live"])` — so the September Signal product will **accept live Alpaca trading credentials**.

Even with no execution code here, the _system_ then holds broker-write authority on the investor's behalf. Whether those keys carry trade permission is an Alpaca key-scope question and a Dan-backend storage question.

### Corrected target — read-only authorization, not paper-only

"Paper-only" was the wrong conclusion. It protects the RC by removing the
product rather than the authority, and would have to be undone before any real
client could use Signal.

The September boundary is **no authority**, not **no live account**:

- paper API-key connection may remain as a development/testing path;
- live client connection must use a **read-only authorization model** — for
  Alpaca, OAuth **without the `trading` scope**, and without `account:write`
  unless an exact read requirement justifies it;
- the Signal runtime must never hold a credential or token scope capable of
  placing, cancelling, or modifying an order.

Strictly stronger: live broker **observation** can exist in Signal because the
credential itself cannot trade. The current form — raw live API key + secret,
browser-direct — is `REMOVE_FROM_SIGNAL`. Changing the default to paper while
leaving a reachable live-key submission path would not satisfy it.

If the backend cannot support read-only OAuth by September 13, the RC may
demonstrate paper integration but must not claim the broker connection is
client-onboarding-ready for live accounts.

→ **`EXTERNAL PROOF REQUIRED`** for credential scope in any case.

## 4b. Correction — the three "order" endpoints are not equivalent

My summary grouped them as execution authority. On clean main they are not:

| Endpoint             | Method  | What it is                                                | Disposition                                                                                        |
| -------------------- | ------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/orders`            | **GET** | order read model (`useQuery`)                             | classify against September UX; absence acceptable if no Signal surface needs it                    |
| `/v1/brokers/orders` | **GET** | broker observation (`useQuery`)                           | possibly legitimate reconciliation data — `MOVE_THROUGH_BFF` if retained, not deleted for its name |
| `/orders/preview`    | POST    | compliance **preview**, not submission; also a `useQuery` | `REMOVE_FROM_SIGNAL` — only consumer is the unmounted `CompliancePreview`; do not proxy            |

Submit and cancel hooks are already absent. **Deleting read-only order history
does not prove no-execution and must not be presented as if it did.** The
load-bearing closure is proving there is no submission, cancellation, or
executable-intent path — and no credential that could authorise one.

## 5. Why the old gate is not the design

`isGatedUntilManagedPaper()` keys on the `InvestorActionName → admin verb` mapping and covers exactly `pause_autopilot`, `resume_autopilot`, `reduce_only`. Measured against the table above it would **not** cover `updateExecutionPolicy`, `activateExecutionPolicy`, `saveExecutionPolicyDraft`, or `resolveException`'s Managed categories — and reaches **none** of the 25 browser-direct endpoints.

C1 should be a **Signal capability allowlist** — deny capability expansion unless explicitly Signal-permitted — with the old predicate surviving at most as one input.

## 6. `BFF-412-ENVELOPE` re-evaluated

All three affected routes (`managed/pause`, `managed/resume`, `execution-policy/draft`) are `REMOVE_FROM_SIGNAL`. **Do not migrate the envelope — delete the routes.** Repairing a response contract on a route being removed is wasted work.

## 7. Preserved-11 disposition

| Entry                                                      | Class                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `handler.ts` release gate (design evidence)                | `SUPERSEDED` — re-derive from §5                               |
| `receipt.ts` receipt-verb refactor                         | `USE_IN_C` — symbols already on main, Signal-neutral           |
| `account-prefs-invariants.test.ts`                         | `REWRITE_FOR_C` — never revive the `packages`→`apps` inversion |
| `compliance/` CONTROL_MATRIX                               | `REWRITE_FOR_C` — becomes Gate A evidence                      |
| `docs/security/THREAT_MODEL-alpha-handoff.md`              | `UNRELATED` — alpha-handoff scope                              |
| `branch-disposition-register.md`, `branch-delete-list.txt` | `UNRELATED` — branch cleanup                                   |
| `artifacts/`, `PROD_BRIEF.md`, `.xlsx`, `.claude/`         | `UNRELATED` — awaiting adjudication                            |
| `september-12-launch/`                                     | `NEEDS_DAN_CONTRACT` — do not commit                           |

## 8. Proposed C1/C2 decomposition

**C1a — capability policy.** Central `signalCapabilityPolicy` + enforcement in `bffMutate`, default-deny for non-Signal capabilities. Per-category enforcement for `resolveException`.
**C1b — browser-direct closure.** The largest piece, and **not a 25-endpoint
proxy migration.** Each endpoint is classified `MOVE_THROUGH_BFF` /
`REMOVE_FROM_SIGNAL` / `PUBLIC_DIRECT_OK` / `NEEDS_DAN_CONTRACT`; Managed or
obsolete capabilities are removed rather than proxied to preserve dead
architecture. Several small PRs.
**C2a — surface removal + IA move.** Delete Managed routes/pages; move profile and disclosure pages out of `automation/`.
**C2b — release-authority Signal lane.** Extend the four-test lane to the 11 proofs.
**C2c — deployment/IAM evidence.** External artifact for broker credential scope.

## 9. Signal release-authority tests — proposed

1–2 (boot, CSP/hydration/auth) exist today. Add: every Managed mutation refused **or 404**; execution-policy writes refused or absent; `/orders` unreachable; no executable-intent path; Managed navigation absent (already true — assert it); profile/disclosure remediation still usable after the IA move; `resolveException` rejects Managed categories and accepts Signal ones; no browser-visible per-trade approval; **and a build-time assertion that no `apiFetch` call targets an execution endpoint** — the only mechanical guard for §0.

Not testable here → Gate A external evidence: Alpaca key scope, Signal service-identity IAM, absence of execution publisher bindings.

## 10. Dan questions

- **D-SIGNAL-01** — may September accept `environment: "live"` broker credentials, or paper only? What scope do the keys need for Signal read/reconciliation?
- **D-SIGNAL-02** — which of the 25 browser-direct endpoints survive into September, and which move behind the BFF?
- **D-SIGNAL-03** — is `subscription-mode` still meaningful with one product?
- **D-SIGNAL-04** — do `update_profile` / `reconnect_broker` / `acknowledge_disclosure` remain investor-resolvable in Signal without an exception framework?
- **D-SIGNAL-05** — `/siwe/*` hooks are live but the identity model moved to `identity-ccid`. Remove now, or retained deliberately?
