/**
 * Attestation submission through the frozen v1.1.0-alpha.2 client
 * (`createComplianceProfileAttestation`; Daniel step 6; mandate: distinct
 * states, backend acknowledgment is the only evidence).
 *
 * Chain (each step is a recorded state, see the entity module):
 *   1. disclosure delivered   — listEffectiveDisclosures answers (backend fact)
 *   2. consent accepted       — listConsents shows an ACTIVE receipt whose
 *                               key/version/hash match EVERY effective
 *                               disclosure; otherwise stop: consent_required
 *   3. attestation constructed — buildComplianceProfileAttestationRequest
 *                               (pure, pinned authority); a block stops here
 *                               and names the reasons — in the connected env
 *                               today that is KYC_EVIDENCE_MISSING/_MOCK,
 *                               because no genuine KYC provider exists and
 *                               the mock is never evidence (2026-09-04)
 *   4. submitted              — recorded BEFORE the call with the
 *                               deterministic Idempotency-Key
 *   5. acknowledged           — 201 from the backend; anything else is
 *                               `rejected` with the contract code and is
 *                               never relabelled
 *
 * Nothing here retries a mutation, invents a field, or copies the backend's
 * authorization projection into frontend state.
 */
import { createHash } from "node:crypto";
import {
  InvestorApiError,
  type OperationResponse,
} from "@refi/api-clients/investor-api";
import type { InvestorApiReadClient } from "../investor-api/demo-client";
import {
  listEffectiveDisclosures,
  type EffectiveDisclosure,
} from "../investor-api/disclosure-consent";
import {
  collectPages,
  CONTRACT_MAX_PAGE_SIZE,
} from "../investor-api/pagination";
import {
  advanceAttestationSubmission,
  openAttestationSubmission,
  type AttestationSubmissionRecord,
} from "../prototype-store/entities/attestation-submission";
import {
  buildComplianceProfileAttestationRequest,
  deriveAttestationId,
  type AttestationBlockReason,
  type AttestationEvidenceInput,
  type ComplianceProfileAttestationRequest,
} from "./attestation-mapping";

export type ConsentReceiptItem =
  OperationResponse<"listConsents">["data"]["items"][number];
export type ComplianceProfileAttestation =
  OperationResponse<"createComplianceProfileAttestation">["data"];

export type SubmitAttestationOutcome =
  | {
      kind: "acknowledged";
      record: AttestationSubmissionRecord;
      attestation: ComplianceProfileAttestation;
      upstreamStatus: number;
    }
  /** This decision already has backend evidence; nothing is re-sent. */
  | { kind: "already_acknowledged"; record: AttestationSubmissionRecord }
  /** The record is terminal (`blocked`/`rejected`); it never re-enters silently. */
  | { kind: "terminal"; record: AttestationSubmissionRecord }
  | {
      kind: "consent_required";
      record: AttestationSubmissionRecord;
      missing: Array<
        Pick<EffectiveDisclosure, "disclosure_key" | "disclosure_version">
      >;
    }
  | {
      kind: "blocked";
      record: AttestationSubmissionRecord;
      reasons: AttestationBlockReason[];
    }
  | {
      kind: "rejected";
      record: AttestationSubmissionRecord;
      status: number;
      code: string;
      correlationId: string | null;
      retryAfterSeconds: number | null;
    }
  | {
      kind: "upstream_error";
      status: number;
      code: string;
      correlationId: string | null;
      retryAfterSeconds: number | null;
    };

const MAX_PAGES = 4;

/** `Idempotency-Key` (8–128 chars): the decision's own identity, never random. */
export function attestationIdempotencyKey(
  request: Pick<
    ComplianceProfileAttestationRequest,
    "attestation_id" | "evidence_sha256"
  >,
): string {
  const digest = createHash("sha256")
    .update(`attestation:${request.attestation_id}:${request.evidence_sha256}`)
    .digest("hex");
  return `att-${digest.slice(0, 48)}`;
}

/** Effective disclosures with no ACTIVE ACCEPT receipt matching key/version/hash. */
export function missingConsents(
  effective: readonly EffectiveDisclosure[],
  receipts: readonly ConsentReceiptItem[],
): EffectiveDisclosure[] {
  return effective.filter(
    (d) =>
      d.status === "EFFECTIVE" &&
      !receipts.some(
        (r) =>
          r.status === "ACTIVE" &&
          r.disclosure_key === d.disclosure_key &&
          r.disclosure_version === d.disclosure_version &&
          r.disclosure_hash === d.content_hash,
      ),
  );
}

async function listActiveConsents(
  client: InvestorApiReadClient,
): Promise<ConsentReceiptItem[]> {
  const { items } = await collectPages(
    async (cursor) => {
      const res = await client.call("listConsents", {
        query: { page_size: CONTRACT_MAX_PAGE_SIZE, cursor },
      });
      return { items: res.data.data.items, page: res.data.data.page };
    },
    { maxPages: MAX_PAGES },
  );
  return items;
}

