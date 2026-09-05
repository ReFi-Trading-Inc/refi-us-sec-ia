/**
 * Investor Profile v2 → `ComplianceProfileAttestationRequest` mapping.
 *
 * PURE, server-side (node:crypto) and side-effect free. It BUILDS the request
 * body that a LATER slice would hand to `createComplianceProfileAttestation`;
 * it never calls the Investor API, never persists, never decides policy. Every
 * field is pinned to an already-approved authority — the evidence ledger is in
 * docs/releases/2026-09-signal/c1b2-browser-direct-reclassification.md
 * ("Attestation field decision ledger"). Where authority does not fully
 * determine a value the builder FAILS CLOSED and names the block.
 *
 * Authority pinned here (do not re-decide silently):
 *  - Contract: packages/api-clients/contracts/investor-api/v1.1.0-alpha.2
 *    (`schemas.json` $defs.ComplianceProfileAttestationRequest — closed
 *    schema, `schema_version` const "1.0", enum vocabularies, id pattern,
 *    sha256 pattern, `expires_at` date-time|null).
 *  - Daniel's alignment checklist: `decision_version` = frontend policy
 *    version; `risk_band` = frontend-defined versioned band; `evidence_ref` =
 *    opaque frontend reference; `profile_version` (legacy projection) maps to
 *    `decision_sequence`; backend never rescores the questionnaire; an equal
 *    `decision_sequence` for the same account is a conflict.
 *  - Investor Profile spec §4.4 (product-fit meanings), §10/§21 (alpha
 *    capacity is informational — never execution authority; execution stays
 *    behind D-LAUNCH-06), §12.1 (persist policy version, profile version,
 *    snapshot hash, timestamp), §15/§20 #6 (refresh frequency is a counsel
 *    decision — no expiry is asserted until it is made).
 *  - KYC decision (2026-09-04): the mock adapter is never identity
 *    verification; its `passed` must never become backend compliance evidence.
 *    Production TRUST is a separate server-side provenance concern
 *    (`../kyc/provenance`): a provider label is metadata, never proof.
 */
import { createHash } from "node:crypto";
import type { components } from "@refi/api-clients/generated/investor-api.gen";
import { stableSerialize } from "../sec203a/canonical-json";
import { ASSESSMENT_POLICY_VERSION } from "../sec203a/investor-profile-engine";
import {
  RISK_BAND_LABELS,
  type InvestorProfileAnswers,
  type InvestorProfileAssessment,
  type RiskBand,
} from "../sec203a/investor-profile";
import type { AttestationKyc } from "../kyc/provider";
import {
  isTrustedKycEvidence,
  type KycEvidenceProvenance,
  type TrustedKycEvidence,
} from "../kyc/provenance";

export type ComplianceProfileAttestationRequest =
  components["schemas"]["ComplianceProfileAttestationRequest"];
export type InvestorProfileAttestationStatus =
  ComplianceProfileAttestationRequest["investor_profile"]["status"];
export type TradingEligibility =
  ComplianceProfileAttestationRequest["trading_eligibility"];

/**
 * Version of THIS mapping. It is part of the hashed evidence document so a
 * later mapping change can never be mistaken for the same decision. It is NOT
 * `decision_version` — that is the assessment policy version (checklist:
 * "frontend_policy_version").
 */
export const ATTESTATION_MAPPING_VERSION = "attestation-mapping-v1";

/** Contract constant (`schema_version` const "1.0"). */
export const ATTESTATION_SCHEMA_VERSION: ComplianceProfileAttestationRequest["schema_version"] =
  "1.0";

/** The only questionnaire version this mapping knows how to attest. */
export const SUPPORTED_QUESTIONNAIRE_VERSION = 2 as const;

/**
 * `trading_eligibility` values this mapping can EVER emit. `eligible` is
 * deliberately not representable: execution authority is behind D-LAUNCH-06
 * and the Managed gates (spec §10, §21 slice 4; Ship Contract Signal
 * no-execution boundary). A future change here is a D-LAUNCH-06 decision,
 * not an implementation detail.
 */
export type EmittableTradingEligibility = Exclude<
  TradingEligibility,
  "eligible"
>;

/**
 * `investor_profile.status` values this mapping emits. `expired` and
 * `withdrawn` are later-lifecycle concepts with no frontend source today.
 */
export type EmittableInvestorProfileStatus = Exclude<
  InvestorProfileAttestationStatus,
  "expired" | "withdrawn"
>;

export const ATTESTATION_BLOCK_REASONS = [
  // D — provider-blocked (KYC decision 2026-09-04; no real provider selected)
  "KYC_EVIDENCE_MISSING",
  "KYC_EVIDENCE_MOCK",
  "KYC_PROVENANCE_UNTRUSTED",
  // Fail-closed integrity checks on the frontend's own records
  "ASSESSMENT_POLICY_VERSION_MISMATCH",
  "ANSWER_SNAPSHOT_HASH_MISMATCH",
  "QUESTIONNAIRE_VERSION_UNSUPPORTED",
  "PROFILE_VERSION_INVALID",
  "EFFECTIVE_AT_INVALID",
  "ACCOUNT_ID_MISSING",
] as const;
export type AttestationBlockReason = (typeof ATTESTATION_BLOCK_REASONS)[number];

