# Phase 2.5 Daniel Live Backend Field Map

**Date:** 2026-05-28
**Audit branch:** `phase2-5-daniel-live-backend-alignment`
**Audit mode:** read-only. No file under `…/Daniels Back End/live-components-main` was opened with write or delete intent. No commits, no edits.
**Companion docs:** `phase2-5-daniel-to-refi-alignment-gap-register.md`, `phase2-5-signal-contract-live-backend-delta.md`, `phase2-5-daniel-adapter-fixtures-required.md`, `phase2-5-daniel-backend-alignment-decision.md`.

This document supersedes the earlier `phase2-5-daniel-backend-reconciliation.md` at the field-level granularity. It is built from a fresh source-code inspection of `…/Daniels Back End/live-components-main`, **not** from memory or prior audit summaries.

---

## 1. Daniel backend snapshot

| Item                  | Value                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local path            | `/Users/za/Library/CloudStorage/Dropbox/Nature Of Commerce LLC/ReFi/Website/Daniels Back End/live-components-main`                                                                                                                                                                                                                                   |
| Git branch            | **Not a git repository.** Folder is unzipped from `live-components-main.zip` (sibling). The `git status` from this path resolves to the user's `$HOME` Dropbox-root git, which is irrelevant to Daniel's code.                                                                                                                                       |
| Git commit            | Not applicable (no `.git` in `live-components-main`).                                                                                                                                                                                                                                                                                                |
| Working tree status   | Clean (folder is read-only reference; no edits made by this audit).                                                                                                                                                                                                                                                                                  |
| Inspected date        | 2026-05-28                                                                                                                                                                                                                                                                                                                                           |
| Inspected files       | See §2 below. **All** Python sources, the FastAPI route handler, the Pre Pipeline scripts, every committed `.md`, the `requirements.txt`, and `api_calls.txt`. The `node/Portfolio Analyzer/` standalone TS viewer was inspected at the `index.ts` + `package.json` level (Chart.js wrapper around the FastAPI service — no investor-product logic). |
| Sibling doc inspected | `…/Daniels Back End/ReFi_US_P2_5R_Daniel_Alignment_Rescope.md` (2,193 lines), which describes Daniel's **planned** backend architecture. This is documentation, not code.                                                                                                                                                                            |

### Top-level layout

```
live-components-main/
├── .env, .gitignore
├── README.md                                       (2 lines)
├── Inference Pipeline/                             (Python; hourly per-asset signal gen)
│   ├── orchestrator.py                             (204 lines)
│   ├── generate_base_features.py                   (223 lines)
│   ├── update_indicators.py                        (318 lines)
│   ├── preprocess_new_indicators.py                (250 lines)
│   ├── predict_rl_action.py                        (271 lines)
│   ├── update_sharpe_series.py                     (311 lines)
│   ├── generate_final_signal.py                    (242 lines)
│   ├── README.md
│   ├── requirements.txt
│   └── .env
├── Pre Pipeline/                                   (Python; training / strategy selection)
│   ├── rf_strategies.py                            (239 lines)
│   ├── rl_strategies.py                            (250 lines)
│   ├── strategy_selector.py                        (194 lines)
│   ├── spx500_loader.py                            (121 lines)
│   ├── README.md
│   └── .env
└── Portfolio Analyzer/
    ├── README.md
    ├── portfolio_analyzer.py                        (345 lines; Jupyter prototype)
    ├── Portfolio_Analyzer.ipynb                     (notebook)
    ├── portfolio-service/                           (FastAPI Cloud Run service)
    │   ├── Dockerfile, .dockerignore
    │   ├── requirements.txt
    │   ├── key.json                                 (GCP service-account key)
    │   ├── api_calls.txt                            (curl test invocations)
    │   ├── .env
    │   └── app/
    │       ├── api.py                               (FastAPI route handler)
    │       ├── analyzer_core.py                     (279 lines; pure-function wrapper)
    │       └── extract_symbols.py                   (uploaded-file symbol extractor)
    └── node/Portfolio Analyzer/                     (Standalone TS+HTML+Chart.js viewer)
        ├── src/index.ts
        ├── package.json
        ├── index.html, style.css
        ├── dist/index.js
        ├── launch_server.txt                        (`npx http-server . -c-1`)
        └── changelog.md
```

