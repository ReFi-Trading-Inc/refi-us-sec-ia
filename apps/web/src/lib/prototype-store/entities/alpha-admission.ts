/**
 * Alpha admission record — the authoritative ReFi product admission state
 * with its audit history (why, when, under which rule version, from which
 * evidence). Provenance is AUTOMATIC for the versioned rule; MANUAL is
 * reserved for the exception path (not produced by any code path today).
 *
 * Idempotent and ATOMIC: the transition decision runs inside the store's
 * transactional `update` (Firestore transaction on the durable backing; an
 * exclusive per-key lock on the prototype backing), so two workers, two
 * instances or a restart processing the same final decision produce exactly
 * one transition and one history entry; the loser observes the winner's
 * record.
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
    /** The positive cohort signal that satisfied the gate (null = not satisfied). */
    cohortSignal: string | null;
    eligibilityDecisionId: string | null;
    profileVersion: number;
    consentReceiptIds: readonly string[];
    kycEvidenceRef: string | null;
    providerEvaluationId: string | null;
    complianceHold: string | null;
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
  // ATOMIC: the decision runs inside the store's transactional update, so two
  // evaluators (workers, instances, or a restart) apply exactly one
  // transition; the loser observes the winner's record.
  const result = await store().update(args.authId, (current) => {
    // Admission is durable once reached from a final trusted ACCEPT: an
    // unrelated later gap never silently revokes it (a hold still surfaces).
    if (current?.state === "admitted" && outcome.state !== "hold") return null;
    const unchanged =
      current !== null &&
      current.state === outcome.state &&
      current.reason === reason &&
      current.ruleVersion === args.ruleVersion &&
      current.evidence.providerEvaluationId === p.kyc.providerEvaluationId;
    if (unchanged) return null;
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
        cohortSignal: p.cohort.signal,
        eligibilityDecisionId: p.eligibility.decisionId,
        profileVersion: p.profile.version,
        consentReceiptIds: p.consents.receiptIds,
        kycEvidenceRef: p.kyc.evidenceRef,
        providerEvaluationId: p.kyc.providerEvaluationId,
        complianceHold: p.complianceHold.active
          ? (p.complianceHold.reason ?? "HOLD")
          : null,
      },
      history: [...(current?.history ?? []), event].slice(-HISTORY_LIMIT),
      meta: makePrototypeMeta(args.correlationId),
    };
    return next;
  });
  if (result.value === null) {
    throw new Error("alpha admission: transactional update returned no record");
  }
  return { record: result.value, transitioned: result.written };
}

/** TEST ONLY. */
export async function resetAlphaAdmissionForTests(
  authId: string,
): Promise<void> {
  await store().delete(authId);
}
