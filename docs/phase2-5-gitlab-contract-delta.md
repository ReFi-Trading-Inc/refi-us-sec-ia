# Phase 2.5 GitLab Contract Delta

**Date:** 2026-05-29
**Audit branch:** `phase2-5-gitlab-backend-verification`
**Companion verification doc:** `docs/phase2-5-gitlab-refinity-main-source-verification.md`
**Target contract under correction:** `docs/phase2-5-signal-to-investor-product-contract.md` (committed on `phase2-5-signal-contract-corrections` at `8a8f6e5`)

This document enumerates every place where the just-corrected signal contract is **wrong** against the canonical GitLab backend `refinity_dev/refinity-main` (branch `main`, commit `0a7d64d`). It does **not** edit the contract. A follow-up branch `phase2-5-signal-contract-v2-against-gitlab` will apply the deltas after reviewer sign-off.

---

## Severity scale

- **CRITICAL**: contradicts a real production code path; the adapter cannot ship correctly without fixing.
- **HIGH**: the field shape on the contract does not exist on the wire; the adapter would fail integration tests.
- **MEDIUM**: shape is approximately right but classification is wrong (e.g., "derived" when actually "wire").
- **LOW**: cosmetic / clarification.

---

## Delta entries

### Delta 1 — Contract §2 "Adapter Boundary" verbal mapping

**Current contract (§2):**

> map Daniel's `position` field (`-1 | 0 | 1`) into investor-facing recommendation intent (`open_long | open_short | hold`) — matching the §3 `RecommendationProjection.recommendation_type` enum.

**GitLab fact:** the wire field is `signal: int` on the Spanner `signals` table (see `apps/inference-worker/tests/test_stream_signal_publishing.py:74-99`). `position` does not appear on the signal-publishing path; it is a downstream concept on the broker side (e.g., `Positions` Spanner table). The same asset+timestamp can carry multiple `signal` rows because of the multi-stream convention (one per `strategy_source`).

**Required correction:** rename `position` → `signal` throughout §2, §3, and §4. The `0` case is plausible but not confirmed in tests yet (see Delta 9 below).

**Severity:** CRITICAL.

**Blocks Surface 4?** Yes — Surface 4 reaches into the adapter contract.
**Blocks main merge?** No — the contract is documentation.
**Blocks production?** Yes.

---

### Delta 2 — `DanielSignalRaw.position` field rename

**Current contract (§3):**

```ts
position: -1 | 0 | 1;
```

**GitLab fact:** Spanner `signals` table column is `signal: INT64`. There is also a `label: INT64` column that the local snapshot did not surface; it appears to mirror `signal` in the inspected tests (`for source, label in (("rf", 1), ("rl", -1))` then `signal=label`).

**Required correction:**

```ts
/** The model's terminal trading signal at this bar. INT64 on Spanner.
    Values observed in inference-worker tests: -1 and 1. The 0 (flat)
    case existed in the legacy `live_signals` MongoDB pipeline; whether
    it persists in the GitLab inference-worker requires a deeper read
    of apps/inference-worker/src/orchestrator/. Adapter must defensively
    handle 0 until confirmed. */
signal: -1 | 0 | 1;

/** Classification label from the model. Distinct from `signal` in
    principle, though in inspected tests `signal == label`. Carried for
    record lineage. */
label: -1 | 0 | 1;
```

**Severity:** CRITICAL.

---

### Delta 3 — `date` field type and name

**Current contract (§3):**

```ts
/** Bar timestamp in UNIX seconds (integer). ... The adapter is
    responsible for parsing this into ISO-8601 before any
    investor-facing surface consumes it. */
date: number;
```

**GitLab fact:** Spanner `signals.ts_utc` is a TIMESTAMP column. The Python publisher writes a `datetime` with UTC timezone (`datetime(2026, 5, 8, 20, tzinfo=timezone.utc)` in the test). On the Pub/Sub envelope (`contracts/fixtures/signals.json`), no explicit timestamp field appears in the inspected body; the envelope's `attributes.emitted_at` is ISO-8601 (`"2025-09-12T00:00:01Z"`). The bar timestamp itself flows via the Spanner row, not the Pub/Sub body.

**Required correction:**

