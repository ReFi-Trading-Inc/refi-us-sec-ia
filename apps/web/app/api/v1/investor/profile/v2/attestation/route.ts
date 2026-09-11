/**
 * GET  /api/v1/investor/profile/v2/attestation — the frontend's durable
 *      submission records for this account (state + history per decision).
 * POST /api/v1/investor/profile/v2/attestation — submit the LATEST
 *      questionnaire-v2 decision as a ComplianceProfileAttestation through
 *      the frozen v1.1.0-alpha.2 client (Daniel step 6).
 *
 * The chain and its recorded states live in
 * `lib/compliance/attestation-submission.ts`: disclosure delivered → consent
 * accepted → attestation constructed → submitted → backend acknowledgment.
 * Only the backend's 201 is evidence. The body carries no answers and no
 * KYC values: every input is read from server state under the session's
 * account scope, and the KYC block comes from the provider boundary with
 * its provenance — today a clearly-labelled MOCK (never evidence), so on
 * every current tier the chain stops at `blocked` naming KYC_EVIDENCE_MOCK
 * (or KYC_EVIDENCE_MISSING with no provider). Genuine KYC stays blocked
 * until a real provider boundary exists; nothing here substitutes for it.
 */
import { bffMutate, bffRead } from "../../../../../../../src/lib/bff/handler";
import {
  ContractVersionMismatchError,
  InvestorApiTransportError,
} from "@refi/api-clients/investor-api";
import {
  GoogleCredentialUnavailableError,
  investorApiClientFor,
  SessionAssertionInputError,
  UpstreamNotConfiguredError,
} from "../../../../../../../src/lib/investor-api/gateway";
import {
  AccountScopeError,
  resolveAccountScope,
} from "../../../../../../../src/lib/investor-api/account-scope";
import {
  getKycProvider,
  kycEvidenceForAttestation,
  KycProviderUnavailableError,
  type KycEvidenceProvenance,
  type TrustedKycEvidence,
} from "../../../../../../../src/lib/kyc";
import { ASSESSMENT_POLICY_VERSION } from "../../../../../../../src/lib/sec203a/investor-profile-engine";
import {
  answersSnapshotHash,
  getProfileAnswers,
  getProfileAssessment,
  latestProfileVersion,
} from "../../../../../../../src/lib/prototype-store/entities/investor-profile-v2";
import { listAttestationSubmissions } from "../../../../../../../src/lib/prototype-store/entities/attestation-submission";
import { submitComplianceProfileAttestation } from "../../../../../../../src/lib/compliance/attestation-submission";
import { CONTRACT_VERSION } from "../../../../../../../src/lib/investor-api/upstream-state";
import type { AttestationEvidenceInput } from "../../../../../../../src/lib/compliance/attestation-mapping";

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!ctx.auth?.accountId) return { submissions: [] };
    return {
      submissions: await listAttestationSubmissions(ctx.auth.accountId),
    };
  },
});

async function kycEvidenceFor(
  authId: string,
): Promise<KycEvidenceProvenance | TrustedKycEvidence | null> {
  try {
    const provider = getKycProvider();
    // Provenance travels with the values: mock → refused by the mapping;
    // a final decision from the production adapter → trusted evidence;
    // anything non-final → null (nothing to attest yet).
    return await kycEvidenceForAttestation(provider, { authId });
  } catch (err) {
    if (err instanceof KycProviderUnavailableError) return null;
    throw err;
  }
}

