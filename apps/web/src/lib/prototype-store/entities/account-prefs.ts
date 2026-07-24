/**
 * AccountPrefs — investor-editable knobs on the trading account
 * (Sprint 3, PR-F).
 *
 * Contract: docs/phase2-6-account-prefs-history-contract.md §3.
 *
 * Fields per §3:
 *   - drift_threshold      DecimalString, investor-editable, material
 *   - min_order            DecimalString, investor-editable, non-material
 *   - excluded_assets      string[],      investor-editable, material
 *   - fractional_enabled   boolean,       investor-editable, non-material
 *
 * S8 optimistic concurrency: `version` monotonically increases per
 * accepted write; the PATCH route requires an `If-Match: <version>`
 * header and rejects with 409 on mismatch so concurrent edits from two
 * tabs can never silently overwrite each other. Version 0 means "no
 * prefs row yet"; the first successful write emits version 1.
 *
 * The store is BFF-owned prototype until Daniel's canonical AccountPrefs
 * writer lands in `apps/common` (D6). At that point this entity is
 * deleted and callers switch to the backend-owned projection. The
 * `mock_state: true` flag on history rows is the type-level proof that
 * these bytes are prototype-only and never a Daniel book-and-record.
 */
import { resolveKvStore } from "../../store";

export interface AccountPrefs {
  accountId: string;
  driftThreshold?: string; // DecimalString per Contract V3 §8.14
  minOrder?: string; // DecimalString
  excludedAssets: string[];
  fractionalEnabled: boolean;
  updatedAt: string;
  version: number;
}

/**
 * Material-change fields per the docs §3 proposal. A PATCH that touches
 * any of these requires a fresh UserConsents row referenced by
 * `signed_consent_ref`; the route enforces this and returns 409 with a
 * `material_change_requires_consent` reason on missing consent.
 */
export const MATERIAL_FIELDS = new Set<keyof AccountPrefs>([
  "driftThreshold",
  "excludedAssets",
]);

const store = resolveKvStore<AccountPrefs>("account-prefs", "account-prefs");

export async function getAccountPrefs(
  accountId: string,
): Promise<AccountPrefs | null> {
  return store.get(accountId);
}

/**
 * The empty-state projection used when no prefs row exists yet. The
 * client uses this as the starting form; the first PATCH creates the
 * row with version 1.
 */
export function emptyPrefs(accountId: string): AccountPrefs {
  return {
    accountId,
    excludedAssets: [],
    fractionalEnabled: false,
    updatedAt: new Date(0).toISOString(),
    version: 0,
  };
}

/**
 * Compute the diff between `before` and `after`. Empty result means no
 * material bytes changed and callers must skip the write entirely (no
 * history row, no receipt) per docs §5 rule 5.
 */
export function diffPrefs(
  before: AccountPrefs,
  after: AccountPrefs,
): (keyof AccountPrefs)[] {
  const fields: (keyof AccountPrefs)[] = [
    "driftThreshold",
    "minOrder",
    "excludedAssets",
    "fractionalEnabled",
  ];
  const changed: (keyof AccountPrefs)[] = [];
  for (const f of fields) {
    if (f === "excludedAssets") {
      const b = before.excludedAssets;
      const a = after.excludedAssets;
      if (b.length !== a.length || b.some((x, i) => x !== a[i])) {
        changed.push(f);
      }
    } else if (before[f] !== after[f]) {
      changed.push(f);
    }
  }
  return changed;
}

export function isMaterialDiff(diff: readonly (keyof AccountPrefs)[]): boolean {
  return diff.some((f) => MATERIAL_FIELDS.has(f));
}

/**
 * Write the updated prefs with an incremented version. Callers must
 * have verified `expectedVersion === current.version` before calling —
 * the route layer owns the 409 shape. This function itself is a plain
 * put; atomicity vs the history append is delegated to the caller (or
 * to the durable driver's transaction primitive when it lands, per S8).
 */
export async function writeAccountPrefs(
  next: AccountPrefs,
): Promise<AccountPrefs> {
  await store.put(next.accountId, next);
  return next;
}