```ts
/** Bar timestamp in UTC. Stored on Spanner as a TIMESTAMP. The Python
    publisher emits a tz-aware datetime; over Pub/Sub or HTTP, expect
    an ISO-8601 string. */
ts_utc: string; // ISO-8601 over the wire (Pub/Sub or HTTP API),
// datetime in the Python publisher
```

Drop `date: number` entirely.

**Severity:** HIGH.

---

### Delta 4 — `last_prediction_ts` no longer exists

**Current contract (§3 sibling read):**

```ts
last_prediction_ts: number; // UNIX seconds, from asset_status._id == symbol
```

**GitLab fact:** the GitLab `signals` table does not have a sibling `asset_status` table with a `last_prediction_ts` field. Freshness is computed by comparing `ts_utc` against the orchestrator's expected hourly cadence. The legacy `asset_status` collection from `live-components-main` is a MongoDB artifact that does not appear to have a direct GitLab equivalent.

**Required correction:** drop the `DanielAssetStatus` sibling-read interface from §3. Replace the freshness rule with:

> Adapter computes freshness as `now - ts_utc`:
>
> - fresh: ≤ 2h
> - stale: 2h–24h → REVIEW
> - expired: > 24h → DENY or no projection

The provisional SLA values from §7 Question 3 still apply.

**Severity:** MEDIUM.

---

### Delta 5 — `source_collection` field

**Current contract (§3):**

```ts
source_collection: "live_signals"; // Reserved as a constant for record lineage.
```

**GitLab fact:** the principal intake source is the Spanner `signals` table, not a MongoDB collection. The legacy `live_signals` may exist as a mirror but should not be the canonical intake.

**Required correction:**

```ts
source: "spanner://refin-instance/refin-db/signals"; // canonical
// OR
source: "pubsub://signals.v1"; // if the adapter consumes Pub/Sub instead
```

The shape of the constant changes; the adapter operator should choose between Spanner-read and Pub/Sub-subscribe based on freshness budget.

**Severity:** HIGH.

---

### Delta 6 — `model_version` is on the wire

**Current contract (§3):**

> `model_version` — **Derived**, not on the wire. The adapter reads from a future model registry write OR from the file-system path of the loaded `models/<symbol>/final_eval_model.joblib` joblib artifact...

**GitLab fact:** the Spanner `signals` table has a `model_version` column directly (verified in `test_stream_signal_publishing.py:88` `assert insert_call["params"]["model_version"] == "v1"`).

**Required correction:** reclassify `model_version` from **derived** to **wire**:

```ts
/** The model version that produced this signal. Spanner column on
    `signals`. e.g. "v1". No adapter derivation needed. */
model_version: string;
```