export const POST = bffMutate<undefined>({
  action: "submitComplianceAttestation",
  source: "backend",
  apply: async (ctx) => {
    let client;
    let accountId: string;
    try {
      client = investorApiClientFor(ctx.auth);
      accountId =
        ctx.auth.accountId ?? (await resolveAccountScope(client, ctx.auth));
    } catch (err) {
      if (err instanceof AccountScopeError) {
        return {
          data: { ok: false, reason: "account_not_linked", detail: err.reason },
          outcome: "blocked" as const,
          reasonCode: "account_not_linked",
          status: 412,
        };
      }
      return unavailable(err);
    }

    const version = await latestProfileVersion(accountId);
    const answers =
      version > 0 ? await getProfileAnswers(accountId, version) : null;
    const assessment = answers
      ? await getProfileAssessment(
          accountId,
          version,
          ASSESSMENT_POLICY_VERSION,
        )
      : null;
    if (!answers || !assessment) {
      return {
        data: { ok: false, reason: "profile_not_assessed" },
        outcome: "blocked" as const,
        reasonCode: "profile_not_assessed",
        status: 412,
      };
    }
    const evidence: AttestationEvidenceInput = {
      accountId,
      answersVersion: {
        profileVersion: answers.profileVersion,
        answers: answers.answers,
        answerSnapshotHash: answers.answerSnapshotHash,
      },
      assessment: assessment.assessment,
      kyc: await kycEvidenceFor(ctx.auth.authId),
      recomputeAnswerSnapshotHash: answersSnapshotHash,
    };

    let outcome;
    try {
      outcome = await submitComplianceProfileAttestation(client, {
        accountId,
        evidence,
        correlationId: ctx.correlationId,
      });
    } catch (err) {
      return unavailable(err);
    }

    switch (outcome.kind) {
      case "acknowledged":
        return {
          data: {
            ok: true,
            state: outcome.record.state,
            // The backend's canonical status travels with the result; an
            // HTTP 201 is never presented as "accepted" on its own.
            backendStatus: outcome.backendStatus,
            latestForAccount: outcome.latestForAccount,
            attestation: outcome.attestation,
            upstreamStatus: outcome.upstreamStatus,
            contractVersion: CONTRACT_VERSION,
          },
          references: [
            `attestation:${outcome.attestation.attestation_id}`,
            `evidence-sha256:${outcome.record.evidenceSha256 ?? ""}`,
          ],
          status: 201,
        };
      case "already_acknowledged":
        return {
          data: {
            ok: true,
            state: outcome.record.state,
            backendAttestationId: outcome.record.backendAttestationId ?? null,
            acknowledgedAt: outcome.record.acknowledgedAt ?? null,
          },
          references: [`attestation:${outcome.record.attestationId}`],
          status: 200,
        };
      case "terminal":
        return {
          data: {
            ok: false,
            reason: "attestation_record_terminal",
            state: outcome.record.state,
            history: outcome.record.history,
          },
          outcome: "blocked" as const,
          reasonCode: "attestation_record_terminal",
          references: [`attestation:${outcome.record.attestationId}`],
          status: 412,
        };
      case "consent_required":
        return {
          data: {
            ok: false,
            reason: "consent_required",
            state: outcome.record.state,
            missing: outcome.missing,
          },
          outcome: "blocked" as const,
          reasonCode: "consent_required",
          references: [`attestation:${outcome.record.attestationId}`],
          status: 412,
        };
      case "blocked":
        return {
          data: {
            ok: false,
            reason: "attestation_blocked",
            state: outcome.record.state,
            blocked: outcome.reasons,
          },
          outcome: "blocked" as const,
          reasonCode: outcome.reasons[0] ?? "attestation_blocked",
          references: [`attestation:${outcome.record.attestationId}`],
          status: 412,
        };
      case "retryable":
        return {
          data: {
            ok: false,
            reason: "attestation_retryable",
            state: outcome.record.state,
            cause: outcome.cause,
            upstreamStatus: outcome.status,
            code: outcome.code,
            retryAfterSeconds: outcome.retryAfterSeconds,
          },
          outcome: "blocked" as const,
          reasonCode: outcome.code?.toLowerCase() ?? "upstream_ambiguous",
          references: [`attestation:${outcome.record.attestationId}`],
          status: outcome.status === 429 ? 429 : 503,
        };
      case "rejected":
        return {
          data: {
            ok: false,
            reason: "attestation_rejected",
            state: outcome.record.state,
            upstreamStatus: outcome.status,
            code: outcome.code,
            upstreamCorrelationId: outcome.correlationId,
            retryAfterSeconds: outcome.retryAfterSeconds,
          },
          outcome: "rejected" as const,
          reasonCode: outcome.code,
          references: [`attestation:${outcome.record.attestationId}`],
          status: outcome.status,
        };
      case "upstream_error":
        return {
          data: {
            ok: false,
            reason: "upstream_error",
            upstreamStatus: outcome.status,
            code: outcome.code,
            upstreamCorrelationId: outcome.correlationId,
            retryAfterSeconds: outcome.retryAfterSeconds,
          },
          outcome: "blocked" as const,
          reasonCode: outcome.code,
          status: outcome.status,
        };
    }
  },
});

function unavailable(err: unknown) {
  if (err instanceof ContractVersionMismatchError) {
    return {
      data: {
        ok: false,
        reason: "upstream_contract_mismatch",
        schema: err.schema,
      },
      outcome: "blocked" as const,
      reasonCode: "upstream_contract_mismatch",
      status: 502,
    };
  }
  if (
    err instanceof UpstreamNotConfiguredError ||
    err instanceof GoogleCredentialUnavailableError ||
    err instanceof SessionAssertionInputError ||
    err instanceof InvestorApiTransportError
  ) {
    return {
      data: {
        ok: false,
        reason: "upstream_unavailable",
        detail: err.name,
      },
      outcome: "blocked" as const,
      reasonCode: "upstream_unavailable",
      status: 503,
    };
  }
  throw err;
}