### Cloud Run deployment

`Portfolio Analyzer/portfolio-service/api_calls.txt` documents the live URL:

```
https://portfolio-api-996917531721.us-west1.run.app
```

The standalone Node TS viewer (`Portfolio Analyzer/node/Portfolio Analyzer/`) calls this URL directly via fetch (verified in `src/index.ts`).

### Critical observation about scope

`live-components-main` contains **only**:

1. **Pre Pipeline** — strategy-stream training (RF and RL) + walk-forward selection.
2. **Inference Pipeline** — hourly per-asset signal generation driven by `asset_status`.
3. **Portfolio Analyzer** — FastAPI service that computes portfolio-level statistics + a researcher-facing HTML viewer.

It does **not** contain:

- portfolio-engine / TemplateTargets,
- account-intent-builder / AccountIntents / AccountIntentHistory / AccountSnapshots,
- risk-engine / RiskSnapshots,
- exec-gateway / ExecutionPlans / ExecutionSagas,
- trade-manager / Orders / OrderIdMap / Fills / BrokerInteractions,
- AuditEvents,
- any investor / user / account concept,
- any broker connection or broker submission code,
- any execution policy, disclosure, or KYC code.

Those layers are **planned** per the sibling rescope doc, but are not present here. The frontend/BFF's investor-product contract has **no implementation source in this folder**.

---

## 2. Daniel backend route / source inventory

### 2.1 HTTP routes (the only HTTP surface)

Source: `Portfolio Analyzer/portfolio-service/app/api.py`.

