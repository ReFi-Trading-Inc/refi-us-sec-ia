/**
 * Investor profile entities (G-003).
 *
 * Drafts are mutable per (auth_id, draft_id). Snapshots are immutable per
 * (account_id, version) and are referenced by every advisory record.
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";

export interface InvestorProfileFields {
  goal: string;
  horizon: string;
  incomeBand: string;
  liquidityNeed: string;
  riskTolerance: string;
  experience: string;
  accountPurpose: string;
  restrictions?: string;
}

export interface InvestorProfileDraft extends InvestorProfileFields {
  authId: string;
  draftId: string;
  lastUpdatedAt: string;
  meta: PrototypeMeta;
}

export interface InvestorProfileSnapshot extends InvestorProfileFields {
  accountId: string;
  profileVersion: number;
  contentHash: string;
  meta: PrototypeMeta;
}

const drafts = kvStore<InvestorProfileDraft>("profile-drafts");
const snapshots = kvStore<InvestorProfileSnapshot>("profile-snapshots");

function draftKey(authId: string, draftId: string): string {
  return `${authId}__${draftId}`;
}

function snapshotKey(accountId: string, version: number): string {
  return `${accountId}__v${String(version).padStart(6, "0")}`;
}

function contentHash(fields: InvestorProfileFields): string {
  const ordered = JSON.stringify({
    goal: fields.goal,
    horizon: fields.horizon,
    incomeBand: fields.incomeBand,
    liquidityNeed: fields.liquidityNeed,
    riskTolerance: fields.riskTolerance,
    experience: fields.experience,
    accountPurpose: fields.accountPurpose,
    restrictions: fields.restrictions ?? "",
  });
  // FNV-1a, 64-bit hex; deterministic, not cryptographic.
  let h1 = 2166136261;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < ordered.length; i++) {
    h1 ^= ordered.charCodeAt(i);
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 ^= ordered.charCodeAt(i);
    h2 = Math.imul(h2, 16777619) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export async function getProfileDraft(
  authId: string,
  draftId: string,
): Promise<InvestorProfileDraft | null> {
  return drafts.get(draftKey(authId, draftId));
}

export async function putProfileDraft(
  draft: Omit<InvestorProfileDraft, "lastUpdatedAt" | "meta"> & {
    correlationId: string;
  },
): Promise<InvestorProfileDraft> {
  const stored: InvestorProfileDraft = {
    ...draft,
    lastUpdatedAt: new Date().toISOString(),
    meta: makePrototypeMeta(draft.correlationId),
  };
  await drafts.put(draftKey(draft.authId, draft.draftId), stored);
  return stored;
}

export async function listProfileSnapshots(
  accountId: string,
): Promise<InvestorProfileSnapshot[]> {
  const all = await snapshots.list(`${accountId}__`);
  return all
    .map((e) => e.value)
    .sort((a, b) => a.profileVersion - b.profileVersion);
}

export async function getLatestProfileSnapshot(
  accountId: string,
): Promise<InvestorProfileSnapshot | null> {
  const list = await listProfileSnapshots(accountId);
  return list.length === 0 ? null : (list[list.length - 1] ?? null);
}

export async function appendProfileSnapshot(args: {
  accountId: string;
  fields: InvestorProfileFields;
  correlationId: string;
}): Promise<InvestorProfileSnapshot> {
  const existing = await listProfileSnapshots(args.accountId);
  const last = existing[existing.length - 1];
  const nextVersion = last ? last.profileVersion + 1 : 1;
  const snapshot: InvestorProfileSnapshot = {
    ...args.fields,
    accountId: args.accountId,
    profileVersion: nextVersion,
    contentHash: contentHash(args.fields),
    meta: makePrototypeMeta(args.correlationId),
  };
  // Immutability: putIfAbsent — if the slot already exists, refuse (should
  // never happen because we computed nextVersion from the list).
  const ok = await snapshots.putIfAbsent(
    snapshotKey(args.accountId, nextVersion),
    snapshot,
  );
  if (!ok) {
    throw new Error(
      `profile snapshot ${args.accountId}/v${String(nextVersion)} already exists`,
    );
  }
  return snapshot;
}
