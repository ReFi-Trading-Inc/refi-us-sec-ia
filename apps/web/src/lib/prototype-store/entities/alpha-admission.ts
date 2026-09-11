/**
 * Alpha admission record — the authoritative ReFi product admission state
 * with its audit history (why, when, under which rule version, from which
 * evidence). Provenance is AUTOMATIC for the versioned rule; MANUAL is
 * reserved for the exception path (not produced by any code path today).
 *
 * Idempotent: an evaluation that does not change the state appends no
 * history and returns `transitioned: false`; two workers processing the same
 * final decision produce exactly one transition (read-check-write guarded by
 * state; the durable backing's atomicity is the store's — a Firestore
 * transaction is a follow-up once the durable backing is provisioned).
 *
 * Never PII, never provider secrets, never scores: references only.
 */
import { resolveKvStore } from "../../store";
import { makePrototypeMeta, type PrototypeMeta } from "../store";
import type {
  AlphaAdmissionOutcome,
  AlphaAdmissionPrerequisites,
} from "../../compliance/alpha-admission";

export const ALPHA_ADMISSION_STATES = [
  "pending",
  "admitted",
  "not_admitted",
  "hold",
] as const;
export type AlphaAdmissionState = (typeof ALPHA_ADMISSION_STATES)[number];

export interface AlphaAdmissionEvent {
  at: string;
  state: AlphaAdmissionState;
  ruleVersion: string;
  provenance: "AUTOMATIC" | "MANUAL";
  reason: string;
  trigger: string;
  correlationId: string;
  missing?: readonly string[];
}

export interface AlphaAdmissionRecord {
  authId: string;
  accountId: string | null;
  state: AlphaAdmissionState;
  ruleVersion: string;
  provenance: "AUTOMATIC" | "MANUAL";
  reason: string;
  evaluatedAt: string;
  admittedAt: string | null;
  /** Evidence references at the last evaluation (opaque ids only). */
  evidence: {
    onboardingState: string | null;
    eligibilityDecisionId: string | null;
    profileVersion: number;
    consentReceiptIds: readonly string[];
    kycEvidenceRef: string | null;
    providerEvaluationId: string | null;
  };
  history: AlphaAdmissionEvent[];
  meta: PrototypeMeta;
}

const store = () =>
  resolveKvStore<AlphaAdmissionRecord>("alpha-admission", "alpha-admissions");
const HISTORY_LIMIT = 64;

export async function getAlphaAdmission(
  authId: string,
): Promise<AlphaAdmissionRecord | null> {
  return store().get(authId);
}

export async function recordAdmissionEvaluation(args: {
  authId: string;
  accountId: string | null;
  outcome: AlphaAdmissionOutcome;
  prerequisites: AlphaAdmissionPrerequisites;
  ruleVersion: string;
  correlationId: string;
  trigger: string;
}): Promise<{ record: AlphaAdmissionRecord; transitioned: boolean }> {
  const at = new Date().toISOString();
  const { outcome, prerequisites: p } = args;
  const reason =
    outcome.state === "pending"
      ? `MISSING:${outcome.missing.join(",")}`
      : outcome.reason;
  const current = await store().get(args.authId);
  // Admission is durable once reached from a final trusted ACCEPT: an
  // unrelated later gap (e.g. a provider error) never silently revokes it.
  if (current?.state === "admitted" && outcome.state !== "hold") {
    return { record: current, transitioned: false };
  }
  const unchanged =
    current !== null &&
    current.state === outcome.state &&
    current.reason === reason &&
    current.evidence.providerEvaluationId === p.kyc.providerEvaluationId;
  if (current && unchanged) {
    return { record: current, transitioned: false };
  }
  const event: AlphaAdmissionEvent = {
    at,
    state: outcome.state,
    ruleVersion: args.ruleVersion,
    provenance: "AUTOMATIC",
    reason,
    trigger: args.trigger,
    correlationId: args.correlationId,
    ...(outcome.state === "pending" ? { missing: outcome.missing } : {}),
  };
  const next: AlphaAdmissionRecord = {
    authId: args.authId,
    accountId: args.accountId,
    state: outcome.state,
    ruleVersion: args.ruleVersion,
    provenance: "AUTOMATIC",
    reason,
    evaluatedAt: at,
    admittedAt:
      outcome.state === "admitted"
        ? (current?.admittedAt ?? at)
        : (current?.admittedAt ?? null),
    evidence: {
      onboardingState: p.cohort.onboardingState,
      eligibilityDecisionId: p.eligibility.decisionId,
      profileVersion: p.profile.version,
      consentReceiptIds: p.consents.receiptIds,
      kycEvidenceRef: p.kyc.evidenceRef,
      providerEvaluationId: p.kyc.providerEvaluationId,
    },
    history: [...(current?.history ?? []), event].slice(-HISTORY_LIMIT),
    meta: makePrototypeMeta(args.correlationId),
  };
  await store().put(args.authId, next);
  return { record: next, transitioned: true };
}

/** TEST ONLY. */
export async function resetAlphaAdmissionForTests(
  authId: string,
): Promise<void> {
  await store().delete(authId);
}
