# Phase 2.6 AccountPrefs History — Options

**Date:** 2026-05-30
**Source of truth:** [`phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md)
**Gap:** `GAP-PREFS-HISTORY-001`, `GAP-PREFS-WRITE-002`, `GAP-PREFS-AUDIT-003`
**Status:** **Plan** for the new AccountPrefs History scope. Needs Daniel ratification on the architecture choice before PR-F implementation.

This doc captures Daniel's stated requirement, current backend state, the missing history ledger, candidate architectures, the recommended approach, open questions for Daniel, SEC 203A-2(e) implications, test/deploy strategy, and production-blocker classification.

---

## 1. Daniel's stated requirement

From Daniel's response (2026-05-30):

> "What doesn't exist yet that the front-end app should own are account history preference updates/changes. So if a user changes their account controls and risk settings then those actions should be logged. The way the backend works right now is the account-intent-builder and the risk-engine use acct prefs stored in the related tables to perform their operations (all operations and reasoning that the service apps do are logged), so the new front end app should not only update account prefs properly when a user changes their settings but **there needs to be a new acct prefs history table created that the front end owns and updates** whenever it updates acct prefs."

And from `refinity-main/docs/authoritative/frontend_integration_contract.md:375`:

> "The system will implement an account preference history at a later date, currently only actions committed and their reasoning is recorded as auditability objects during trade lifecycle processes."

## 2. Current backend state

From `email_qa_checklist.md:109-139` and `frontend_integration_contract.md:176-229`:

| State                               | Where                                                                                                                                            | Lifecycle                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Account knobs (current values only) | `AccountPrefs(account_id, drift_threshold, min_order, excluded_assets, fractional_enabled, updated_at)`                                          | Mutable; latest-state only                                  |
| Versioned consent records           | `UserConsents(consent_key, consent_version, accepted_at, acceptance_source, ip_hash, user_agent_hash, correlation_id)` and `AccountConsents`     | Append-only (by version)                                    |
| Backend-owned risk caps             | `RiskLimits(max_gross_exposure_pct, max_net_exposure_pct, max_single_name_pct, max_sector_pct, var_config, order_limits, staleness, compliance)` | Operator-mutable, audited via `AdminInterventions`          |
| Execution controls                  | `TradingControlStates`, `TradingControlEvents`                                                                                                   | Append-only events; current state is `TradingControlStates` |
| Immutable trade-time inputs         | `TradeInputSnapshots`                                                                                                                            | Append-only per trade                                       |

**Confirmed missing**: no `AccountPrefsHistory`, no append ledger for `AccountPrefs`, no `correlation_id` capture per `AccountPrefs` change. Grep over `apps/` returned zero matches for `AccountPrefsHistory` / `account_prefs_history`.

## 3. The gap: what's actually missing

For every `AccountPrefs` field that an investor can change (`drift_threshold`, `min_order`, `excluded_assets`, `fractional_enabled`) the platform currently has:

- ✅ Current value (in `AccountPrefs`)
- ✅ Effect of the value at trade time (captured in `TradeInputSnapshots`, `AccountIntents`, etc.)
- ❌ The change event itself (when, who, what changed, why, signed proof)
- ❌ The history of values over time
- ❌ An investor-facing view of "here's what you changed and when"
- ❌ Versioning that integrates with consent acceptance (e.g. "this preference change required a fresh ADV 2A ack")

The change event matters because:

1. **SEC 203A-2(e) regulatory recordkeeping** — an internet adviser must keep records of investor settings that affect advice.
2. **Investor trust** — "you changed your drift threshold from 1% to 2% on 2026-05-30, here's the IP hash and signed receipt."
3. **Reconcilable audit** — when a trade outcome is challenged ("why did the system trade so close to my limit?"), the history must show the prefs in effect at that exact moment.
4. **Admin coordination** — if `admin-portal` also writes `AccountPrefs` for any operator-assisted flow, those writes must be history-traced too.

## 4. Likely DDL shape (proposed)

Pending Daniel's ratification, the proposed history table:

```sql
CREATE TABLE AccountPrefsHistory (
  history_id           STRING(MAX) NOT NULL,        -- ULID
  account_id           STRING(MAX) NOT NULL,
  changed_at           TIMESTAMP NOT NULL,
  changed_by_auth_id   STRING(MAX) NOT NULL,
  source               STRING(MAX) NOT NULL,         -- "investor_ui" | "admin_portal" | "system"
  before_payload       JSON NOT NULL,                -- prior values (partial; only changed fields)
  after_payload        JSON NOT NULL,                -- new values (partial; only changed fields)
  diff_fields          ARRAY<STRING(MAX)> NOT NULL,
  reason_code          STRING(MAX),                  -- optional ("investor_initiated", "operator_remediation", etc.)
  correlation_id       STRING(MAX) NOT NULL,
  signed_consent_ref   STRING(MAX),                  -- pointer to UserConsents row if this change required re-ack
  ip_hash              STRING(MAX),                  -- investor change only
  user_agent_hash      STRING(MAX),                  -- investor change only
  device_fp_hash       STRING(MAX),                  -- investor change only
  commit_ts            TIMESTAMP NOT NULL OPTIONS (allow_commit_timestamp=true),
) PRIMARY KEY (account_id, changed_at DESC, history_id);

CREATE INDEX AccountPrefsHistoryByCorrelation
  ON AccountPrefsHistory (correlation_id);

CREATE INDEX AccountPrefsHistoryByActor
  ON AccountPrefsHistory (changed_by_auth_id, changed_at DESC);
```

Notes:

- Primary key ordered by `(account_id, changed_at DESC)` for efficient "last N changes for this account" reads.
- `before_payload` / `after_payload` carry only changed fields (not full snapshot) so diff is explicit.
- `diff_fields` is denormalized for fast filtering ("show me every change that touched `excluded_assets`").
- `signed_consent_ref` exists so we can require a fresh consent acceptance when a material preference change happens.
- `commit_ts` uses Spanner's allow_commit_timestamp pattern, same as `AccountIntents` etc.

## 5. Write procedure (proposed)

For every `AccountPrefs` mutation, the writer must:

1. Load current `AccountPrefs` row.
2. Compute diff against the incoming change payload.
3. If `diff_fields` is empty → no-op, no history entry.
4. Check whether `diff_fields` includes any material field that requires fresh consent re-ack (e.g. `excluded_assets` change requiring updated client agreement). If yes, gate the write on a fresh `UserConsents` row.
5. Write `AccountPrefsHistory` row with `before` and `after` payloads.
6. Update `AccountPrefs` row.
7. Both writes must succeed atomically — Spanner read/write transaction.
8. Emit a procedure-history event for `account.admin update_prefs` (already exists in backend per `apps/account-intent-builder/src/domain/processor.py:384-470`).
9. Return the new `AccountPrefs` projection + the `history_id` for receipt confirmation.

## 6. Architecture options

Daniel offered three. Below: tradeoffs and recommendation.

### Option 1 — Microservice

A new service (`account-prefs-history`) exposes a write endpoint. Both `admin-portal` and the investor BFF call it. The service performs steps 1-9 above; nothing else writes to `AccountPrefs` or `AccountPrefsHistory`.

**Pros**: single procedure implementation; forces conformance; easy to swap implementations.
**Cons**: one more service to operate, deploy, monitor; latency adds a hop; the "front end owns it" framing weakens since the procedure is centralized.

### Option 2 — Documented procedure

Every app (admin-portal, investor BFF, any future frontends) implements the same procedure per a published spec document.

**Pros**: simplest infra; no new deploy unit.
**Cons**: drift inevitable; consistency held only by code review; testing across implementations is fragile.

### Option 3 — `apps/common` shared code (Daniel's stated preference)

The procedure lives in `refinity-main/apps/common/account_prefs_history/{writer.py,models.py,...}` alongside `stream_identity`, `trade_lifecycle`, `broker_driver`, `snaptrade_driver`. Every app that writes `AccountPrefs` imports from `apps/common`. The deploy procedure for each consumer must pull a pinned `apps/common` version.

**Pros**: single source of truth for the procedure; aligns with how `apps/common.trade_lifecycle.writer.py` already works for trade-lifecycle evidence; mirrors Daniel's existing architectural pattern.
**Cons**: investor frontend is TypeScript, not Python. Cross-language consumption requires either a TS port with conformance tests (drift risk) or a Python sidecar (extra deploy unit).

### Recommended: Option 3 with a hybrid TS/Python split (Option 3c)

- **TS port for reads and validation** lives in `packages/common-ts/account-prefs-history/` and is verified against the Python source via a parity test that runs both implementations against shared fixture inputs and asserts identical outputs.
- **Python sidecar for writes** (a thin Cloud Run service or Cloud Function wrapping `apps/common.account_prefs_history.writer`). All write paths go through this sidecar regardless of caller language, ensuring the audit-integrity invariant holds.
- The BFF talks to the sidecar via a typed HTTP client for writes; uses the TS port locally for read-side display/validation.

**Why hybrid**:

- Pure TS port (Option 3a) risks drift on write-time invariants. The write path is the load-bearing audit path; drift here is unacceptable.
- Pure Python sidecar (Option 3b) makes read-side operations (form validation, diff preview, "what would this change look like") incur a network hop. Read-side is hot-path UX.

### Decision (pending Daniel ratification)

Recommendation: **Option 3c — hybrid**. Final choice deferred to PR-D after Daniel reviews this doc and confirms or counter-proposes.

## 7. SEC 203A-2(e) proof-of-consent implications

Internet adviser recordkeeping (per Rule 204-2 and 203A-2(e)) requires:

- The records exist (✅ — `AccountPrefsHistory` table)
- The records are tamper-evident (✅ — append-only by primary-key design; Spanner immutability semantics)
- Investor-initiated changes are signed (✅ — `ip_hash`, `user_agent_hash`, `device_fp_hash`, `signed_consent_ref` to a freshly-accepted disclosure where required)
- Records survive account closure for the required retention period (✅ — covered by `trade_lifecycle_retention_legal_hold.md` if `AccountPrefsHistory` is added to the retention scope; needs Daniel to extend the retention guard)

**Important**: `AccountPrefsHistory` should be added to the retention scope at `apps/common/trade_lifecycle/retention.py` so the 7-year minimum retention and legal-hold rules apply uniformly.

## 8. BFF prototype-store interim implementation

Until the backend table ships, the BFF holds an interim `AccountPrefsHistory` ledger in the prototype-store:

```
apps/web/src/lib/prototype-store/entities/account-prefs-history.ts
```

The entity shape mirrors the proposed DDL (§4) so the migration to backend is a transparent move (same field names, same write semantics, same read API). When the backend ships, the BFF route stops writing locally and starts proxying.

Critical migration rule: every interim BFF-written entry must be **exportable** to the backend table when it lands, with provenance preserved (i.e. `source = "investor_ui_prototype_phase2_6"` on entries written before backend cutover).

## 9. Test strategy

- **Conformance test** (Option 3c): the TS port and the Python writer process identical fixture inputs and produce identical outputs.
- **Contract test** (BFF): every `PATCH /api/v1/investor/account-prefs` request that changes any field produces exactly one `AccountPrefsHistory` entry.
- **Contract test** (boundary): no `AccountPrefsHistory` write without a corresponding `AccountPrefs` update, and vice versa (atomic-write invariant).
- **Contract test** (SEC): material changes (configurable list) require a fresh `signed_consent_ref` or the write fails closed.
- **E2E** (`account-prefs-history.spec.ts`): investor edits prefs → history view shows the change with diff highlighted → investor downloads receipt → receipt contains `correlation_id`, `ip_hash`, `signed_consent_ref` references.

## 10. Deploy strategy

If Option 3c lands:

1. **Pinned `apps/common` versioning**. Frontend repo has a `common.lock` file at root pinning the `refinity-main` commit hash.
2. **`tools/sync-common.sh`** script that fetches and verifies the pinned version, copies needed files, and aborts on mismatch.
3. **CI step** runs `sync-common.sh` before lint/typecheck so the build is reproducible.
4. **Python sidecar deploy** uses Daniel's standard Cloud Run pattern; service account scoped narrowly to `AccountPrefs` + `AccountPrefsHistory` tables only.
5. **Frontend deploy** has a new pre-deploy gate: pinned-common parity test must pass.

## 11. Open questions for Daniel

| #   | Question                                                                                                           | Why it matters                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1   | Confirm or counter-propose the Option 3c hybrid architecture                                                       | Drives PR-D and PR-F design                                                              |
| 2   | Should `AccountPrefsHistory` live in your Spanner instance?                                                        | Strong preference: yes — keeps audit trail unified with rest of trade-lifecycle evidence |
| 3   | Confirm the DDL shape proposed in §4, or counter-propose                                                           | Locks the contract                                                                       |
| 4   | Confirm `apps/common.account_prefs_history.writer` is the canonical writer for ALL writers (admin-portal included) | Otherwise drift                                                                          |
| 5   | Add `AccountPrefsHistory` to retention scope at `apps/common/trade_lifecycle/retention.py`?                        | Required for SEC compliance                                                              |
| 6   | List of "material change" fields requiring fresh consent re-ack (e.g. all? only `excluded_assets`? config-driven?) | Affects the write procedure                                                              |
| 7   | Should `admin_portal` writes carry an `intervention_id` linking to `AdminInterventions`?                           | Required to distinguish investor-initiated vs operator-assisted                          |
| 8   | What's the timeline for shipping the backend table? Phase 3? Sooner?                                               | Drives BFF prototype-store interim scope                                                 |

## 12. Production-blocker classification

`AccountPrefsHistory` is a **production blocker** for the investor product:

- Without it, investor preference changes are not auditable per regulatory requirements.
- Without it, the Account Controls Center (Surface 4) cannot ship in a regulatorily safe form.
- Surface 4 implementation is gated on at least the BFF prototype-store interim entity landing, with the backend migration scheduled.

Severity: **Critical** per Gap Register V3.

## 13. PR sequence

| PR                      | Scope                                                                                                      | Status                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------- |
| PR-D                    | This doc finalized + DDL spec + write procedure spec, sent to Daniel                                       | drafted (this branch)        |
| Daniel review           | DDL ratified, architecture choice confirmed                                                                | pending                      |
| PR-F                    | Surface 4 (Account Controls Center) + BFF prototype-store entity + interim write path                      | blocked on PR-D ratification |
| Backend PR (Daniel)     | `AccountPrefsHistory` table DDL ships in `refinity-main`; `apps/common.account_prefs_history` writer ships | parallel track, Daniel-owned |
| PR (frontend follow-up) | BFF switches from prototype-store writes to Python sidecar / Admin Portal proxy                            | after Daniel ships backend   |

## 14. Scope lock

No frontend product code changes from this doc alone. No backend changes (Daniel decides his own track based on this proposal). No SEC 203A-2(e) boundary weakened. No new product surface beyond Surface 4 reframing (already tracked in `surface-reframing-map`).