| Method | Path                                  | Function            | File                                                      | Input fields                                                                                                                                                | Output fields                                                                                                                                    | Account identifier used                                                     | Action identifier used | Audience                                                          | Notes                                                                                                                                                                     |
| ------ | ------------------------------------- | ------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/get-upload-url`                     | `get_upload_url`    | `api.py`                                                  | `filename: str`, `contentType: str` (default `application/octet-stream`)                                                                                    | `{ url: str (signed GCS PUT URL), blobName: str, method: "PUT" }`                                                                                | none                                                                        | none                   | researcher-facing (uploads CSV/Excel of symbols)                  | 15-minute signed URL via `blob.generate_signed_url(version="v4", expiration=900)`                                                                                         |
| POST   | `/process-upload`                     | `process_upload`    | `api.py`                                                  | CloudEvents POST from Eventarc (bucket + object name)                                                                                                       | `204 No Content` on success                                                                                                                      | none                                                                        | none                   | infrastructure-only (Eventarc trigger; `include_in_schema=False`) | Partitions uploaded symbols against the cached `available_strategies` set; logs unavailable symbols to `requested_symbols` collection                                     |
| GET    | `/get-upload-result/{blob_name:path}` | `get_upload_result` | `api.py`                                                  | `blob_name: str` (path-style)                                                                                                                               | `{ available_symbols: str[], unavailable_symbols: str[] }`                                                                                       | none                                                                        | none                   | researcher-facing (polled after upload)                           | Reads in-memory `upload_results` cache; one-shot (pops after read)                                                                                                        |
| GET    | `/assets`                             | `get_assets`        | `api.py`                                                  | none                                                                                                                                                        | `{ assets: sorted str[] }`                                                                                                                       | none                                                                        | none                   | researcher-facing                                                 | Returns cached `available_symbols_cache` set populated at startup from MongoDB `available_strategies`                                                                     |
| POST   | `/analyze`                            | `analyze`           | `api.py` → `run_portfolio_analysis` in `analyzer_core.py` | `AnalyzeRequest`: `{ symbols?: str[], start_date?: str, end_date?: str, start_capital: float = 50_000.0, equity_format: "dollar" \| "percent" = "dollar" }` | `{ stats: dict, equity: float[], dates: str[] (YYYY-MM-DD), benchmark_equity: float[], buy_and_hold_stats: dict, buy_and_hold_equity: float[] }` | none (universe-wide; portfolio = equal-weighted basket of selected symbols) | none                   | researcher-facing                                                 | Runs equal-weighted portfolio backtest; benchmark = SPX500. Stats include CAGR, Sharpe, Sortino, Max DD, VaR/ES, beta, alpha, etc. No per-investor / per-account context. |

### 2.2 Inference pipeline (Python; non-HTTP)

These are batch / scheduled scripts, not HTTP routes. Triggered hourly by Cloud Scheduler → `orchestrator.py`.

| Step              | File                                | Inputs                                                                                                         | Outputs (MongoDB collection)                                                                                                                                                                         | Notes                                      |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1 — orchestrator  | `orchestrator.py:main`              | `asset_status` collection (filters `status == "Ready for Inference"`); `raw_price_data` collection             | Updates `asset_status` to `"Inference in Progress"`                                                                                                                                                  | One-week max catch-up window; symbol-keyed |
| 2 — base features | `generate_base_features.py:main`    | `raw_price_data`; GCS-stored base RF model under `models/<symbol>/...`                                         | `proba_data` collection                                                                                                                                                                              | Per-asset RF probability series            |
| 3 — indicators    | `update_indicators.py:main`         | `selected_features` collection (per-symbol feature list); `raw_price_data`                                     | `indicator_data` collection                                                                                                                                                                          | Selective indicator computation            |
| 4 — preprocess    | `preprocess_new_indicators.py:main` | `indicator_data`; GCS-stored `PowerTransformer` artifacts                                                      | `indicator_data_processed` collection                                                                                                                                                                | Applies learned transforms                 |
| 5 — RL predict    | `predict_rl_action.py:main`         | `indicator_data_processed`; GCS-stored CQL `.d3` model; `StandardScaler` artifact                              | `rl_predictions` collection                                                                                                                                                                          | Q-values + actions per timestamp           |
| 6 — sharpe series | `update_sharpe_series.py:main`      | `proba_data`, `rl_predictions`                                                                                 | `sharpe_series` collection                                                                                                                                                                           | Encoded Sharpe series feature vectors      |
| 7 — final signal  | `generate_final_signal.py:main`     | `sharpe_series`; `walkforward_results` (per-symbol `selected_threshold`); GCS-stored `final_eval_model.joblib` | **`live_signals` collection** (`{ pipeline, script, symbol, date, position ∈ {+1, -1, 0} }`); updates `asset_status` to `"Ready for Inference"` or `"Needs Model Update"`; sets `last_prediction_ts` | The terminal signal write.                 |

### 2.3 Pre Pipeline (Python; non-HTTP)

| Step              | File                   | Inputs                           | Outputs                                                          | Notes                                                                       |
| ----------------- | ---------------------- | -------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| RF training       | `rf_strategies.py`     | `raw_price_data`                 | `rf_strategies` collection (per-symbol strategy returns + dates) | Random Forest based strategy returns                                        |
| RL training       | `rl_strategies.py`     | `raw_price_data`                 | `rl_strategies` collection                                       | CQL agent-based strategy returns                                            |
| SPX500 loader     | `spx500_loader.py`     | external data source             | `market_proxies` collection (benchmark)                          | Benchmark for portfolio analysis                                            |
| Strategy selector | `strategy_selector.py` | `rf_strategies`, `rl_strategies` | **`available_strategies` collection** (per-symbol best `(rf      | rl)`choice with`MIN_SHARPE ≥ 0.5`, `MIN_LEN ≥ 4_300`bars,`MIN_YEARS ≥ 3.0`) | This is the symbol-eligibility gate that `/assets`, `/analyze`, and `/process-upload` all consult. |

### 2.4 Portfolio Analyzer internals

| Function                                   | File               | Purpose                                                                                                                                                                |
| ------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load_universe(db)`                        | `analyzer_core.py` | Reads per-symbol strategy + price return series from `rf_strategies`/`rl_strategies` + `market_proxies`. Aligns to a dense hourly grid over the common overlap window. |
| `_analyze_internal(...)`                   | `analyzer_core.py` | Computes portfolio stats (CAGR, vol, Sharpe, Sortino, max DD, Calmar, VaR/ES, beta vs SPX, alpha, IR, skew, kurtosis, longest DD duration, etc.).                      |
| `run_portfolio_analysis(db, symbols, ...)` | `analyzer_core.py` | Top-level entry. Computes both the **strategy-weighted** equity curve AND the **buy-and-hold** counterfactual against the SPX500 benchmark.                            |

