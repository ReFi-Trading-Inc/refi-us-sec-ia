/**
 * KYC evidence for the compliance attestation — the ONE runtime module that
 * may establish trusted production provenance (mandate §14; founder decision
 * 2026-09-10: ReFi owns KYC with a selected provider adapter).
 *
 * Rules:
 *   - mock adapter            → `source: "mock"` provenance (never trusted;
 *                               the mapping blocks with KYC_EVIDENCE_MOCK);
 *   - unconfigured            → null (KYC_EVIDENCE_MISSING);
 *   - production adapter with a FINAL provider decision whose provenance is
 *     the provider's own answer (`provider_evaluation` / `provider_webhook`)
 *                             → trusted evidence: `kyc.status` passed | failed,
 *                               `provider` = adapter label, `level` = provider
 *                               workflow, `evidence_ref` = opaque ReFi session ref;
 *   - production adapter, non-final (review / step-up / pending / provider
 *     error)                  → null: there is no evidence to attest yet
 *                               (never `pending` fabricated as passed).
 *
 * No raw provider payload, score, tag or PII ever enters the attestation.
 */
import type { KycEvidenceRecord } from "./evidence";
import {
  establishTrustedKycProvenance,
  mockKycProvenance,
  type KycEvidenceProvenance,
  type TrustedKycEvidence,
} from "./provenance";
import type { KycProviderAdapter, KycSubject } from "./provider";

export type AttestationKycEvidence =
  KycEvidenceProvenance | TrustedKycEvidence | null;

export async function kycEvidenceForAttestation(
  provider: KycProviderAdapter,
  subject: KycSubject,
): Promise<AttestationKycEvidence> {
  if (provider.kind === "mock") {
    const session = await provider.getSession(subject);
    return mockKycProvenance(session, provider.kind);
  }
  if (!provider.evidenceRecord) return null;
  const record = await provider.evidenceRecord(subject);
  if (!record) return null;
  return trustedEvidenceFromRecord(provider.kind, record);
}

/** Pure: a final provider decision → trusted evidence; anything else → null. */
export function trustedEvidenceFromRecord(
  adapterKind: KycProviderAdapter["kind"],
  record: KycEvidenceRecord,
): TrustedKycEvidence | null {
  const finalFromProvider =
    record.providerDecisionFinal &&
    (record.decisionProvenance === "provider_evaluation" ||
      record.decisionProvenance === "provider_webhook") &&
    (record.refiState === "passed" || record.refiState === "failed") &&
    record.providerEvaluationId !== null;
  const referenceId = record.referenceId;
  if (!finalFromProvider || referenceId === null) return null;
  const adapterId = `${adapterKind}-kyc-adapter`;
  const evidenceRef = `kyc-session:${referenceId}`;
  return establishTrustedKycProvenance({
    adapterId,
    evidenceRef,
    normalized: {
      status: record.refiState === "passed" ? "passed" : "failed",
      provider: adapterId,
      level: (record.providerWorkflow ?? "unknown-workflow").slice(0, 128),
      evidence_ref: evidenceRef,
    },
  });
}
