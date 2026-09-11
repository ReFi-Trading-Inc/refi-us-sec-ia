/**
 * Provider-neutral ReFi KYC evidence record (mandate §13).
 *
 * This is what ReFi RETAINS about a verification: provider decision and
 * references, ReFi's mapped state, component statuses and timestamps —
 * never raw applicant PII, never document images, never biometric data,
 * never raw provider payloads. It is the input to the compliance
 * attestation (a later slice) and to audit. The frontend lifecycle in
 * `provider.ts` remains the product-facing state; this record is the
 * evidence behind it.
 */
import type { KycLifecycleState } from "./provider";

export const KYC_EVIDENCE_SCHEMA_VERSION = "refi.kyc.evidence.v1" as const;

export const KYC_COMPONENT_STATUSES = [
  "not_evaluated",
  "pass",
  "fail",
  "review",
  "pending",
  "unknown",
] as const;
export type KycComponentStatus = (typeof KYC_COMPONENT_STATUSES)[number];

/** Provider vocabulary is normalised to this closed set before storage. */
export const KYC_PROVIDER_DECISIONS = ["accept", "reject", "review"] as const;
export type KycProviderDecision = (typeof KYC_PROVIDER_DECISIONS)[number];

export const KYC_DECISION_PROVENANCE = [
  /** Synchronous Evaluation API answer. */
  "provider_evaluation",
  /** Asynchronous provider webhook after step-up. */
  "provider_webhook",
  /** Internal ReFi compliance case (manual). Not produced by any adapter today. */
  "refi_manual_review",
  /** Deterministic mock — never evidence. */
  "mock",
] as const;
export type KycDecisionProvenance = (typeof KYC_DECISION_PROVENANCE)[number];

export interface KycEvidenceRecord {
  schemaVersion: typeof KYC_EVIDENCE_SCHEMA_VERSION;
  /** Adapter kind label (e.g. "socure", "mock"); never a claim of trust by itself. */
  provider: string;
  /** Provider evaluation id (e.g. `eval_id`). Opaque; safe to log. */
  providerEvaluationId: string | null;
  /** OUR customer-defined request id echoed by the provider (`id` / webhook `data.id`). */
  providerRequestId: string | null;
  /** Provider workflow name/version as configured (not a secret). */
  providerWorkflow: string | null;
  providerWorkflowVersion: string | null;
  /** Latest provider decision, normalised. */
  providerDecision: KycProviderDecision | null;
  /** Whether the latest decision is final (webhook / closed) or interim (paused for step-up). */
  providerDecisionFinal: boolean;
  /** ReFi-owned mapped lifecycle state. */
  refiState: KycLifecycleState;
  identityVerification: KycComponentStatus;
  fraud: KycComponentStatus;
  watchlist: KycComponentStatus;
  documentVerification: KycComponentStatus;
  liveness: KycComponentStatus;
  evaluationCreatedAt: string | null;
  completedAt: string | null;
  /** Safe, coarse reason (e.g. "docv_step_up"); never a raw risk tag or rule. */
  reviewReason: string | null;
  /** Provider reference ids (e.g. webhook event ids). Opaque. */
  providerReferenceIds: readonly string[];
  decisionProvenance: KycDecisionProvenance | null;
}

export function emptyEvidence(
  provider: string,
  refiState: KycLifecycleState,
): KycEvidenceRecord {
  return {
    schemaVersion: KYC_EVIDENCE_SCHEMA_VERSION,
    provider,
    providerEvaluationId: null,
    providerRequestId: null,
    providerWorkflow: null,
    providerWorkflowVersion: null,
    providerDecision: null,
    providerDecisionFinal: false,
    refiState,
    identityVerification: "not_evaluated",
    fraud: "not_evaluated",
    watchlist: "not_evaluated",
    documentVerification: "not_evaluated",
    liveness: "not_evaluated",
    evaluationCreatedAt: null,
    completedAt: null,
    reviewReason: null,
    providerReferenceIds: [],
    decisionProvenance: null,
  };
}

/** Keys that must never appear in an evidence record (PII / raw artifacts). */
export const KYC_EVIDENCE_FORBIDDEN_KEYS = [
  "given_name",
  "family_name",
  "date_of_birth",
  "national_id",
  "email",
  "phone_number",
  "address",
  "selfie",
  "document_image",
  "tags",
  "decision_tags",
  "reason_codes",
  "score",
  "notes",
  "di_session_token",
  "api_key",
] as const;

/**
 * Component statuses ReFi can honestly derive from an aggregate provider
 * decision. Providers that expose only the aggregate (the Socure guide does)
 * get the aggregate on identity/fraud/watchlist; document/liveness only once
 * a document step-up occurred.
 */
export function deriveComponentStatuses(args: {
  providerDecision: KycProviderDecision;
  final: boolean;
  docvOccurred: boolean;
}): Pick<
  KycEvidenceRecord,
  | "identityVerification"
  | "fraud"
  | "watchlist"
  | "documentVerification"
  | "liveness"
> {
  const aggregate: KycComponentStatus = args.final
    ? args.providerDecision === "accept"
      ? "pass"
      : args.providerDecision === "reject"
        ? "fail"
        : "review"
    : args.providerDecision === "review"
      ? "review"
      : "pending";
  const docv: KycComponentStatus = args.docvOccurred
    ? args.final
      ? aggregate
      : "pending"
    : "not_evaluated";
  return {
    identityVerification: aggregate,
    fraud: aggregate,
    watchlist: aggregate,
    documentVerification: docv,
    liveness: docv,
  };
}
