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

/** FNV-1a 64-bit hex over the canonically-ordered answers JSON. */
export function answersSnapshotHash(answers: InvestorProfileAnswers): string {
  const ordered = JSON.stringify(
    Object.fromEntries(
      Object.entries(answers as unknown as Record<string, unknown>).sort(
        ([a], [b]) => a.localeCompare(b),
      ),
    ),
  );
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

// ── Mutable questionnaire draft (per auth identity) ─────────────────────────
//
// Autosave/resume state for the in-progress questionnaire (review of PR #65:
// sensitive banded answers must NOT persist in browser storage — OWASP HTML5
// guidance; the server draft is authenticated and account-isolated by key).
// Drafts are MUTABLE working state, never part of the immutable version
// chain; submission promotes them via appendProfileAnswers.

export interface InvestorProfileDraftV2 {
  authId: string;
  answers: InvestorProfileAnswers;
  stepIndex: number;
  lastUpdatedAt: string;
  meta: PrototypeMeta;
}

const draftStore = kvStore<InvestorProfileDraftV2>(
  "investor-profile-drafts-v2",
);

export async function saveProfileDraftV2(args: {
  authId: string;
  answers: InvestorProfileAnswers;
  stepIndex: number;
  correlationId: string;
}): Promise<InvestorProfileDraftV2> {
  const draft: InvestorProfileDraftV2 = {
    authId: args.authId,
    answers: args.answers,
    stepIndex: args.stepIndex,
    lastUpdatedAt: new Date().toISOString(),
    meta: makePrototypeMeta(args.correlationId),
  };
  await draftStore.put(args.authId, draft);
  return draft;
}

export async function getProfileDraftV2(
  authId: string,
): Promise<InvestorProfileDraftV2 | null> {
  return draftStore.get(authId);
}

export async function clearProfileDraftV2(authId: string): Promise<void> {
  await draftStore.delete(authId);
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