---

## 3. Signal output inventory

What `live-components-main` actually emits as its terminal product.

| Daniel field                                 | Inferred type                                                                    | Source file                                                                                                                                  | Sample value if present                               | Meaning                                         | Required for ReFi investor product?                 | Missing from current ReFi BFF?                                                                                            | Transformation required                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `live_signals.symbol`                        | `str` (uppercase ticker)                                                         | `generate_final_signal.py:178` (`bulk_ops` `UpdateOne` `$set` filter)                                                                        | `"IBM"`                                               | Asset the signal applies to                     | **Yes** — primary recommendation key                | No — frontend uses `symbol` in `Recommendation` schema                                                                    | uppercase normalize                                                                          |
| `live_signals.date`                          | `int` (UNIX timestamp seconds)                                                   | `generate_final_signal.py:182` (`{"date": int(dt)}`)                                                                                         | `1678886400`                                          | Bar timestamp the signal was generated for      | **Yes** — for staleness eval                        | Yes — frontend has `recommendation_at` but no integer seconds field                                                       | parse → ISO-8601                                                                             |
| `live_signals.position`                      | `int ∈ {+1, 0, -1}`                                                              | `generate_final_signal.py:184` (`{"$set": {"position": int(pos)}}`); generated at `:170-173` via `raw_signals.ffill().fillna(0).astype(int)` | `+1`                                                  | Trading position: long, flat, short             | **Yes** — drives recommendation direction           | Yes — frontend has `recommendation_type ∈ {open_long, open_short, close_long, close_short, hold}`; needs explicit mapping | `+1 → long/open`, `-1 → short/open`, `0 → flat/hold`                                         |
| `live_signals.pipeline`                      | `str` literal `"live_inference"`                                                 | `generate_final_signal.py:67-68` (`PIPELINE_NAME_OUT`)                                                                                       | `"live_inference"`                                    | Source pipeline identifier                      | **Yes** — for record lineage                        | Yes — no equivalent in BFF today                                                                                          | passthrough into `RecordArtifact.source`                                                     |
| `live_signals.script`                        | `str` literal `"generate_final_signal.py"`                                       | same                                                                                                                                         | `"generate_final_signal.py"`                          | Source script identifier                        | **Yes** — for record lineage                        | Yes — no equivalent                                                                                                       | passthrough                                                                                  |
| `asset_status._id`                           | `str` (symbol; e.g. `"IBM"`)                                                     | `Inference Pipeline/README.md` §"Database Schema"                                                                                            | `"IBM"`                                               | The asset_status doc is **keyed by symbol**     | Required indirectly                                 | No — but the symbol-keyed `_id` semantic means there is NO per-account model state                                        | passthrough                                                                                  |
| `asset_status.status`                        | enum: `"Ready for Inference" \| "Needs Model Update" \| "Inference in Progress"` | `Inference Pipeline/README.md`; `orchestrator.py` filters; `generate_final_signal.py:206` writes                                             | `"Ready for Inference"`                               | Pipeline state machine                          | **Indirect** — affects freshness of the next signal | Yes — frontend doesn't surface pipeline state                                                                             | normalize to investor-facing "fresh / stale / unavailable"                                   |
| `asset_status.last_prediction_ts`            | `int` (UNIX seconds)                                                             | `generate_final_signal.py:207`                                                                                                               | `1678886400`                                          | Timestamp of last successful prediction         | **Yes** — drives `freshness_status`                 | Yes — frontend has `data_stale` boolean on broker but not per-signal                                                      | parse → ISO-8601; compare with now to compute SLA                                            |
| `asset_status.last_status_update`            | `datetime` (utcnow)                                                              | `generate_final_signal.py:208`                                                                                                               | `"2023-03-17T12:00:00Z"`                              | When status was last touched                    | useful                                              | optional                                                                                                                  | passthrough                                                                                  |
| `walkforward_results.selected_threshold`     | `float` (per-symbol)                                                             | `generate_final_signal.py:167` (read); `selected_threshold` set by Pre Pipeline                                                              | `0.05` (illustrative)                                 | The signal-confidence threshold for this symbol | **Indirect** — drives signal eligibility            | No equivalent                                                                                                             | hidden from investor; record lineage only                                                    |
| `selected_features`                          | `list[str]` (per-symbol)                                                         | `update_indicators.py` reads from `selected_features` MongoDB collection                                                                     | `["rolling_pearson_returns_log_return_12_proc", ...]` | Per-asset model feature bundle                  | **Indirect** — defines model lineage                | Yes — frontend has `model_factors: { factor, weight }[]` but no mapping from Daniel's feature names                       | TODO(confirm-daniel-field): how Daniel-named features map to investor-readable factor labels |
| `proba_data`                                 | `float[]` (per-bar)                                                              | `generate_base_features.py` writes                                                                                                           | (numeric series)                                      | Base RF probability per timestamp               | **No** — internal                                   | Not in frontend                                                                                                           | n/a                                                                                          |
| `indicator_data`, `indicator_data_processed` | `float[]` per indicator per bar                                                  | `update_indicators.py`, `preprocess_new_indicators.py`                                                                                       | (numeric)                                             | Internal feature engineering                    | **No** — internal                                   | Not in frontend                                                                                                           | n/a                                                                                          |
| `rl_predictions`                             | `{ action, q_values, ... }` per bar                                              | `predict_rl_action.py`                                                                                                                       | (TODO(confirm-daniel-field): exact shape)             | RL Q-values + actions                           | **Indirect** — feeds final signal                   | Not in frontend; optional for confidence_score                                                                            | TODO(confirm-daniel-field)                                                                   |
| `sharpe_series`                              | `float[]` (lookback-encoded Sharpe values per bar per series)                    | `update_sharpe_series.py` writes; `generate_final_signal.py:97-106` reads                                                                    | `{ source, method, lookback, values, dates }`         | Lookback-based Sharpe feature vectors           | **Indirect** — final-signal model input             | Optional — could surface as `risk_metric` on `SignalCandidate`                                                            | normalize numeric value                                                                      |