export interface AttestationEvidenceInput {
  /** Backend account id the attestation will be written under. */
  accountId: string;
  /** The immutable v2 answers version (prototype-store record fields). */
  answersVersion: {
    profileVersion: number;
    answers: InvestorProfileAnswers;
    answerSnapshotHash: string;
  };
  /** The persisted deterministic assessment for that version. */
  assessment: InvestorProfileAssessment;
  /**
   * KYC evidence WITH provenance. `null` when no provider is configured. The
   * normalized wire block inside it is data; trust is established only by a
   * `TrustedKycEvidence` produced by the (future) production-provider
   * boundary — see `../kyc/provenance`. Mock provenance and any structurally
   * similar object are refused.
   */
  kyc: KycEvidenceProvenance | TrustedKycEvidence | null;
  /**
   * Recomputes the answers snapshot hash so a tampered or mismatched record
   * can never be attested. Injected (not imported) so this module stays free
   * of prototype-store side effects.
   */
  recomputeAnswerSnapshotHash: (answers: InvestorProfileAnswers) => string;
}

export interface AttestationEvidenceDocument {
  mapping_version: typeof ATTESTATION_MAPPING_VERSION;
  account_id: string;
  decision_version: string;
  decision_sequence: number;
  questionnaire_version: number;
  answer_snapshot_hash: string;
  answers: InvestorProfileAnswers;
  assessment: InvestorProfileAssessment;
  kyc: AttestationKyc;
}

export type BuildAttestationResult =
  | {
      ok: true;
      request: ComplianceProfileAttestationRequest;
      /** Canonical evidence bytes whose SHA-256 is `request.evidence_sha256`. */
      evidenceCanonical: string;
      evidence: AttestationEvidenceDocument;
    }
  | { ok: false; blocked: AttestationBlockReason[] };

// ─── Field derivations (each pinned to one authority) ───────────────────────

/**
 * Production trust is NOT inferred from any string. The only accepted proof is
 * a `TrustedKycEvidence` carrying the module-private marker set by
 * `establishTrustedKycProvenance` (KYC decision 2026-09-04: no real provider
 * exists, the mock is never evidence). Returns the block reason, or null when
 * the evidence may be attested.
 */
export function kycEvidenceBlock(
  kyc: KycEvidenceProvenance | TrustedKycEvidence | null,
): Extract<
  AttestationBlockReason,
  "KYC_EVIDENCE_MISSING" | "KYC_EVIDENCE_MOCK" | "KYC_PROVENANCE_UNTRUSTED"
> | null {
  if (kyc === null) return "KYC_EVIDENCE_MISSING";
  if (kyc.source === "mock") return "KYC_EVIDENCE_MOCK";
  if (!isTrustedKycEvidence(kyc)) return "KYC_PROVENANCE_UNTRUSTED";
  return null;
}

/**
 * Spec §4.4 + engine rule "permittedRiskBand is null when no personalized band
 * may be produced" (spec §1 rule 1):
 *   not_fit                         → ineligible ("should not be recommended")
 *   permitted band produced         → eligible   (fit / fit_with_constraint)
 *   otherwise (needs_clarification, essentials missing, unresolved) → pending
 * Unresolved consistency flags never reach persistence (v2 route 409), so a
 * persisted assessment with a band is by construction reconciled.
 */
export function deriveInvestorProfileStatus(
  assessment: InvestorProfileAssessment,
): EmittableInvestorProfileStatus {
  if (assessment.productFitStatus === "not_fit") return "ineligible";
  if (assessment.permittedRiskBand !== null) return "eligible";
  return "pending";
}

/** No personalized band: the contract requires a non-empty string. */
export const RISK_BAND_NOT_PERSONALIZED = "not_personalized";

/**
 * Frontend-defined versioned band (checklist: "frontend_defined_versioned_band").
 * `profile-policy-v1:band-3:balanced`. Daniel's legacy AdvisoryProfile
 * projection recognises only CONSERVATIVE/MODERATE/GROWTH/AGGRESSIVE and shows
 * anything else as UNAVAILABLE — that projection is compatibility-only and the
 * v2 five-band vocabulary is deliberately not collapsed into it.
 */
export function deriveRiskBandLabel(
  assessment: InvestorProfileAssessment,
): string {
  const band = assessment.permittedRiskBand;
  if (band === null) return RISK_BAND_NOT_PERSONALIZED;
  return `${assessment.assessmentPolicyVersion}:band-${String(band)}:${riskBandSlug(band)}`;
}

