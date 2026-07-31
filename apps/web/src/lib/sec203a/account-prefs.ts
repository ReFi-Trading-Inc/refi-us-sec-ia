/**
 * AccountPrefs — the investor-editable preference surface.
 *
 * Source of truth: Daniel's written direction 2026-07-28, recorded in
 * docs/phase2-7-daniel-direction-resolution.md §4.
 *
 * Daniel approved EXACTLY four investor-editable fields. `RiskLimits`,
 * template risk settings, broker state, and operator/system controls are
 * read-only to the investor, and the frontend must not add a
 * capital-allocation percentage control — it is not a current `AccountPrefs`
 * capability.
 *
 * Ownership (why this module holds names, not logic):
 *   - There is ONE canonical transactional writer, backend-side. It updates
 *     `AccountPrefs` and appends `AccountPrefsHistory` atomically, in the same
 *     Spanner database. Direct preference writes outside it are prohibited.
 *   - The "material change" classification — which edits require a fresh
 *     acknowledgment of the managed-preferences disclosure because they
 *     EXPAND trading — is a versioned BACKEND policy. The frontend must render
 *     a backend-supplied classification and must never reimplement the rule.
 *     That is why no `isMaterialChange()` lives here.
 *   - The BFF prototype store is interim. It must never become the record of
 *     truth for preferences or their history.
 *
 * BFF-facing investor-api routes (blocked on the dev connection package):
 *   GET   /api/v1/investor/accounts/{account_id}/preferences
 *   PATCH /api/v1/investor/accounts/{account_id}/preferences
 *   GET   /api/v1/investor/accounts/{account_id}/preferences/history
 */

// ─── The four editable fields ───────────────────────────────────────────────

/**
 * Backend (snake_case) spellings, as they appear on the investor-api wire.
 * The frontend camelCase mirror is `INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS`.
 */
export const INVESTOR_EDITABLE_ACCOUNT_PREFS = [
  "drift_threshold",
  "min_order",
  "excluded_assets",
  "fractional_enabled",
] as const;

export type InvestorEditableAccountPref =
  (typeof INVESTOR_EDITABLE_ACCOUNT_PREFS)[number];

/** Frontend camelCase mirror, in the same order. */
export const INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS = [
  "driftThreshold",
  "minOrder",
  "excludedAssets",
  "fractionalEnabled",
] as const;

export type InvestorEditableAccountPrefField =
  (typeof INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS)[number];

export function isInvestorEditableAccountPref(
  value: unknown,
): value is InvestorEditableAccountPref {
  return (
    typeof value === "string" &&
    (INVESTOR_EDITABLE_ACCOUNT_PREFS as readonly string[]).includes(value)
  );
}

export function isInvestorEditableAccountPrefField(
  value: unknown,
): value is InvestorEditableAccountPrefField {
  return (
    typeof value === "string" &&
    (INVESTOR_EDITABLE_ACCOUNT_PREF_FIELDS as readonly string[]).includes(value)
  );
}

// ─── Read-only categories ───────────────────────────────────────────────────

/**
 * Control names the investor may VIEW but never EDIT.
 *
 * These are listed in both camelCase and snake_case because the Phase 2.7
 * "confirmed clean" check originally grepped only for snake_case names
 * (`capital_allocation`, `allocation_pct`, `capital_usage`) and therefore
 * missed the seven camelCase controls that were live in the Automation Center
 * — `maxPositionSizeBps` and `minimumCashReserveBps` (capital allocation) plus
 * `maxSingleOrderUsd`, `dailyOrderLimit`, `dailyLossPauseBps`,
 * `drawdownPauseBps`, and `maxOpenOrders` (risk limits). The contract
 * assertion that consumes this list scans for BOTH spellings so the same class
 * of miss cannot recur.
 *
 * Removed from the investor-editable surface on 2026-07-30. They may still
 * appear in READ-ONLY displays sourced from backend `RiskLimits` / template
 * limits / effective account controls, and in architecture types that are not
 * wired to an editable control.
 */
export const READ_ONLY_CONTROL_NAMES = [
  // Capital allocation — never investor-editable.
  "maxPositionSizeBps",
  "max_position_size_bps",
  "minimumCashReserveBps",
  "minimum_cash_reserve_bps",
  "capitalAllocation",
  "capital_allocation",
  "allocationPct",
  "allocation_pct",
  "capitalUsage",
  "capital_usage",
  // Risk limits — backend `RiskLimits`, operator-owned.
  "maxSingleOrderUsd",
  "max_single_order_usd",
  "dailyOrderLimit",
  "daily_order_limit",
  "dailyLossPauseBps",
  "daily_loss_pause_bps",
  "drawdownPauseBps",
  "drawdown_pause_bps",
  "maxOpenOrders",
  "max_open_orders",
] as const;

export type ReadOnlyControlName = (typeof READ_ONLY_CONTROL_NAMES)[number];

// Compile-time proof the editable set and the read-only set are disjoint.
type _EditableIsNotReadOnly = ReadOnlyControlName &
  (InvestorEditableAccountPref | InvestorEditableAccountPrefField);
type _Assert<T extends never> = T;
type _Check = _Assert<_EditableIsNotReadOnly>;
