# Lane F — brokerage and AccountAuthorization against v1.1.0-alpha.4

**Date:** 2026-09-13 · **Base:** `daniel-handoff/integration` at `019a6bf`
(alpha.4 is the contract authority; #155 merged) · Read-only audit; nothing
changed by this document.

Classification vocabulary: `CERTIFIED` (package + code + assertion agree),
`DEFECT`, `DEBT`, `DANIEL-ASK`, `FOUNDER-DECISION`.

## F1 — the migration's "unchanged" claim, certified from the package

Method: programmatic comparison of `schemas.json` `$defs`, `openapi.json`
paths and response-status sets, `contract.json`, `capabilities.json` between
alpha.3 and alpha.4.

| id   | class     | evidence                                                                                                                                                                                                                                                       |
| ---- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-1 | CERTIFIED | `$defs` 96 → 98: added `FundingAssessment`, `RecommendationSummary`; changed only `AllocationPreview`, `Recommendation`, `RecommendationPage`. Every `Brokerage*`, `AccountAuthorization*` and `AccountActionRequest` definition is byte-identical to alpha.3. |
| F1-2 | CERTIFIED | No path added or removed; only `allocation-previews`, `events`, `recommendations`, `recommendations/{id}` changed. All five `brokerage-connections*` paths unchanged.                                                                                          |
| F1-3 | CERTIFIED | Response-status sets for every brokerage and allocation operation identical; error profiles `brokerage_mutation`, `allocation_mutation`, `account_truth_read` unchanged.                                                                                       |
| F1-4 | CERTIFIED | The only allocation-payload change is `AllocationPreview.funding_assessment` (required, nullable). `account_environment` stays `enum [paper, live]`. The preview route passes the object through unchanged.                                                    |

Net: **zero** change to the Lane F surface. Nothing here is invalidated by the
version move.

## F2 — invariant chain: admission → connect → sync → AccountAuthorization → economic action

| id   | class                  | evidence                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-1 | CERTIFIED              | First connection needs no prior `AUTHORIZED`: `brokerage-connection.ts` never reads AccountAuthorization; commit `5f5bd95`; assertion "connectBrokerage must not read AccountAuthorization before the first connection (circular gate removed 2026-09-09)". Matches alpha.4 `INTEGRATION.md` §6.                                                                                                                                          |
| F2-2 | CERTIFIED              | `join_template` / `update_allocation` read AccountAuthorization first and refuse anything but exactly `AUTHORIZED`, returning the backend word verbatim; assertion "economic gating: join_template and update_allocation read AccountAuthorization first…".                                                                                                                                                                               |
| F2-3 | CERTIFIED              | `leave_template` is disengagement, never locally blocked; assertion "leave_template is disengagement…".                                                                                                                                                                                                                                                                                                                                   |
| F2-4 | CERTIFIED              | No local path reaches an economic action without `AUTHORIZED`; rotate/sync are non-economic and gate on connection scope; backend refusals keep their code and are never retried.                                                                                                                                                                                                                                                         |
| F2-5 | DEFECT → FIXED BY #149 | On `019a6bf` the setup gate still evaluates authorization **before** onboarding state and steps, so an admitted investor with no broker yet (`DENIED` + `BROKER_CONNECTION_MISSING`, the contract's legitimate pre-connection state) sees the "not authorized — contact support" banner. **PR #149 (Lane E, held) is exactly this fix**: general account access no longer requires `AUTHORIZED`; economic actions stay strictly narrower. |
| F2-6 | DEBT                   | The onboarding BFF projection drops `AccountAuthorization.reason_codes` (keeps `status` + `policy_version` only), on both `019a6bf` and #149. Not needed for #149's access split, but it means no surface can ever distinguish `DENIED/BROKER_CONNECTION_MISSING` from a real denial in copy. Plumb `reason_codes` through when the vocabulary is enumerated (D-A4).                                                                      |
| F2-7 | CERTIFIED              | The gate never relabels a backend word as human admission; assertions pin "gate requires AUTHORIZED and READY", both words rendered, no control on the surface. #149 keeps these pins.                                                                                                                                                                                                                                                    |

Residual on F2-5: #149 predates #155 (it still carries alpha.3 pins) and must be
**rebased onto `019a6bf`** before it can merge. Its admission proxy
(`OnboardingStatus === READY`) does not change until the alpha.5 package arrives
(D-A1).

## F3 — PAPER ONLY

| id   | class     | evidence                                                                                                                                                                                                                                             |
| ---- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F3-1 | CERTIFIED | Connect: `PAPER_KEY_ID = /^PK[A-Z0-9]{18}$/`, `environment: z.literal("paper")`, `.strict()`; assertions "environment must be the literal paper" / "only PK (paper) key ids parse".                                                                  |
| F3-2 | CERTIFIED | Rotate: identical schema.                                                                                                                                                                                                                            |
| F3-3 | CERTIFIED | The wire value is the literal `"paper"` (`account_environment: "paper"`); the parsed input is never forwarded, so a schema loosening alone could not widen the wire.                                                                                 |
| F3-4 | CERTIFIED | The contract permits `live` (`account_environment: enum [paper, live]` on `BrokerageConnection`, `BrokerageConnectionRequest`, `AllocationPreview`). Paper-only is **our** boundary (D-LAUNCH-07 open), documented at the route header.              |
| F3-5 | DEBT      | If the backend returns `account_environment: "live"`, the BFF passes it through and the hook renders it. No refusal, flag or telemetry.                                                                                                              |
| F3-6 | DEBT      | `getBrokerageConnection` picks the first non-terminal connection with no environment filter; `assertConnectionInScope` checks id/ownership/terminality only. A live connection created out-of-band would be adopted and rotate/sync would target it. |
| F3-7 | CERTIFIED | Daniel's widening is absent on this line: no `z.enum(["paper","live"])`, no `(PK\|AK)`, no `account_environment: input.environment`, no `operation-identity.ts`. Matches `alpha4-reconciliation.md` §6.2.                                            |

## F4 — D-A4: `DENIED + BROKER_CONNECTION_MISSING`

alpha.4 declares (`schemas.json` `AccountAuthorization`):

```json
"status": { "enum": ["AUTHORIZED", "DENIED", "PENDING", "SUSPENDED"] },
"reason_codes": { "type": "array", "uniqueItems": true,
  "items": { "type": "string", "pattern": "^[A-Z][A-Z0-9_]{1,63}$" } }
```

| id   | class      | evidence                                                                                                                                                                                                                                                             |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4-1 | CERTIFIED  | Status enum final and unchanged. D-A4 need 1 (shape unchanged in alpha.4) **closed by the package**.                                                                                                                                                                 |
| F4-2 | DANIEL-ASK | `reason_codes` is an open pattern, not an enum; `BROKER_CONNECTION_MISSING` has zero hits in `schemas.json`, `openapi.json`, `capabilities.json`. D-A4 need 2 (enumerated vocabulary) **unanswered**.                                                                |
| F4-3 | CERTIFIED  | `INTEGRATION.md` §6 (normative prose): "An admitted account with no connection legitimately reports `DENIED` with `BROKER_CONNECTION_MISSING` … do not relabel DENIED as AUTHORIZED"; first connection possible despite it. Need 3 **closed**; code complies (F2-1). |
| F4-4 | DANIEL-ASK | `examples.json` carries only `{"status":"AUTHORIZED","reason_codes":[]}`; no DENIED / PENDING / SUSPENDED example.                                                                                                                                                   |
| F4-5 | DANIEL-ASK | Need 4 (what transitions `SUSPENDED`, who clears it) has no answer anywhere in the package.                                                                                                                                                                          |

**Verdict: NARROW D-A4.** Needs 1 and 3 close on package evidence. Residual
wording is in "Daniel asks" below.

## F5 — idempotency

Everything the package says: `Idempotency-Key` header required, `string`
8–128 (`openapi.json`); "retry the same action with the same body/key and fresh
assertion, never a newly invented economic action" (`README.md`); "keep
per-attempt `jti` fresh while retaining the same idempotency key and identical
body" (`INTEGRATION.md`); disconnect after `ACKNOWLEDGMENT_REQUIRED` retries
with a **new** key; error code `IDEMPOTENCY_KEY_REUSED` (409) exists in five
profiles but **is defined nowhere**.

| id   | class      | evidence                                                                                                                                                                                                                                                                                                         |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F5-1 | CERTIFIED  | Same key + same body = replay is stated. Our 64-hex keys satisfy 8–128.                                                                                                                                                                                                                                          |
| F5-2 | DANIEL-ASK | Same key + different body: undefined. Persistence window: not stated. Concurrency: not stated.                                                                                                                                                                                                                   |
| F5-3 | CERTIFIED  | Our keys derive from the exact economic parameters (`preview`: account/template/percent; `action`: account/action/template/percent/previewId; `rotate`: connection + key id, never the secret; `sync`: minute-bucketed; connect: account/key id/paper). Assertions pin "a different percent is a different key". |
| F5-4 | DEBT       | The client enforces key presence, not the 8–128 range (latent: every key is 64 hex).                                                                                                                                                                                                                             |

**Verdict: KEEP ours.** Daniel's client-supplied operation-id model rests on a
changed-body rejection the contract never states; parameter-derived keys are
safe under either backend behaviour. Revisit only when a package states the
guarantee.

## F6 — D-A6 / D-A7 against alpha.4

| id   | class  | evidence                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-A6 | RETAIN | alpha.4 adds no attestation/profile schema; `attestation_mutation` unchanged; `INTEGRATION.md` constrains delivery (`attestation_id`, monotonic `decision_sequence`, exact-body retry) but answers none of the four system-of-record questions.                                                                                                            |
| D-A7 | NARROW | `brokerage_mutation` is byte-identical to alpha.3: still excludes `ACCOUNT_AUTHORIZATION_REQUIRED` and `ACKNOWLEDGMENT_BINDING_INVALID`, and `403` is absent from its status set (unlike `allocation_mutation` / `preference_mutation`). alpha.4 answers "unchanged", not "never emitted". Our disconnect adapter fails closed on both (assertion pinned). |

## Narrow PRs required

1. **F-1 → no new PR.** The defect is fixed by held PR #149; action is to rebase
   #149 onto `019a6bf` (mechanical alpha.4 pin conflicts) and keep it held.
   F2-6 (`reason_codes` plumbing) waits for the D-A4 vocabulary.
2. **F-2 (DEBT, paper-only read path)** — filter/flag a non-paper connection in
   `getBrokerageConnection`; refuse rotate/sync against a `live` connection in
   `assertConnectionInScope`; pin with an assertion. Shape depends on
   D-LAUNCH-07 staying PAPER ONLY (founder).
3. Optional, not Lane F: enforce the 8–128 `Idempotency-Key` length in the
   client.

## Daniel asks (exact wording)

1. **D-A4 (narrowed):** "alpha.4 confirms the `AccountAuthorization` shape is
   unchanged, and INTEGRATION.md §6 confirms `DENIED` + `BROKER_CONNECTION_MISSING`
   is the legitimate pre-connection state — both closed. Residual: (a)
   `reason_codes` is declared only as the open pattern `^[A-Z][A-Z0-9_]{1,63}$`
   with no enum and no non-AUTHORIZED example; please supply the complete
   enumerated reason-code vocabulary, or state that it is intentionally open and
   clients must key behaviour only on `status`. (b) What transitions an account
   into `SUSPENDED`, and who clears it?"
2. **Idempotency (new):** "`IDEMPOTENCY_KEY_REUSED` appears in five error
   profiles but is defined nowhere. Please state normatively: (a) same key +
   different body — rejected with 409 `IDEMPOTENCY_KEY_REUSED`, or replays the
   first result? (b) the key persistence window; (c) behaviour for two concurrent
   in-flight requests with the same key. Until (a) is explicit we keep keys
   derived from the economic parameters, not a client-supplied operation id."
3. **D-A7 (re-pinned to alpha.4):** "`brokerage_mutation` in alpha.4 is
   byte-identical to alpha.3 and still excludes `ACCOUNT_AUTHORIZATION_REQUIRED`
   and `ACKNOWLEDGMENT_BINDING_INVALID` (no `403` in its status set). Is that a
   guarantee the backend never emits either from brokerage disconnect, or an
   omission for the next package? Our adapter fails closed on both until you
   answer."
4. **D-A6:** unchanged; all four needs stand.

## Founder decisions

- **D-LAUNCH-07 (paper vs live) — OPEN.** The contract permits `live`; paper-only
  is enforced only on the write path today (F3-1..3), not the read/maintenance
  path (F3-5, F3-6). Confirm PAPER ONLY remains the Alpha stance so F-2 refuses
  `live` outright rather than merely displaying it.