function riskBandSlug(band: RiskBand): string {
  return RISK_BAND_LABELS[band].toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/**
 * Never `eligible` (see EmittableTradingEligibility). A profile that is
 * `ineligible` for the product is ineligible for trading it; everything else
 * is `pending` behind D-LAUNCH-06.
 */
export function deriveTradingEligibility(
  profileStatus: EmittableInvestorProfileStatus,
): EmittableTradingEligibility {
  return profileStatus === "ineligible" ? "ineligible" : "pending";
}

/**
 * Opaque, deterministic id (pattern `^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$`).
 * Derived from (account, decision_version, decision_sequence) so a retried
 * build of the same decision produces the same id — the backend treats a
 * repeated `attestation_id` with the same fingerprint as an idempotent replay.
 */
export function deriveAttestationId(
  accountId: string,
  decisionVersion: string,
  decisionSequence: number,
): string {
  const digest = createHash("sha256")
    .update(
      stableSerialize({
        account_id: accountId,
        decision_sequence: decisionSequence,
        decision_version: decisionVersion,
      }),
    )
    .digest("hex");
  return `att_${digest.slice(0, 32)}`;
}

export function sha256Hex(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function isRfc3339WithZone(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

// ─── Builder ────────────────────────────────────────────────────────────────

/**
 * Build the request body or fail closed. Deterministic: identical input →
 * byte-identical canonical evidence, identical `evidence_sha256`, identical
 * `attestation_id`. Submits nothing.
 */
export function buildComplianceProfileAttestationRequest(
  input: AttestationEvidenceInput,
): BuildAttestationResult {
  const blocked: AttestationBlockReason[] = [];
  const { accountId, answersVersion, assessment, kyc } = input;

  if (typeof accountId !== "string" || accountId.trim().length === 0) {
    blocked.push("ACCOUNT_ID_MISSING");
  }
  const kycBlock = kycEvidenceBlock(kyc);
  if (kycBlock !== null) blocked.push(kycBlock);
  if (assessment.assessmentPolicyVersion !== ASSESSMENT_POLICY_VERSION) {
    blocked.push("ASSESSMENT_POLICY_VERSION_MISMATCH");
  }
  // Widened on purpose: the persisted record is data, not a trusted literal.
  const questionnaireVersion: number =
    answersVersion.answers.questionnaireVersion;
  if (questionnaireVersion !== SUPPORTED_QUESTIONNAIRE_VERSION) {
    blocked.push("QUESTIONNAIRE_VERSION_UNSUPPORTED");
  }
  if (
    input.recomputeAnswerSnapshotHash(answersVersion.answers) !==
    answersVersion.answerSnapshotHash
  ) {
    blocked.push("ANSWER_SNAPSHOT_HASH_MISMATCH");
  }
  if (
    !Number.isInteger(answersVersion.profileVersion) ||
    answersVersion.profileVersion < 1
  ) {
    blocked.push("PROFILE_VERSION_INVALID");
  }
  if (!isRfc3339WithZone(assessment.assessedAt)) {
    blocked.push("EFFECTIVE_AT_INVALID");
  }
  if (blocked.length > 0 || !isTrustedKycEvidence(kyc)) {
    return { ok: false, blocked };
  }

  const decisionVersion = assessment.assessmentPolicyVersion;
  const decisionSequence = answersVersion.profileVersion;
  const profileStatus = deriveInvestorProfileStatus(assessment);

  const evidence: AttestationEvidenceDocument = {
    mapping_version: ATTESTATION_MAPPING_VERSION,
    account_id: accountId,
    decision_version: decisionVersion,
    decision_sequence: decisionSequence,
    questionnaire_version: answersVersion.answers.questionnaireVersion,
    answer_snapshot_hash: answersVersion.answerSnapshotHash,
    answers: answersVersion.answers,
    assessment,
    kyc: kyc.normalized,
  };
  const evidenceCanonical = stableSerialize(evidence);

  const request: ComplianceProfileAttestationRequest = {
    attestation_id: deriveAttestationId(
      accountId,
      decisionVersion,
      decisionSequence,
    ),
    schema_version: ATTESTATION_SCHEMA_VERSION,
    decision_version: decisionVersion,
    decision_sequence: decisionSequence,
    kyc: kyc.normalized,
    investor_profile: {
      status: profileStatus,
      profile_version: String(decisionSequence),
      questionnaire_version: String(
        answersVersion.answers.questionnaireVersion,
      ),
      risk_band: deriveRiskBandLabel(assessment),
    },
    trading_eligibility: deriveTradingEligibility(profileStatus),
    effective_at: assessment.assessedAt,
    // Refresh frequency / expiry is counsel register §20 #6 — undecided. The
    // contract permits null; Daniel's legacy AdvisoryProfile projection will
    // not represent an attestation without an expiry (documented in the ledger).
    expires_at: null,
    evidence_sha256: sha256Hex(evidenceCanonical),
  };

  return { ok: true, request, evidenceCanonical, evidence };
}
