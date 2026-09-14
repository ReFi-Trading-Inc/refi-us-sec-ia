# Subscription convergence inventory (F-H2)

**Date:** 2026-09-14 · Read from `daniel-handoff/integration` at `c43619c` ·
Inventory only, as directed. No adapter designed, no code proposed.

Founder decision F-H2 (2026-09-13): the alpha.4 BFF allocation operations are
canonical; the P1 `SubscriptionPanel` / `/us/product/*` surface converges onto
that transport and never becomes a second authority. Conversion must be exact
base-10 decimal-string arithmetic, never floating point.

## 1. P1 fields

Source of truth: `apps/web/src/lib/investor-product/domain.ts`.

| Field                                        | Type                | Units                 | Origin                                     |
| -------------------------------------------- | ------------------- | --------------------- | ------------------------------------------ |
| `AllocationModel.percent`                    | `number \| null`    | **percentage points** | user keystrokes → `validateAllocation`     |
| `AllocationBounds.{min,max,step}Percent`     | `number`            | **points** (5/50/1)   | fixture constant                           |
| `StrategyIdentity.strategyId`                | `string`            | —                     | hardcoded `"fixture-strategy-core"`        |
| `SubscriptionStatus`                         | union               | —                     | fixture sets `"active"` locally on confirm |
| `StrategySubscription.environment`           | `"paper" \| "live"` | —                     | literal `"paper"`                          |
| `StrategySubscription.stateVersion`          | `number`            | —                     | fixture-invented `1`                       |
| `blockedReason`                              | `string \| null`    | —                     | never set                                  |
| `ConfirmSubscriptionIntent.consentReceiptId` | `string`            | —                     | `submitConsent` result                     |
| `ConsentRequirement.*`                       | mixed               | —                     | fixture constant                           |

**Nothing on this surface is persisted.** The fixture adapter is a per-tab
module singleton, and transport mode yields `adapter: null` with
`unavailableReason: "transport_not_implemented"`. There is no second persisted
subscription system today — only a second **model**.

Bounds fail closed correctly: `bounds === null` → `bounds_unknown`, the UI
renders a dedicated unavailable panel, and `canConfirm` requires a valid
validation. Step checking already avoids floats by working in integer
thousandths.

## 2. alpha.4 canonical fields

`AllocationPreviewRequest` — `additionalProperties: false`, both required:
`template_id`, and `allocation_percent` as a string matching exactly

```text
^(?:0\.(?:0*[1-9][0-9]*)|1(?:\.0+)?)$
```

a **decimal fraction in (0, 1]**. `"0.25"` is 25%. Zero is unrepresentable;
above 100% is unrepresentable. The BFF mirrors the pattern verbatim.

`AccountActionRequest` — `action` ∈ `{join_template, update_allocation,
leave_template}`; `parameters` requires only `template_id`, with optional
`allocation_percent` (same fraction pattern) and `allocation_preview_id`.
`Idempotency-Key` required; `If-Match` optional and never sent today.

`AllocationPreview` — 27 required backend-owned fields. The economics the UI
would need: `feasible`, `reason_codes`, `effective_min_order`,
`allocation_notional`, the four leg counts, `funding_assessment`, `expires_at`,
`allocation_preview_id`.

`AccountMembership` — twelve required fields including `status` ∈
`{ACTIVE, ENDED, PENDING}`, `allocation_percent` as a nullable fraction string,
and `membership_version`. Already projected keeping the string.

## 3. Mapping

| P1                       | Canonical                                               | Transform                             | Class                                                                                 |
| ------------------------ | ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `allocation.percent`     | `allocation_percent`                                    | exact base-10 ÷100 as a **string**    | CONVERT                                                                               |
| `bounds.*Percent`        | —                                                       | —                                     | MISSING-IN-CANONICAL — limits are `feasible` + `effective_min_order` + `reason_codes` |
| `strategyId`             | `template_id`                                           | rename, needs a real source           | MISSING-IN-P1 (constant today)                                                        |
| —                        | `allocation_preview_id`                                 | BFF requires it on join/update        | MISSING-IN-P1 — P1 has no preview step                                                |
| —                        | `account_id` (path)                                     | resolved server-side                  | MISSING-IN-P1 by design                                                               |
| —                        | `Idempotency-Key`                                       | derived server-side                   | DROP from client                                                                      |
| `connectionId`           | `broker_connection_id` (response only)                  | —                                     | MISSING-IN-CANONICAL on the write path                                                |
| `environment`            | `account_environment` (response only)                   | —                                     | MISSING-IN-CANONICAL — paper-only is enforced at connect                              |
| `stateVersion`           | `If-Match` / `aggregate_version` / `membership_version` | backend-issued                        | MISSING-IN-P1 (invented today)                                                        |
| `consentReceiptId`       | no field on the action body                             | belongs in the 409 continuation retry | MISSING-IN-CANONICAL                                                                  |
| `ConsentRequirement.*`   | `listEffectiveDisclosures` / `recordConsent`            | 1:1 on key/version/hash               | DIRECT (different operation)                                                          |
| `subscription.status`    | `AccountMembership.status`                              | case + vocabulary                     | CONVERT (lossy — no `blocked` upstream)                                               |
| `blockedReason`          | refusal `code`                                          | verbatim backend word                 | CONVERT                                                                               |
| `strategy.name/.summary` | template name / ReFi copy                               | —                                     | DROP                                                                                  |
| —                        | preview economics                                       | —                                     | MISSING-IN-P1 (new UI)                                                                |

## 4. Points-versus-fraction risk

