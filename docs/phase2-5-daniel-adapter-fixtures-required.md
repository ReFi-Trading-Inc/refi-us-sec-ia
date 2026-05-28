# Phase 2.5 Daniel Adapter Fixtures Required

**Date:** 2026-05-28
**Audit branch:** `phase2-5-daniel-live-backend-alignment`
**Source-of-truth audit:** `phase2-5-daniel-live-backend-field-map.md`
**Contract:** `phase2-5-signal-to-investor-product-contract.md` (with corrections in `phase2-5-signal-contract-live-backend-delta.md`)
**Audit mode:** read-only.

Required fixture cases the `SignalToInvestorProductAdapter` must satisfy **before production**. Each fixture specifies the Daniel input (or a mock of it), the per-account context, and the expected output at every stage of the chain `DanielSignalRaw → SignalCandidate → RecommendationProjection → EligibilityCheck → ExecutionPolicyDecision → {BrokerSubmission | ExceptionReview | RecordArtifact}`.

Field names follow the contract in `phase2-5-signal-to-investor-product-contract.md` §3 with the corrections in `phase2-5-signal-contract-live-backend-delta.md` §8.1 applied.

Daniel input shape (canonical):

```ts
type DanielLiveSignalDoc = {
  pipeline: "live_inference";
  script: "generate_final_signal.py";
  symbol: string; // e.g. "AAPL"
  date: number; // UNIX seconds, e.g. 1747958400
  position: -1 | 0 | 1; // long / flat / short
};

type DanielAssetStatusDoc = {
  _id: string; // symbol
  status:
    | "Ready for Inference"
    | "Needs Model Update"
    | "Inference in Progress";
  last_prediction_ts: number; // UNIX seconds
  last_status_update: string; // ISO-8601
};
```

Per-account context (provided by future `account-intent-builder` + ReFi BFF):

```ts
type AccountContext = {
  account_id: string;
  subscription_mode: "signal" | "managed";
  managed_state:
    | "not_activated"
    | "active"
    | "paused"
    | "pending_profile_update"
    | "pending_disclosure_ack"
    | "deactivated";
  execution_policy: {
    policy_id: string;
    policy_version: number;
    constraints: {
      max_single_order_usd: number;
      max_position_size_bps: number;
      stale_broker_data_pause_after: string;
      pause_on_disclosure_superseded: boolean;
      pause_on_profile_superseded: boolean;
      /* ... */
    };
  } | null;
  profile: { version: number; status: "complete" | "incomplete" | "outdated" };
  kyc: { status: "verified" | "pending" | "rejected" | "expired" };
  disclosures: { status: "current" | "missing_acks" | "outdated" };
  broker: {
    connection_id: string;
    status: "connected_fresh" | "connected_stale" | "disconnected" | "pending";
  };
  positions: {
    by_symbol: Record<string, { qty: number; market_value_usd: number }>;
  };
  pending_exception: { exception_id: string; kind: string } | null;
};
```

---

## Fixture 1 — Eligible managed rebalance

**Daniel input (live_signals):**

```json
{
  "pipeline": "live_inference",
  "script": "generate_final_signal.py",
  "symbol": "AAPL",
  "date": 1747958400,
  "position": 1
}
```

**Daniel asset_status:** `{ status: "Ready for Inference", last_prediction_ts: 1747958400, last_status_update: "2026-05-22T22:00:00Z" }`
**Account context:** Maya (Managed, active policy v3, profile current, KYC verified, disclosures current, broker `connected_fresh`, no AAPL position).

**Expected adapter chain:**

