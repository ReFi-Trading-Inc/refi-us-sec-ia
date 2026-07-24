/**
 * AccountPrefsHistory — append-only mock history of AccountPrefs edits
 * (Sprint 3, PR-F).
 *
 * Contract: docs/phase2-6-account-prefs-history-contract.md §4. The
 * `mock_state: true` field is non-removable on the type: when Daniel's
 * canonical writer lands (D6) this entity is deleted rather than
 * migrated, and the caller switches to the backend projection.
 *
 * Invariants:
 *   - append-only; no update, no delete.
 *   - exactly one row per accepted AccountPrefs write. An empty diff
 *     is a no-op at the route layer; this module never writes a row
 *     with `diff_fields: []`.
 *   - `signed_consent_ref` is required when any diff field is in
 *     MATERIAL_FIELDS (account-prefs.ts). Enforced at the route layer;
 *     the assertion in contract-assertions.ts covers the invariant.
 */
import { resolveAppendOnlyStore } from "../../store";
import type { AccountPrefs } from "./account-prefs";

export interface AccountPrefsHistoryEntry {
  historyId: string;
  accountId: string;
  changedAt: string;
  changedByAuthId: string;
  source: "investor_ui_prototype_phase2_6";
  beforePayload: Partial<AccountPrefs>;
  afterPayload: Partial<AccountPrefs>;
  diffFields: string[];
  reasonCode: "investor_initiated";
  signedConsentRef?: string;
  ipHash?: string;
  userAgentHash?: string;
  deviceFingerprintHash?: string;
  correlationId: string;
  mockState: true;
}

const history = resolveAppendOnlyStore<AccountPrefsHistoryEntry>(
  "account-prefs-history",
  "account-prefs-history",
);

export async function appendPrefsHistory(
  entry: Omit<
    AccountPrefsHistoryEntry,
    "historyId" | "mockState" | "source" | "reasonCode" | "changedAt"
  >,
): Promise<AccountPrefsHistoryEntry> {
  const row: AccountPrefsHistoryEntry = {
    historyId: crypto.randomUUID(),
    changedAt: new Date().toISOString(),
    source: "investor_ui_prototype_phase2_6",
    reasonCode: "investor_initiated",
    mockState: true,
    ...entry,
  };
  await history.append(row);
  return row;
}

export async function listPrefsHistory(
  accountId: string,
  limit = 100,
): Promise<AccountPrefsHistoryEntry[]> {
  const all = await history.list((e) => e.accountId === accountId);
  return all
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, limit);
}