### 3.1 Portfolio Analyzer output (the `/analyze` route)

| Daniel field                                                                              | Type                                     | Source file                | Meaning                            | Required for ReFi investor product?       | Missing from current BFF? | Transformation required                                           |
| ----------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------- | ---------------------------------- | ----------------------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `stats.CAGR`                                                                              | formatted str (`"12.34 %"`)              | `analyzer_core.py:207`     | Compound annual growth rate        | **No** — universe-level, not per-investor | Not in frontend           | not used in investor product                                      |
| `stats.Sharpe`, `Sortino`, `Beta vs SPX`, `Alpha (ann.)`, `R-squared`, `Info Ratio`, etc. | formatted str                            | `analyzer_core.py:208-218` | Portfolio statistics over a basket | **No** — universe-level                   | Not in frontend           | The `/analyze` route is researcher tooling, not investor product. |
| `equity[]`, `dates[]`, `benchmark_equity[]`, `buy_and_hold_equity[]`                      | `float[]`, `str[]`, `float[]`, `float[]` | `analyzer_core.py:275-280` | Equity curves                      | **No** — research/demo only               | Not in frontend           | n/a                                                               |

### 3.2 What the upload workflow produces

| Daniel field                    | Type              | Meaning                                                        | Required for ReFi investor product?                                                              |
| ------------------------------- | ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `requested_symbols.requested[]` | `list[str]`       | Symbols a user uploaded that are NOT in `available_strategies` | **No** — used by Daniel to track research-side asset requests; investor product never reads this |
| `requested_symbols.source_file` | `str` (blob name) | Original upload file name                                      | **No**                                                                                           |
| `requested_symbols.timestamp`   | `datetime`        | When the request was logged                                    | **No**                                                                                           |

