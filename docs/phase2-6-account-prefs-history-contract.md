# Phase 2.6 AccountPrefs History Contract

**Date:** 2026-05-30
**Branch:** `phase2-6-pr-d-account-prefs-history-contract`
**Status:** **Phase 2.6 PR-D contract.** Daniel has confirmed backend ownership of `AccountPrefsHistory`. This contract records that decision, scopes the frontend mock interfaces permitted in the interim, and lists the open backend questions Daniel will resolve before production wiring.
**Source of truth:** [`docs/phase2-6-authoritative-source-of-truth.md`](phase2-6-authoritative-source-of-truth.md).
**Companions:**

- [`docs/phase2-6-signal-to-investor-product-contract-v3.md`](phase2-6-signal-to-investor-product-contract-v3.md) §13.1 (Option 3c ratification)
- [`docs/phase2-6-account-prefs-history-options.md`](phase2-6-account-prefs-history-options.md) (architecture options + open questions)
- [`docs/phase2-6-gap-register-v3-against-authoritative.md`](phase2-6-gap-register-v3-against-authoritative.md) (`GAP-PREFS-HISTORY-001` / `-002` / `-003`, `GAP-SURFACE4-009`)

**Gaps:** `GAP-PREFS-HISTORY-001`, `GAP-PREFS-WRITE-002`, `GAP-PREFS-AUDIT-003`, `GAP-SURFACE4-009`.

## Anchors

| Repo                                                    | Branch | Commit        |
| ------------------------------------------------------- | ------ | ------------- |
| Backend (`gitlab.com/refinity_dev/refinity-main`)       | `main` | **`9f9dfc9`** |
| Frontend (`github.com/ReFi-Trading-Inc/refi-us-sec-ia`) | `main` | **`5d68f27`** |

---

## 1. Daniel Decision: Backend-Owned AccountPrefsHistory

**Decision (Daniel, 2026-05-30):** `AccountPrefsHistory` lives in Daniel's Spanner instance / backend path. Daniel will set up the table and the backend wiring so the frontend can later call into the canonical read and write paths.

### What this means

- `AccountPrefsHistory` is **not** a BFF-owned production system of record.
- Daniel's backend is the long-term home for the table, the canonical writer, the retention scope binding, the consent-re-ack enforcement, and the admin-portal participation rules.
- The frontend may **mock** Account Controls interfaces in the interim, using the existing `AccountPrefs` table fields as the data-shape guide and the Admin Portal account settings screen as the UX guide.
- Mock state is **temporary**. It must be replaced by Daniel's canonical backend write path once available.
- The BFF must **not** become the long-term system of record for `AccountPrefsHistory`.
- The BFF must **not** invent a production writer.
- The BFF must **not** pretend the mock state is canonical, in API responses, in audit copy, in UI tooltips, or in receipt language.

### What the frontend may do in the interim

- Build a mock `AccountPrefsProjection` (current values only) using the `AccountPrefs` field list confirmed by Daniel — see §3 below.
- Build a mock `AccountPrefsHistoryEntry` ledger using the proposed shape from `phase2-6-account-prefs-history-options.md` §4, **labeled as mock** in the BFF route response and in the UI affordance.
- Use the Admin Portal account settings screen as the UX reference for which controls to expose to the investor.
- Capture investor-initiated diffs in a BFF-only prototype store keyed on `account_id` so the UI has continuity during the mock period.

### What the frontend must not do

- Emit any backend wire payload that claims to be a canonical `AccountPrefsHistory` write.
- Treat the BFF prototype store as the long-term ledger.
- Pretend that the mock receipt is the regulatory record.
- Bypass the SEC 203A-2(e) boundary — mock writes are still subject to authenticated investor session, `account_id` ownership, signed-consent gating where applicable, `InvestorActionReceipt` emission, and the §13.3 verb allowlist (`update_prefs`).
- Implement adapter code that proxies to a not-yet-existent Daniel endpoint.

### How the boundary is preserved

- The mock `AccountPrefsHistory` ledger writes must carry an explicit `source: "investor_ui_prototype_phase2_6"` marker so the migration to Daniel's canonical writer can be reasoned about and old mock rows can be either reconciled or discarded.
- The BFF route response envelope for the mock surface must include `"x-refi-mock-state": true` and a UI banner string ("Account Controls preview — backend wiring pending Daniel implementation") so the prototype-state policy ([`docs/bff-prototype-state-contract.md`](bff-prototype-state-contract.md), three-bucket rule) is honored.
- The mock surface emits an `InvestorActionReceipt` per Contract V3 boundary rules so the action stream remains intact for audit. Receipts must say `mock_prototype` in the outcome envelope until Daniel's canonical writer lands.
- No `RecordAccessLog` is emitted from the mock history-view route until Daniel's read path lands and the read becomes a real record access. Until then, the history view is decorative.

