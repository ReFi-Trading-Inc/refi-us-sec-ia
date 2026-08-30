/**
 * Investor Profile v2 — the three persisted objects of the profile spec.
 *
 * Source of truth: docs/releases/2026-09-signal/investor-profile-spec.md §12.
 *
 * Three records, never merged:
 *   - answers      immutable version chain per account (1..n, contiguous);
 *   - assessments  immutable, keyed by (account, profileVersion, policy),
 *                  carrying full version provenance incl. answerSnapshotHash
 *                  so "what did policy vN conclude at the time?" is always
 *                  answerable and history is never rewritten (§12.1);
 *   - consent      links a disclosure acknowledgment (held in the existing
 *                  disclosure machinery) to the profile version it was made
 *                  against — suitability facts and informed acknowledgment
 *                  are different records (§10).
 *
 * The prototype store is interim; the eventual system of record is
 * backend-owned. Nothing here weakens that (`meta.source: "prototype-bff"`
 * on every record, same as every other entity).
 */
import { kvStore, makePrototypeMeta, type PrototypeMeta } from "../store";
import type {
  AdvisoryConsentRecord,
  InvestorProfileAnswers,
  InvestorProfileAssessment,
} from "../../sec203a/investor-profile";

export interface InvestorProfileAnswersVersion {
  accountId: string;
  profileVersion: number;
  answers: InvestorProfileAnswers;
  /** Deterministic hash of the answers payload — provenance for assessments. */
  answerSnapshotHash: string;
  meta: PrototypeMeta;
}

export interface InvestorProfileAssessmentRecord {
  accountId: string;
  profileVersion: number;
  answerSnapshotHash: string;
  assessment: InvestorProfileAssessment;
  meta: PrototypeMeta;
}

export interface AdvisoryConsentRecordEntry extends AdvisoryConsentRecord {
  accountId: string;
  meta: PrototypeMeta;
}

const answersStore = kvStore<InvestorProfileAnswersVersion>(
  "investor-profile-answers-v2",
);
const assessmentStore = kvStore<InvestorProfileAssessmentRecord>(
  "investor-profile-assessments-v2",
);
const consentStore = kvStore<AdvisoryConsentRecordEntry>(
  "advisory-consent-records",
);

function versionKey(accountId: string, version: number): string {
  return `${accountId}__v${String(version).padStart(6, "0")}`;
}

/** Recursively key-sorted serialization so nested objects hash stably. */
function stableSerialize(v: unknown): string {
  if (Array.isArray(v)) {
    return "[" + v.map(stableSerialize).join(",") + "]";
  }
  if (v !== null && typeof v === "object") {
    return (
      "{" +
      Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => JSON.stringify(k) + ":" + stableSerialize(val))
        .join(",") +
      "}"
    );
  }
  return v === undefined ? "null" : JSON.stringify(v);
}

/** FNV-1a 64-bit hex over the canonically-ordered answers JSON. */
export function answersSnapshotHash(answers: InvestorProfileAnswers): string {
  const ordered = stableSerialize(answers);
  let h1 = 2166136261;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < ordered.length; i++) {
    h1 ^= ordered.charCodeAt(i);
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (Math.imul(h2 ^ ordered.charCodeAt(i), 2654435761) >>> 0) ^ h1;
  }
  return (
    h1.toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")
  );
}

export async function latestProfileVersion(accountId: string): Promise<number> {
  const versions = await answersStore.list(`${accountId}__v`);
  return versions.reduce((max, v) => Math.max(max, v.value.profileVersion), 0);
}

/**
 * Append a NEW immutable answers version (last + 1). Any change to any answer
 * is a new version — spec §18: "Changing an answer generates a new immutable
 * profile version." Returns the created record; never overwrites.
 */