**Severity:** MEDIUM (the contract over-engineered a derivation that wasn't needed).

---

### Delta 7 — `strategy_id` encoded in `stream_id`

**Current contract (§3):**

> `strategy_id` — **Derived**, not on the wire. The adapter looks up `available_strategies` (populated by `Pre Pipeline/strategy_selector.py`) keyed by `symbol` and reads `available_strategies.collection ∈ {"rf_strategies", "rl_strategies"}`...

**GitLab fact:** the `signals` table carries an explicit `strategy_source: "rf" | "rl"` column AND an explicit `strategy: string` column. Plus `stream_id: "{asset}~{source}"` (e.g. `"AAPL~rf"`) encodes the strategy identity in the row's primary key. No external lookup is required.

**Required correction:**

```ts
/** Wire field on the `signals` Spanner table. The strategy stream that
    produced this signal. Encoded redundantly as the suffix of
    `stream_id`. */
strategy_source: "rf" | "rl";

/** Optional strategy identifier. In the inspected tests this equals
    `strategy_source` ("rf" or "rl"); future strategies may differentiate. */
strategy: string;

/** Concatenated key: `${asset_id}~${strategy_source}`. The Spanner
    `signals` table is keyed by `(stream_id, ts_utc)` — NOT
    `(asset_id, ts_utc)`. The multi-stream convention means one asset
    can produce both an rf and an rl signal at the same bar. */
stream_id: string; // "AAPL~rf", "AAPL~rl"
```

The adapter's dedupe identity changes from the prior six-field tuple to:

```ts
raw_source_ref: {
  source: "spanner://refin-instance/refin-db/signals";
  stream_id: string;
  ts_utc: string; // ISO-8601
}
```

**Severity:** CRITICAL — the dedupe identity rule was wrong, and the adapter would produce duplicate (or merged) projections.

---

### Delta 8 — `confidence_score` is on the wire as `proba`

**Current contract (§3):**

> `confidence_score` and `sharpe_metric` — both **out-of-band** with an undefined aggregation rule. `rl_predictions` carries Q-values; `sharpe_series` carries multi-dimensional series; investor-facing surfaces must not depend on either field; both default to `null`.

**GitLab fact:** the Spanner `signals` table has an explicit `proba: FLOAT64` column. Verified in `test_stream_signal_publishing.py:89` `assert insert_call["params"]["proba"] == 0.42`. This is the model's confidence/probability scalar, directly on the wire. No aggregation rule needed.

**Required correction:** half of Delta 8 reverses. `proba` becomes a wire field:

```ts
/** Model probability. FLOAT64 on Spanner. e.g. 0.42. The investor-
    facing surface may display this as a percentage or surface it as
    a UI confidence indicator. Adapter passes through. */
proba: number;
```

The `sharpe_metric` half of Delta 8 stands — `sharpe_series` remains internal to the model pipeline and is not exposed as a scalar on the signal row.

**Severity:** HIGH — the contract claimed an aggregation rule was needed; it isn't.

---

### Delta 9 — `position: 0` flat case requires confirmation

**Current contract (§3):**

> `0` → flat / hold / no executable recommendation (adapter emits a `hold` projection OR no projection at all, per adapter policy)

**GitLab fact:** the inspected `inference-worker` tests publish `signal` values of `1` and `-1`. The `0` case is not in the inspected test fixtures. The legacy `live_signals` collection from `live-components-main` did emit `0` (verified at `Inference Pipeline/generate_final_signal.py:170-173`).

**Required correction:** mark §3 `DanielSignalRaw.signal` as `-1 | 0 | 1` but add an explicit note:

> The `0` case is implementation-dependent. Confirm against the GitLab inference-worker by reading `apps/inference-worker/src/orchestrator/` before relying on `0` semantics. If `0` is suppressed in GitLab, the adapter still has no work to do because there will simply be no row to read; the contract should remain forward-compatible with both shapes.

**Severity:** LOW (forward-compatible either way).

---

### Delta 10 — Multi-stream identity for RecommendationProjection

**Current contract (§3.3):**

The current contract's RecommendationProjection assumes one signal per asset per timestamp. The adapter policy was framed in terms of `position` per `symbol`.

**GitLab fact:** the same `account_id, asset_id, ts_utc` triple can carry both an `rf` and an `rl` `RecommendationProjection`. They are independent signals. The adapter must decide:

- Treat them as **two independent projections** (the investor sees two recommendations for AAPL at the same time, one from each strategy stream).
- Or **dedupe to one** via an explicit strategy-preference rule per investor (e.g., the investor's ExecutionPolicy names a preferred strategy).
- Or **combine** (vote majority, weighted sum, etc.) — risky and out of scope for the boundary contract.

**Required correction:** §3.3 should explicitly address multi-stream. Adapter contract decision (provisional): **two independent projections**, gated by the investor's ExecutionPolicy. Strategy preference becomes a policy field.

**Severity:** HIGH — the contract's per-asset recommendation cardinality was wrong; the adapter would either drop signals or display duplicates.

---

### Delta 11 — §4 Mapping table requires another full rewrite

**Current contract (§4):** the rewritten mapping table classifies every field as **wire / derived / out-of-band / reserved-future / out-of-scope**. The classifications are now wrong for `model_version` (was derived, now wire), `strategy_id` (was derived from lookup, now encoded in stream_id), `confidence_score`/`proba` (was out-of-band, now wire).

**Required correction:** the mapping table needs a second rewrite. Deferred to the v2 contract correction branch.

**Severity:** MEDIUM (documentation hygiene).

---

### Delta 12 — Reclassify "missing services" rows in `phase2-5-daniel-to-refi-alignment-gap-register.md`

**Current gap-register rows** (sample):

- GAP-ID-001 "Daniel has no `account_id` concept" → **misaligned**
- GAP-MODE-002 "Daniel has no rebalance pipeline today" → **partially aligned**
- GAP-REC-003 "Daniel has no eligibility concept" → **misaligned**
- GAP-EX-001 "Daniel rebalance output — does not exist" → **missing**
- GAP-EX-002 "Daniel has no ExecutionPolicy concept" → **misaligned**
- GAP-EX-003 "Daniel has no broker code" → **missing**
- GAP-EX-004 "Daniel has no exception concept" → **missing**

**GitLab fact:**

- GAP-ID-001 should flip to **aligned (at the identifier level)**. `account_id` and `partition_key = account_id` exist throughout Daniel's services.
- GAP-MODE-002 should flip to **aligned at the command shape**: `template.admin action=rebalance target_account_id=X` exists.
- GAP-REC-003 should flip to **partially aligned**: `risk-engine` emits `risk.approved`/`risk.rejected`; the frontend's ALLOW/REVIEW/DENY mapping rule is still TBD.
- GAP-EX-001 should flip to **partially aligned**: `account.intent.ready` is the rebalance output at the account-bound stage; `template.rebalance.intent` is the upstream template-stage shape.
- GAP-EX-002 should flip to **partially aligned**: the lifecycle contract names `OrderEvents`, `BrokerOrderAttempts`, etc., but a single named `ExecutionPolicy` versioned record per account is still BFF-owned. Some mapping needed.
- GAP-EX-003 should flip to **partially aligned**: `trade-manager` exists; broker integration is real (SnapTrade).
- GAP-EX-004 should flip to **partially aligned**: `risk.rejected` + `TradingControlEvents` carry the exception semantics; the frontend's queue is BFF-owned but the source events are wire.

**Required correction:** rewrite §1–§7 of the gap register with the new GitLab evidence. Deferred to the same v2 contract correction branch.

**Severity:** HIGH (the prior gap register over-stated the gap; reviewers may make wrong scoping decisions based on it).

---

## Summary table

| #   | Delta                                                           | Severity | Blocks Surface 4? | Blocks main merge? | Blocks production? |
| --- | --------------------------------------------------------------- | -------- | ----------------- | ------------------ | ------------------ |
| 1   | `position` → `signal` verbal mapping                            | CRITICAL | Yes               | No                 | Yes                |
| 2   | `position` field rename + add `label`                           | CRITICAL | Yes               | No                 | Yes                |
| 3   | `date: int` → `ts_utc: ISO-8601`                                | HIGH     | Yes               | No                 | Yes                |
| 4   | drop `last_prediction_ts` sibling read                          | MEDIUM   | No                | No                 | No                 |
| 5   | `source_collection` → `source` (Spanner or Pub/Sub)             | HIGH     | Yes               | No                 | Yes                |
| 6   | `model_version` is wire, not derived                            | MEDIUM   | No                | No                 | No                 |
| 7   | `strategy_id` encoded in `stream_id`; add multi-stream identity | CRITICAL | Yes               | No                 | Yes                |
| 8   | `confidence_score` is wire (`proba`)                            | HIGH     | No                | No                 | No                 |
| 9   | confirm `0` case in GitLab inference-worker                     | LOW      | No                | No                 | No                 |
| 10  | RecommendationProjection multi-stream cardinality               | HIGH     | Yes               | No                 | Yes                |
| 11  | Mapping table v2 rewrite                                        | MEDIUM   | No                | No                 | No                 |
| 12  | Gap register reclassification                                   | HIGH     | No                | No                 | No                 |

---

## Recommended sequencing

Per the user's directive ("Do not start Surface 4. Do not start stale E2E yet. Do not modify Daniel backend. Do not modify frontend code."), this branch ships **documentation only**. The proposed sequencing for the cleanup branches that follow:

1. **`phase2-5-stale-e2e-cleanup`** (already in progress; WIP stashed). Lands first. Does not touch the contract.
2. **`phase2-5-signal-contract-v2-against-gitlab`** (new). Applies deltas 1–11. Editable docs only; no code.
3. **`phase2-5-gap-register-v2-against-gitlab`** (new). Applies delta 12; reclassifies the gap register against GitLab evidence.
4. Surface 4 may proceed only after reviewer sign-off on (2) and (3) — OR a deliberate decision to defer them to Phase 3 with documented risk.

---

## Scope lock — re-affirmed

No GitLab repo files were modified, deleted, or read with intent to modify. No frontend code changes in this branch. No SEC 203A-2(e) boundary weakened. The audit was strictly read-only.