---

## 2. Scope of PR-D

PR-D is **docs-only**. It:

1. Records Daniel's backend-ownership decision in this contract.
2. Scopes the frontend mock interfaces the next branch may implement.
3. Updates `phase2-6-account-prefs-history-options.md` to mark the ownership question resolved.
4. Updates Gap Register V3 to reflect backend-pending status.
5. Annotates Surface 4 with the mock-allowed-after-PR-D status.

PR-D does **not**:

- Implement any UI.
- Implement any adapter code.
- Modify Daniel backend.
- Create a BFF-owned `AccountPrefsHistory` table.
- Create a BFF-owned writer.
- Unblock production Surface 4.
- Weaken any SEC 203A-2(e) boundary.

The next safe branch after PR-D lands may be:

> `phase2-6-surface4-account-controls-mock`

which may build mock-only Account Controls UI per §1 + §3 + §5 below, with clear mock labels and no production writer.

---

## 3. AccountPrefs field guide (mock data-shape reference)

The mock UI uses the current `AccountPrefs` fields as the data-shape guide. These are the investor-facing knobs the prototype surface should expose. **The Daniel backend may refine field shapes during canonical wiring; the prototype must accept refinement without UI regression.**

From `phase2-6-account-prefs-history-options.md` §2 and `frontend_integration_contract.md`:

| Field                | Type guide      | Investor-editable?   | Material change? (consent re-ack)                                                      |
| -------------------- | --------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `account_id`         | string          | no (session-derived) | n/a                                                                                    |
| `drift_threshold`    | `DecimalString` | yes                  | **TBD by Daniel** — proposal: yes (drift band materially affects when intents fire)    |
| `min_order`          | `DecimalString` | yes                  | TBD — proposal: no (operational floor, not advice-altering)                            |
| `excluded_assets`    | string[]        | yes                  | **TBD by Daniel** — proposal: yes (changes the asset universe the investor authorized) |
| `fractional_enabled` | boolean         | yes                  | TBD — proposal: no (execution-mechanic toggle)                                         |
| `updated_at`         | timestamp       | derived              | n/a                                                                                    |

The "material change" column is the **proposal** the prototype uses for the mock consent re-ack gate. Daniel must ratify the final list before canonical implementation. The mock UI must show the gate prompt for any field marked "yes" in the proposal so the flow is rehearsable.

**Out of scope for mock surface (read-only):** `RiskLimits` (operator-mutable; investor-read-only per Contract V3 rule §8.14), `AccountConsents` / `UserConsents` (consent evidence; read for display only), `AccountSettings` (operator-managed runtime).

---

## 4. AccountPrefs History entry shape (mock-only)

The mock `AccountPrefsHistoryEntry` shape mirrors the proposed DDL from `phase2-6-account-prefs-history-options.md` §4. This shape is **the prototype mock; not a Daniel backend contract.** Daniel's canonical DDL may differ. The prototype must accept reshape during integration without UI regression.

```ts
export interface MockAccountPrefsHistoryEntry {
  history_id: string; // BFF-assigned ULID; will be replaced by Daniel canonical ID
  account_id: string;
  changed_at: string; // ISO 8601
  changed_by_auth_id: string; // session-derived
  source: "investor_ui_prototype_phase2_6"; // hard-coded for the mock period
  before_payload: Partial<MockAccountPrefsProjection>;
  after_payload: Partial<MockAccountPrefsProjection>;
  diff_fields: string[];
  reason_code?: "investor_initiated"; // mock surface only emits investor-initiated
  signed_consent_ref?: string; // pointer to UserConsents row when material change
  ip_hash?: string;
  user_agent_hash?: string;
  device_fingerprint_hash?: string;
  correlation_id: string;
  mock_state: true; // type-level proof this is not canonical
}
```

The `mock_state: true` field is non-removable on this type. When Daniel's canonical writer lands, the prototype type is deleted in full — there is no "promote mock to canonical" migration on this object.

---

## 5. Mock surface boundary contract

The Account Controls mock surface (when built on the next branch) must:

1. **Authenticate** the investor session before any read or write.
2. **Derive** `account_id` from the session; reject any caller-supplied `account_id` (403).
3. **Display** the read-only fields (`RiskLimits`, `UserConsents`/`AccountConsents`, `AccountSettings`) without edit affordances.
4. **Expose** the four investor-editable knobs per §3 with input validation matching the BFF decimal-string discipline.
5. **Compute** a diff against the current mock `AccountPrefs` row; empty diff is a no-op (no history row written).
6. **Gate** material-change writes on a fresh `UserConsents` row per the proposed material-change list. Until Daniel ratifies the final list, the prototype's proposal is the gate.
7. **Write** a `MockAccountPrefsHistoryEntry` to the BFF prototype store, atomically with the `AccountPrefs` update (single transaction at the BFF; not a Daniel write).
8. **Emit** exactly one `InvestorActionReceipt` per accepted `update_prefs` mutation (Contract V3 §13.3 verb allowlist). The receipt outcome envelope carries `"mock_prototype": true`.
9. **Label** every response envelope and every UI affordance with the mock-state banner (§1).
10. **Reject** any attempt to surface mock state as canonical in copy, receipts, or audit records.