export async function appendProfileAnswers(args: {
  accountId: string;
  answers: InvestorProfileAnswers;
  correlationId: string;
}): Promise<InvestorProfileAnswersVersion> {
  const next = (await latestProfileVersion(args.accountId)) + 1;
  const record: InvestorProfileAnswersVersion = {
    accountId: args.accountId,
    profileVersion: next,
    answers: args.answers,
    answerSnapshotHash: answersSnapshotHash(args.answers),
    meta: makePrototypeMeta(args.correlationId),
  };
  const created = await answersStore.putIfAbsent(
    versionKey(args.accountId, next),
    record,
  );
  if (!created) {
    throw new Error(
      `profile answers v${String(next)} already exists for ${args.accountId} — versions are immutable and contiguous`,
    );
  }
  return record;
}

export async function getProfileAnswers(
  accountId: string,
  profileVersion: number,
): Promise<InvestorProfileAnswersVersion | null> {
  return answersStore.get(versionKey(accountId, profileVersion));
}

/**
 * Persist the deterministic assessment for one (account, profileVersion,
 * policyVersion). Immutable: re-running the same policy over the same
 * answers is a no-op returning the original; a DIFFERENT result for the
 * same key is an integrity error, never an update.
 */
export async function appendProfileAssessment(args: {
  accountId: string;
  profileVersion: number;
  answerSnapshotHash: string;
  assessment: InvestorProfileAssessment;
  correlationId: string;
}): Promise<InvestorProfileAssessmentRecord> {
  const key = `${versionKey(args.accountId, args.profileVersion)}__${args.assessment.assessmentPolicyVersion}`;
  const existing = await assessmentStore.get(key);
  if (existing) return existing;
  const record: InvestorProfileAssessmentRecord = {
    accountId: args.accountId,
    profileVersion: args.profileVersion,
    answerSnapshotHash: args.answerSnapshotHash,
    assessment: args.assessment,
    meta: makePrototypeMeta(args.correlationId),
  };
  await assessmentStore.putIfAbsent(key, record);
  return (await assessmentStore.get(key)) ?? record;
}

export async function getProfileAssessment(
  accountId: string,
  profileVersion: number,
  assessmentPolicyVersion: string,
): Promise<InvestorProfileAssessmentRecord | null> {
  return assessmentStore.get(
    `${versionKey(accountId, profileVersion)}__${assessmentPolicyVersion}`,
  );
}

// ── Mutable questionnaire draft (auth + account scoped) ─────────────────────
//
// Autosave/resume state for the in-progress questionnaire. PR #65 review
// round 2 hardened three properties:
//
//   OWNERSHIP  The draft key is authId + accountId. The auth contract allows
//              one authenticated user to own zero, one, or many accounts, and
//              the draft is eventually promoted into an ACCOUNT-scoped
//              immutable profile — so the account boundary is part of draft
//              identity. Pre-account onboarding is modelled EXPLICITLY as the
//              "preaccount" scope with one-way promotion: reads for an
//              account fall back to the preaccount draft until the first
//              account-scoped save lands; submission clears both.
//
//   ORDERING   Saves carry (sessionId, draftRevision). A save whose revision
//              is not strictly greater than the stored revision for the same
//              session is IGNORED (stored: false) — an older request can
//              never overwrite a newer draft, regardless of network order.
//              Revisions are client-serialized but server-VERIFIED; no
//              competing-request timestamps anywhere.
//
//   FINALITY   Submission closes the draft session with a tombstone naming
//              the sessionId. A late autosave from that session cannot
//              resurrect the cleared draft; a NEW questionnaire run uses a
//              fresh sessionId and proceeds normally.
//
// Drafts are MUTABLE working state, never part of the immutable version
// chain; submission promotes answers via appendProfileAnswers.

export const PREACCOUNT_SCOPE = "preaccount";

export interface InvestorProfileDraftV2 {
  kind: "draft";
  authId: string;
  accountId: string | null;
  sessionId: string;
  draftRevision: number;
  answers: InvestorProfileAnswers;
  currentStepId: string;
  lastUpdatedAt: string;
  meta: PrototypeMeta;
}

