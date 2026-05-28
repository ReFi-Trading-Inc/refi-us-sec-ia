/**
 * ProfileConfirmation — durable record that the investor re-confirmed the
 * accuracy of their advisory profile at a specific version.
 *
 * Distinct from `InvestorProfileSnapshot` (which records the profile fields
 * themselves) and from `InvestorActionReceipt` (the per-action audit row).
 * Stored separately so the Records Center can show a confirmation timeline
 * even when the underlying profile snapshot has not changed.
 *
 * Append-only and idempotent per (accountId, profileVersion): re-confirming
 * the same version is a no-op write that returns the existing record.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";

export interface ProfileConfirmation {
  accountId: string;
  authId: string;
  profileVersion: number;
  previousConfirmedVersion: number | null;
  confirmedAt: string;
  materialChange: boolean;
  changedFields: string[];
  managedExecutionStatusBefore: string | null;
  managedExecutionStatusAfter: string | null;
  reasonCodeCleared: string | null;
  activeExecutionPolicyVersion: number | null;
  correlationId: string;
  meta: PrototypeMeta;
}

const store = kvStore<ProfileConfirmation>("profile-confirmations");

function key(accountId: string, version: number): string {
  return `${accountId}__v${String(version).padStart(6, "0")}`;
}

export async function getProfileConfirmation(
  accountId: string,
  profileVersion: number,
): Promise<ProfileConfirmation | null> {
  return store.get(key(accountId, profileVersion));
}

export async function listProfileConfirmations(
  accountId: string,
): Promise<ProfileConfirmation[]> {
  const all = await store.list(`${accountId}__`);
  return all
    .map((e) => e.value)
    .sort((a, b) => a.profileVersion - b.profileVersion);
}

export async function getLatestProfileConfirmation(
  accountId: string,
): Promise<ProfileConfirmation | null> {
  const list = await listProfileConfirmations(accountId);
  return list.length === 0 ? null : (list[list.length - 1] ?? null);
}

export async function appendProfileConfirmation(
  args: Omit<ProfileConfirmation, "confirmedAt" | "meta">,
): Promise<{ confirmation: ProfileConfirmation; created: boolean }> {
  const k = key(args.accountId, args.profileVersion);
  const existing = await store.get(k);
  if (existing) {
    return { confirmation: existing, created: false };
  }
  const stored: ProfileConfirmation = {
    ...args,
    confirmedAt: new Date().toISOString(),
    meta: makePrototypeMeta(args.correlationId),
  };
  const ok = await store.putIfAbsent(k, stored);
  if (!ok) {
    const after = await store.get(k);
    if (!after) {
      throw new Error(`profile confirmation ${k} missing after putIfAbsent`);
    }
    return { confirmation: after, created: false };
  }
  return { confirmation: stored, created: true };
}