**The sharpest hazard is an identical shape with opposite units.**
`AllocationBounds` holds `5 / 50 / 1` today and would hold `0.05 / 0.5 / 0.01`
after convergence, with no type change. A half-migrated adapter would validate
fractions against points bounds and silently accept 100× errors.

A naive adapter sending points **fails closed today**: the BFF zod rejects a
number outright and rejects the string `"25"` against the pattern, before any
authorization read or upstream call, with a rejected receipt and a 400. The
pattern catches gross unit errors. It does **not** catch arithmetic ones —
`12.5` points → `"0.125"` is legal, and a mis-rounding float conversion inside
the valid window would be accepted as a real allocation.

The inverse converter must be the exact base-10 counterpart of
`fractionToPercent`: string in, decimal point moved two places left by slicing,
leading and trailing zeros normalised, asserted against the contract pattern
before it can leave. Never `/100`, never `toFixed`. The property to pin is the
round trip.

**A float already happens before any converter could run.** `Number(raw.trim())`
turns the investor's keystrokes into a double at validation time, so a correct
converter fed that double is still unsound. This is why the string migration
must precede the transport adapter.

## 5. Consent and acknowledgment

Frontend-owned: the exact `(disclosure_key, disclosure_version,
disclosure_hash)` tuple, read from the effective list and written by
`recordConsent`, with the receipt re-validated on key, version, hash, ACTIVE
status and account.

Backend-decided: `createAccountAction` carries no consent header and declares no 403. Compliance refusals arrive as contract codes and must surface verbatim and
never be retried.

The 409 flow: initial mutation under key A → `ACKNOWLEDGMENT_REQUIRED` with a
validated continuation → retained intent → explicit confirmation → consent for
exactly that tuple → retry with the same intent plus `continuation_ref` and
`consent_receipt_id` under a **new** key B.

P1 records consent for the rendered tuple and cannot confirm without a receipt.
It has no continuation concept, no durable intent across a challenge, and no
distinction between "we owe a consent" and "the backend refuses on compliance".
**There is no allocation continuation-completion route today** — only the
preferences one exists.

## 6. Authorization

The canonical chain, in order: same-origin → session → release-stage allowlist
evaluated before body parsing → account scope re-authorised against
`listAccounts` (the browser never names an account) → `AccountAuthorization`
exactly `AUTHORIZED` for join and update, read before the body is built →
preview binding, with `allocationPreviewId` required by the BFF even though the
contract marks it optional → deterministic idempotency key over the exact
economic parameters. `leave_template` is disengagement and is never locally
blocked.

P1 assumes none of it. Its render gate is explicitly not a security boundary,
and its only precondition is a connected brokerage plus a consent checkbox.

## 7. Convergence plan

| #   | Step                                                         | Touches                                               | State                                                 |
| --- | ------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| 1   | `percentToFraction` plus round-trip property tests           | `fraction-percent.ts`, client tests                   | **Safe now**                                          |
| 2   | Make the P1 allocation value a decimal string end to end     | `domain.ts`, `SubscriptionPanel.tsx`, fixture adapter | **Safe now**, prerequisite                            |
| 3   | Add the preview stage to the adapter interface and the panel | `adapter.ts`, `domain.ts`, fixture adapter, panel     | **Safe now** (fixture only)                           |
| 4   | Retire the points bounds model in favour of backend limits   | `domain.ts`, fixture adapter                          | Safe after 3                                          |
| 5   | Write the transport adapter                                  | new file, `adapter-context.tsx`                       | **Blocked** on 1–4 and on a real `template_id` source |
| 6   | Allocation continuation route for `ACKNOWLEDGMENT_REQUIRED`  | new route, `acknowledgment.ts`                        | **Blocked** on backend behaviour                      |
| 7   | Delete the P1-only consent path                              | panel, fixture adapter                                | After 5 and 6                                         |
| 8   | Retire `/us/onboarding/{broker,strategy}`                    | onboarding pages                                      | Last                                                  |

**Ordering is the safety property.** Step 2 must land before step 5, never the
reverse, or the identical-shape unit flip becomes reachable.

### Needs a decision, not an engineering choice

- **Where `template_id` comes from.** It is a constant today and there is no
  catalog read on this path. Does Alpha have one fixed template, or a catalog?
- **Whether the investor-facing control should author a fraction string
  directly**, formatting for display. That removes the crossing entirely but
  changes the input experience. Founder call.
- **Whether bounds exist as a backend concept at all.** If not, the bounds model
  is deleted rather than sourced; the contract offers only `feasible`,
  `effective_min_order` and `reason_codes`.
- **D-A8d** (rename or document `allocation_percent`) is the root cause and is
  open with Daniel.

## 8. Risks and open questions

- `0` is unrepresentable in the pattern. A UI that lets an investor type zero to
  mean "stop" must route to `leave_template`, which takes `template_id` only.
  P1 has no leave affordance at all.
- Above 100% is unrepresentable; the P1 model encodes the ceiling nowhere.
- `blocked` has no canonical home. Synthesising a **status** from an **error**
  is exactly the relabelling the BFF is pinned against.
- The package disagrees with itself on 403: `createAccountAction` declares no
  403, while the `allocation_mutation` profile lists 403 with
  `ACCOUNT_AUTHORIZATION_REQUIRED`. Daniel ask.
- `reason_codes` is an open pattern, not an enum, so any copy keyed off a
  specific code is a guess (D-A4).
- No `AccountMembership` read on the P1 path. After a 202 the canonical
  confirmation is the membership read, not the receipt; P1 sets status locally
  on success and that pattern must not survive into transport.
- Unanswerable from the repository: whether the backend issues
  `ACKNOWLEDGMENT_REQUIRED` for allocation verbs in practice, what preview TTL
  to assume before re-previewing, and whether Alpha has one template or many.