- `SignalCandidate`: `signal_id = ulid()`, `source = "daniel-live-signals"`, `symbol = "AAPL"`, `side = "long"`, `strategy_id` (looked up from `available_strategies.symbol=AAPL.collection`), `model_version` (derived from GCS path), `predicted_at = "2026-05-22T22:00:00Z"`, `received_at = now`, `freshness_status = "fresh"` (<2h), `confidence_score = null`, `risk_metric = null`, `normalization_status = "ok"`, `rejection_reason = null`.
- `RecommendationProjection`: `recommendation_id = ulid()`, `recommendation_type = "open_long"`, `advisory_context`, `status = "active"`, `eligibility_required = true`.
- `EligibilityCheck`: `status = "ALLOW"`, `reason_codes = ["KYC_OK", "PROFILE_OK", "DISCLOSURES_CURRENT", "BROKER_FRESH", "SIGNAL_FRESH", "WITHIN_CONCENTRATION_LIMITS"]`.
- `ExecutionPolicyDecision`: `subscription_mode = "managed"`, `managed_state = "active"`, `decision = "ROUTE_TO_BROKER"`, `policy_id = …`, `eligibility_status = "ALLOW"`, `reason_codes = []`.
- `BrokerSubmission`: emitted with `order_intent.side = "buy"`, qty per execution policy sizing, `submission_status = "queued"`.
- `RecordArtifact`: emitted with `artifact_type = "broker_submission"`, `retention_class = "regulatory_7y"`, `investor_visible = true`.

---

## Fixture 2 — Blocked due to investor profile mismatch

**Daniel input:** same `live_signals` shape, `symbol: "AAPL", position: 1`.
**Account context:** Maya BUT `profile.status = "outdated"`, `managed_state = "pending_profile_update"`.

**Expected chain:**

- `SignalCandidate`: same as Fixture 1; ok.
- `RecommendationProjection`: same; `status = "active"`.
- `EligibilityCheck`: `status = "REVIEW"`, `reason_codes = ["PROFILE_OUTDATED"]`.
- `ExecutionPolicyDecision`: `decision = "ROUTE_TO_EXCEPTION"`, `reason_codes = ["PROFILE_OUTDATED"]`.
- `ExceptionReview`: emitted with `exception_type = "profile_update_required"`, `status = "open"`.
- `RecordArtifact`: `artifact_type = "exception"`, `investor_visible = true`.

---

## Fixture 3 — Blocked due to missing disclosure acknowledgement