The mock surface must **not**:

- Carry per-trade Accept / Approve / Submit affordances.
- Mediate staff approval, founder review, or support-led advice.
- Surface admin-action verbs outside the §13.3 allowlist.
- Surface `RiskLimits` as editable.
- Expose any `target_account_id`, `template.admin`, `force_rebuild`, `rebalance`, or `manual_rebalance` parameter.

These boundaries are enforced by the existing tripwire (admin-shape exclusion) and contract assertions (allowlist + receipt-vs-access-log separation).

---

## 6. Open backend questions (Daniel will ratify)

| #   | Question                                                                                                                          | Why it matters                                                 | Owner          |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------- |
| D1  | Final DDL shape for `AccountPrefsHistory`                                                                                         | Locks the canonical table contract                             | Daniel         |
| D2  | Exact table name (`AccountPrefsHistory` vs `account_prefs_history` vs other)                                                      | Naming alignment with the rest of Daniel's tables              | Daniel         |
| D3  | Canonical writer module path under `apps/common/account_prefs_history/*`                                                          | Frontend / BFF integration target                              | Daniel         |
| D4  | Final material-change field list (which fields trigger fresh consent re-ack)                                                      | Affects the consent gate logic                                 | Daniel + legal |
| D5  | Consent re-ack trigger list (which `UserConsents` versions count as fresh)                                                        | Material-change gate semantics                                 | Daniel + legal |
| D6  | Admin-assisted write linkage — does `admin_portal` writes carry an `intervention_id` linking to `AdminInterventions`?             | Distinguishes investor-initiated from operator-assisted writes | Daniel         |
| D7  | Read / write API shape exposed to the BFF (REST? gRPC over sidecar? typed Cloud Run endpoint?)                                    | Frontend client shape                                          | Daniel         |
| D8  | Timeline for Daniel backend wiring                                                                                                | Drives Surface 4 production unblock                            | Daniel         |
| D9  | Retention class — is `AccountPrefsHistory` added to `apps/common/trade_lifecycle/retention.py` with `regulatory_7y` + legal hold? | SEC 203A-2(e) recordkeeping compliance                         | Daniel + legal |
| D10 | Parity fixture suite — is the parity test owned by Daniel's repo or this repo?                                                    | Owns the TS/Python parity guarantee                            | Joint          |

Until D1–D10 close, the prototype mock surface is the frontend's authorized vehicle, scoped per §5.

---

## 7. SEC 203A-2(e) preservation

The mock surface does not weaken SEC 203A-2(e) because:

- The standing investor authorization (signed `UserConsents` + signed disclosures + advisory-profile version) is still the regulatory fulcrum.
- Mock-period changes that touch material fields are gated on a fresh `signed_consent_ref` (per §5.6).
- `InvestorActionReceipt` is emitted for every accepted mock mutation, preserving the action stream.
- The mock surface never exposes per-trade Accept, staff approval, founder review, or support-led advice.
- The mock surface never clears risk rejection, reconciliation block, operator-set controls, or system-set controls.

When Daniel's canonical writer lands, the regulatory record migrates from receipt + mock ledger to the canonical `AccountPrefsHistory` Spanner table. The receipt stream remains intact across the migration; the mock ledger is discarded.

---

## 8. Surface 4 status after PR-D

| Status                              | Before PR-D | After PR-D                                                   |
| ----------------------------------- | ----------- | ------------------------------------------------------------ |
| Production Surface 4 implementation | Blocked     | **Blocked** (pending Daniel backend wiring)                  |
| Mock Surface 4 frontend interface   | Not allowed | **Allowed**, per §1 + §3 + §5                                |
| Mock branch                         | n/a         | `phase2-6-surface4-account-controls-mock` (next safe branch) |

PR-D itself does not start the mock branch. The mock branch is the **next sequenced PR** after PR-D merges. Production Surface 4 remains gated on Daniel D1–D10.

---

## 9. Scope lock

- No backend changes.
- No UI implementation in this PR.
- No adapter implementation in this PR.
- No production `AccountPrefsHistory` table.
- No production writer.
- No SEC 203A-2(e) boundary weakening.
- Mock-state policy honored: mock surface (when built) is clearly labeled, never claims canonical, and is discardable when Daniel ships.