export async function submitComplianceProfileAttestation(
  client: InvestorApiReadClient,
  args: {
    accountId: string;
    evidence: AttestationEvidenceInput;
    correlationId: string;
  },
): Promise<SubmitAttestationOutcome> {
  const { accountId, correlationId } = args;
  // The attestation id is deterministic per decision, so the record can be
  // opened before the body exists and a retry continues the same record.
  const attestationId = deriveAttestationId(
    accountId,
    args.evidence.assessment.assessmentPolicyVersion,
    args.evidence.answersVersion.profileVersion,
  );

  // 1. disclosure delivered
  let effective: EffectiveDisclosure[];
  let receipts: ConsentReceiptItem[];
  try {
    effective = (await listEffectiveDisclosures(client)).items.filter(
      (d) => d.status === "EFFECTIVE",
    );
    receipts = await listActiveConsents(client);
  } catch (err) {
    if (err instanceof InvestorApiError) return upstream(err);
    throw err;
  }
  let record = await openAttestationSubmission({
    accountId,
    attestationId,
    correlationId,
    detail: {
      effective_disclosures: effective.map(
        (d) => `${d.disclosure_key}/v${String(d.disclosure_version)}`,
      ),
    },
  });
  if (record.state === "acknowledged") {
    // Already backend evidence; nothing to redo, nothing to relabel.
    return { kind: "already_acknowledged", record };
  }
  if (record.state === "rejected") return { kind: "terminal", record };

  // 2. consent accepted
  const missing = missingConsents(effective, receipts);
  if (missing.length > 0) {
    return {
      kind: "consent_required",
      record,
      missing: missing.map((d) => ({
        disclosure_key: d.disclosure_key,
        disclosure_version: d.disclosure_version,
      })),
    };
  }
  if (record.state === "disclosure_delivered") {
    record = await advanceAttestationSubmission({
      accountId,
      attestationId,
      to: "consent_accepted",
      correlationId,
      detail: {
        consent_receipts: receipts
          .filter((r) => r.status === "ACTIVE")
          .map((r) => r.consent_receipt_id),
      },
    });
  }

  // 3. attestation constructed (or blocked, naming why)
  const built = buildComplianceProfileAttestationRequest(args.evidence);
  if (!built.ok) {
    if (record.state !== "blocked") {
      record = await advanceAttestationSubmission({
        accountId,
        attestationId,
        to: "blocked",
        correlationId,
        detail: { reasons: [...built.blocked] },
      });
    }
    return { kind: "blocked", record, reasons: built.blocked };
  }
  if (built.request.attestation_id !== attestationId) {
    throw new Error("attestation id drifted between open and build");
  }
  if (record.state === "consent_accepted") {
    record = await advanceAttestationSubmission({
      accountId,
      attestationId,
      to: "attestation_constructed",
      correlationId,
      detail: { evidence_sha256: built.request.evidence_sha256 },
      patch: {
        evidenceSha256: built.request.evidence_sha256,
        decisionVersion: built.request.decision_version,
        decisionSequence: built.request.decision_sequence,
      },
    });
  }

  // 4. submitted — recorded before the call; same key on a retry.
  const idempotencyKey =
    record.idempotencyKey ?? attestationIdempotencyKey(built.request);
  if (record.state === "attestation_constructed") {
    record = await advanceAttestationSubmission({
      accountId,
      attestationId,
      to: "submitted",
      correlationId,
      detail: { idempotency_key: idempotencyKey },
      patch: { idempotencyKey },
    });
  }
  if (record.state !== "submitted") {
    // A blocked record never re-enters the chain silently.
    return { kind: "terminal", record };
  }

  // 5. acknowledged — or rejected with the contract's own code.
  try {
    const res = await client.call("createComplianceProfileAttestation", {
      path: { account_id: accountId },
      idempotencyKey,
      body: built.request,
    });
    record = await advanceAttestationSubmission({
      accountId,
      attestationId,
      to: "acknowledged",
      correlationId,
      detail: { backend_attestation_id: res.data.data.attestation_id },
      patch: {
        backendAttestationId: res.data.data.attestation_id,
        acknowledgedAt: new Date().toISOString(),
      },
    });
    return {
      kind: "acknowledged",
      record,
      attestation: res.data.data,
      upstreamStatus: res.status,
    };
  } catch (err) {
    if (err instanceof InvestorApiError) {
      record = await advanceAttestationSubmission({
        accountId,
        attestationId,
        to: "rejected",
        correlationId,
        detail: { code: err.code, status: err.status },
      });
      return {
        kind: "rejected",
        record,
        status: err.status,
        code: err.code,
        correlationId: err.correlationId,
        retryAfterSeconds: err.retryAfterSeconds,
      };
    }
    throw err;
  }
}

function upstream(err: InvestorApiError): SubmitAttestationOutcome {
  return {
    kind: "upstream_error",
    status: err.status,
    code: err.code,
    correlationId: err.correlationId,
    retryAfterSeconds: err.retryAfterSeconds,
  };
}