interface DraftTombstone {
  kind: "closed";
  authId: string;
  closedSessionId: string;
  meta: PrototypeMeta;
}

type DraftRecord = InvestorProfileDraftV2 | DraftTombstone;

const draftStore = kvStore<DraftRecord>("investor-profile-drafts-v2");

function draftKey(authId: string, accountId: string | null): string {
  return `${authId}__${accountId ?? PREACCOUNT_SCOPE}`;
}

export interface SaveDraftResult {
  stored: boolean;
  draft: InvestorProfileDraftV2 | null;
}

export async function saveProfileDraftV2(args: {
  authId: string;
  accountId: string | null;
  sessionId: string;
  draftRevision: number;
  answers: InvestorProfileAnswers;
  currentStepId: string;
  correlationId: string;
}): Promise<SaveDraftResult> {
  const key = draftKey(args.authId, args.accountId);
  const existing = await draftStore.get(key);
  if (
    existing?.kind === "closed" &&
    existing.closedSessionId === args.sessionId
  ) {
    // The session was closed by a successful submission — a late autosave
    // must not resurrect it.
    return { stored: false, draft: null };
  }
  if (
    existing?.kind === "draft" &&
    existing.sessionId === args.sessionId &&
    existing.draftRevision >= args.draftRevision
  ) {
    // Stale or duplicate revision: newer state wins, always.
    return { stored: false, draft: existing };
  }
  const draft: InvestorProfileDraftV2 = {
    kind: "draft",
    authId: args.authId,
    accountId: args.accountId,
    sessionId: args.sessionId,
    draftRevision: args.draftRevision,
    answers: args.answers,
    currentStepId: args.currentStepId,
    lastUpdatedAt: new Date().toISOString(),
    meta: makePrototypeMeta(args.correlationId),
  };
  await draftStore.put(key, draft);
  return { stored: true, draft };
}

export async function getProfileDraftV2(
  authId: string,
  accountId: string | null,
): Promise<InvestorProfileDraftV2 | null> {
  const scoped = await draftStore.get(draftKey(authId, accountId));
  if (scoped?.kind === "draft") return scoped;
  if (accountId !== null && scoped === null) {
    // One-way promotion view: an account with no draft of its own may resume
    // the preaccount draft; the next save lands account-scoped.
    const pre = await draftStore.get(draftKey(authId, null));
    if (pre?.kind === "draft") return pre;
  }
  return null;
}

/** Close the draft session (tombstone) in both the account and preaccount scopes. */
export async function clearProfileDraftV2(
  authId: string,
  accountId: string | null,
  sessionId: string,
  correlationId: string,
): Promise<void> {
  const tombstone: DraftTombstone = {
    kind: "closed",
    authId,
    closedSessionId: sessionId,
    meta: makePrototypeMeta(correlationId),
  };
  await draftStore.put(draftKey(authId, accountId), tombstone);
  if (accountId !== null) {
    await draftStore.put(draftKey(authId, null), tombstone);
  }
}

/** Idempotent per (account, document, documentVersion, profileVersion). */
export async function appendAdvisoryConsentRecord(args: {
  accountId: string;
  record: AdvisoryConsentRecord;
  correlationId: string;
}): Promise<AdvisoryConsentRecordEntry> {
  const key = `${args.accountId}__${args.record.documentId}__${args.record.documentVersion}__v${String(args.record.profileVersion).padStart(6, "0")}`;
  const existing = await consentStore.get(key);
  if (existing) return existing;
  const entry: AdvisoryConsentRecordEntry = {
    ...args.record,
    accountId: args.accountId,
    meta: makePrototypeMeta(args.correlationId),
  };
  await consentStore.putIfAbsent(key, entry);
  return (await consentStore.get(key)) ?? entry;
}