---

## 4. Portfolio / rebalance inventory

What Daniel's backend says about portfolio construction and rebalancing.

| Daniel concept                                  | Source file                                                                                                | Backend responsibility                                                                                                                                    | Investor-product equivalent                                                                                       | SEC 203A-2(e) concern                                                                                             | Required frontend / BFF boundary                                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------- |
| Strategy stream (RF vs RL) selection per symbol | `Pre Pipeline/strategy_selector.py`                                                                        | Choose the better of `rf_strategies` / `rl_strategies` for each symbol; gate by min Sharpe (≥ 0.5), min length (≥ 4,300 bars), min calendar years (≥ 3.0) | `RecommendationProjection.advisory_context.model_factors` (label only); never exposed as a choice to the investor | Investor cannot select a per-symbol strategy stream; strategy choice is automated upstream                        | BFF must never allow `strategy_id` selection on a per-recommendation basis                                                              |
| Equal-weighted portfolio (in `/analyze`)        | `analyzer_core.py:122` (`weights = np.full(..., 1 / N)`)                                                   | Compute portfolio stats assuming equal weights                                                                                                            | None — `/analyze` is researcher tooling                                                                           | None — never reaches investor                                                                                     | BFF should not proxy `/analyze` to investor users                                                                                       |
| Rebalance                                       | **Not present in live-components-main.** No file defines a rebalance function, schedule, or output.        | n/a today                                                                                                                                                 | `ExecutionPolicyDecision.decision = ROUTE_TO_BROKER` is the closest investor-facing concept                       | Tripwire blocks `rebalance approval`, `Manual Rebalance`, `manualRebalance`, `approveRebalance`, `adminRebalance` | Frontend assumes rebalance flows through `ExecutionPolicy` activation + per-account `account-intent-builder` (which doesn't exist yet)  |
| Template targets                                | **Not present.** Sibling rescope doc describes `TemplateTargets` as future output of the portfolio-engine. | Future                                                                                                                                                    | `RecommendationProjection` is roughly the per-account projection of a future TemplateTarget                       | None                                                                                                              | When the portfolio-engine ships, the BFF must wrap TemplateTargets → RecommendationProjection inside the SignalToInvestorProductAdapter |
| Account intents                                 | **Not present.** Sibling rescope doc names `AccountIntents`, `AccountIntentHistory`, `AccountSnapshots`.   | Future                                                                                                                                                    | `EligibilityCheck` + `ExecutionPolicyDecision` are the planned projections                                        | High — this is the personalization boundary                                                                       | The investor must never see raw account intents; only the per-account `data-eligibility` verdict (ALLOW / REVIEW / DENY)                |
| Risk decisions                                  | **Not present.** Sibling rescope doc names `risk-engine` and `RiskSnapshots`.                              | Future                                                                                                                                                    | `EligibilityCheck.reason_codes` (current frontend)                                                                | Critical — risk gating is the SEC 203A-2(e) fail-closed point                                                     | Frontend assumes risk verdicts in the format `ALLOW                                                                                     | REVIEW | DENY`; backend must adopt this contract |
| Execution plans                                 | **Not present.** Sibling rescope doc names `exec-gateway` and `ExecutionPlans` / `ExecutionSagas`.         | Future                                                                                                                                                    | `ExecutionPolicyDecision` + `BrokerSubmission`                                                                    | Critical — execution is the boundary that must be policy-bound                                                    | Frontend already has `ExecutionPolicy` + `ManagedExecutionState` projections; backend must converge                                     |
| Broker submission                               | **Not present.** Sibling rescope doc names `trade-manager`.                                                | Future                                                                                                                                                    | `BrokerSubmission` (per the signal-to-investor contract)                                                          | Critical — broker submission must be authorized by ExecutionPolicy, never per-trade                               | Tripwire blocks `accept_trade`, `approve_trade`, `Submit Order`, `investor-accept`                                                      |
| Audit events                                    | **Not present.** Sibling rescope doc names `AuditEvents`.                                                  | Future                                                                                                                                                    | `RecordArtifact` (per the signal-to-investor contract)                                                            | Critical — required by SEC records-retention                                                                      | Must be parallel to `InvestorActionReceipt` and `RecordAccessLog` (frontend already separates these)                                    |

---

## 5. Admin action inventory

Explicit answers to the directive's questions, grounded in code inspection.

### Does Daniel backend use `template.admin action=rebalance target_account_id=X`?

**No.** No file under `live-components-main` contains the strings `template.admin`, `template_admin`, `action=rebalance`, `target_account_id`, or any `*account_id` identifier (verified via `grep -rni`). Daniel's backend has no concept of `account_id` at all — everything is symbol-keyed. The `template.admin action=rebalance target_account_id=X` pattern is described in the sibling rescope doc (`ReFi_US_P2_5R_Daniel_Alignment_Rescope.md`) as a **future** backend admin command shape, but it is not implemented in the audited code.

### Is this admin-init only?

**Not applicable today** (the command does not exist). The rescope doc describes the _future_ `template.admin action=rebalance target_account_id=X` as backend-init only (the portfolio-engine emits it, NOT the investor). The frontend must preserve this: no investor-visible affordance may invoke this command.

### Does Daniel backend expose an investor accept command?

**No.** Daniel's backend has no investor-facing surface at all. The 5 FastAPI routes are all researcher-facing or infrastructure (Eventarc-triggered). The Inference Pipeline scripts are batch jobs with no HTTP boundary.

### Does Daniel backend produce directly executable orders?

**No.** The terminal output is `live_signals.position ∈ {+1, 0, -1}` per `(symbol, date)`. This is a model signal, **not** an executable broker order. No order ID, no broker account binding, no quantity, no price, no time-in-force. Conversion from signal to executable order is the missing translation layer.

### Does Daniel backend require staff approval?

**No.** The pipeline is fully automated (Cloud Scheduler → orchestrator → 7 sequential scripts → MongoDB). No human-in-the-loop step is implemented. The rescope doc says staff approval is **explicitly forbidden** for investor-product execution (matches the SEC 203A-2(e) boundary).

### Does Daniel backend assume a broker connection?

**No.** No file in `live-components-main` references brokers, broker connections, broker accounts, broker keys, Alpaca, IBKR, or any broker API. Broker integration belongs to the planned `trade-manager` layer (sibling rescope doc), which is not implemented here.

### Does Daniel backend assume investor profile data?

**No.** No file references investor / user / profile / KYC / disclosure / preference. Daniel's backend is universe-keyed (symbols), not account-keyed.

### Does Daniel backend return enough metadata for record retention?

**Partial.** `live_signals` writes carry `(pipeline, script, symbol, date, position)`. `asset_status` carries `(status, last_prediction_ts, last_status_update)`. This is enough lineage for a model audit trail (model version is implicit via the GCS-stored `final_eval_model.joblib` path). It is **insufficient** for the SEC 203A-2(e) record set defined in the sibling rescope doc §4.6 (which requires profile version, broker connection state, disclosure versions, execution policy version, fill IDs, support boundary classifications, etc.). All of those record fields belong to the missing investor-product backend.

---

## 6. Cross-references to be carried forward

- **`phase2-5-daniel-to-refi-alignment-gap-register.md`** — uses this field map as input to a structured gap register.
- **`phase2-5-signal-contract-live-backend-delta.md`** — diffs `phase2-5-signal-to-investor-product-contract.md` against this field map.
- **`phase2-5-daniel-adapter-fixtures-required.md`** — defines test fixtures grounded in the actual `live_signals` shape documented above.
- **`phase2-5-daniel-backend-alignment-decision.md`** — directly answers the 10 yes/no questions in the directive using this field map.

## 7. Scope lock — re-affirmed

Zero files under `…/Daniels Back End/live-components-main` were modified, deleted, or read with intent to modify. No Daniel backend changes. No frontend code changes in this branch. No new product surfaces. No SEC 203A-2(e) boundary weakened. No per-trade Accept, Approve, Submit, investor-accept, staff approval, founder review, or support-led advice reintroduced.