**Daniel input:** `symbol: "MSFT", position: 1`.
**Account context:** `disclosures.status = "missing_acks"` (e.g. Form ADV 2A version bumped, not yet ack'd).

**Expected chain:**

- `EligibilityCheck`: `status = "REVIEW"`, `reason_codes = ["DISCLOSURE_ACK_MISSING"]`.
- `ExecutionPolicyDecision`: `decision = "ROUTE_TO_EXCEPTION"`.
- `ExceptionReview`: `exception_type = "missing_disclosure_ack"`.

---

## Fixture 4 — Blocked due to execution policy constraint (max position size)

**Daniel input:** `symbol: "TSLA", position: 1`.
**Account context:** Maya, fully eligible, BUT `positions.by_symbol["TSLA"]` already at 90% of `max_position_size_bps`; the new buy would breach.

**Expected chain:**

- `EligibilityCheck`: `status = "DENY"`, `reason_codes = ["POSITION_SIZE_LIMIT"]` OR `status = "REVIEW"` per policy.
- `ExecutionPolicyDecision`: `decision = "BLOCK"` (if DENY) OR `"ROUTE_TO_EXCEPTION"` (if REVIEW).
- `RecordArtifact`: `artifact_type = "exception"` or simply a blocked-action record.

---

## Fixture 5 — Review-required due to high risk drift (model_version stale)

**Daniel input:** `symbol: "NVDA", position: 1`. `asset_status.status = "Needs Model Update"`.

**Expected chain:**

- `SignalCandidate`: `freshness_status = "stale"` or `"expired"` (depending on `last_prediction_ts` age).
- `EligibilityCheck`: `status = "REVIEW"`, `reason_codes = ["SIGNAL_STALE", "MODEL_NEEDS_UPDATE"]`.
- `ExecutionPolicyDecision`: `decision = "ROUTE_TO_EXCEPTION"`.
- `ExceptionReview`: `exception_type = "signal_freshness"`.

---

## Fixture 6 — Review-required due to unsupported asset

**Daniel input:** `symbol: "FOO", position: 1` — symbol NOT in `available_strategies`.

**Expected chain:**

- `SignalCandidate`: `normalization_status = "rejected"`, `rejection_reason = "SYMBOL_UNAVAILABLE"`.
- No `RecommendationProjection` emitted.
- `RecordArtifact`: `artifact_type = "signal_rejected"` (internal record only; not investor-visible).

Boundary check: a rejected signal must never produce an investor-facing recommendation.

---

## Fixture 7 — Signal-tier user receives recommendation but no broker submission

**Daniel input:** `symbol: "VOO", position: 1`.
**Account context:** David (Signal tier, `subscription_mode = "signal"`, no execution policy).

**Expected chain:**

- `SignalCandidate`: ok.
- `RecommendationProjection`: emitted.
- `EligibilityCheck`: `status = "ALLOW"` for the advisory view (David has profile, KYC, etc.); but Signal mode constrains action.
- `ExecutionPolicyDecision`: `subscription_mode = "signal"` → `decision = "RECORD_ONLY"`. No broker submission.
- `BrokerSubmission`: **not emitted.**
- `RecordArtifact`: `artifact_type = "recommendation"`, `investor_visible = true` (the investor sees the advisory recommendation).

Boundary check: Signal tier never triggers `ROUTE_TO_BROKER`.

---

## Fixture 8 — Daniel signal missing required field

**Daniel input (malformed):**

```json
{
  "pipeline": "live_inference",
  "script": "generate_final_signal.py",
  "date": 1747958400,
  "position": 1
}
```

Missing `symbol`.

**Expected chain:**

- `SignalCandidate`: `normalization_status = "rejected"`, `rejection_reason = "SYMBOL_MISSING"`.
- No downstream emission.
- `RecordArtifact`: `artifact_type = "signal_rejected"` (internal); alert / metric emitted (operational).

---

## Fixture 9 — Daniel backend returns stale portfolio stream (asset_status not updated for >24h)

**Daniel input:** `symbol: "GOOG", position: 1`, but `asset_status.last_prediction_ts` is 26h old.

**Expected chain:**

- `SignalCandidate`: `freshness_status = "expired"` (>24h per provisional SLA).
- No `RecommendationProjection` emitted (per contract §7 Q3: expired → "do not generate an executable recommendation").
- OR: `RecommendationProjection` with `status = "expired"`, used for record-only display.
- `RecordArtifact`: `artifact_type = "signal_expired"` (internal).

---

## Fixture 10 — Daniel backend output references unknown target_account_id

**Note:** Daniel's current `live-components-main` has no `target_account_id` field. This fixture is **forward-looking** for when the planned `template.admin action=rebalance target_account_id=X` command lands.

**Hypothetical input:** `{ command: "template.admin action=rebalance", target_account_id: "acct_unknown_xyz" }`.

**Expected chain:**

- Adapter looks up `acct_unknown_xyz` in the BFF account registry.
- Account not found → reject at the adapter input; do NOT produce a `SignalCandidate`, `RecommendationProjection`, `EligibilityCheck`, etc.
- `RecordArtifact`: `artifact_type = "admin_command_rejected"`, internal-only; alert raised.

Boundary check: an admin command with an unknown target MUST NOT reach any investor surface.

---

## Coverage summary

| #   | Fixture                                     | Boundary tested                 |
| --- | ------------------------------------------- | ------------------------------- |
| 1   | Eligible managed rebalance                  | Happy path; full chain → broker |
| 2   | Profile mismatch                            | REVIEW → Exception Review       |
| 3   | Missing disclosure ack                      | REVIEW → Exception Review       |
| 4   | Position size breach                        | DENY/REVIEW → BLOCK / Exception |
| 5   | Signal stale (model needs update)           | REVIEW due to freshness         |
| 6   | Unsupported asset                           | Adapter input rejection         |
| 7   | Signal-tier user                            | `RECORD_ONLY` (never broker)    |
| 8   | Malformed signal                            | Adapter input rejection         |
| 9   | Expired signal (>24h)                       | No executable recommendation    |
| 10  | Unknown target_account_id (forward-looking) | Adapter rejects admin command   |

All ten fixtures are **required** before production. None is implementable today (the adapter does not exist). They are documented here so that when the adapter is built, the test suite has a precise specification.

---

## Scope lock — re-affirmed

No code shipped. No Daniel backend changes. No frontend changes. Audit was strictly read-only. Fixtures are documentation of required-future-test-cases.
