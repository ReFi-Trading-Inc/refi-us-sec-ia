/** Durable decision identity, separate from the questionnaire's version.
 * Provider updates/replacement can supersede a Dev fixture without requiring
 * users to resubmit their answers. A retry never allocates a new decision.
 */
import { createHash } from "node:crypto";
import { InvestorApiError } from "@refi/api-clients/investor-api";
import { connectedKvStore } from "../connected-store";
import type { KVStore } from "../store/types";
import type { InvestorApiReadClient } from "../investor-api/demo-client";
import { isDevelopmentKycEvidence } from "../integration-dev/kyc-pass";
import {
  buildComplianceProfileAttestationRequest,
  type AttestationEvidenceInput,
} from "./attestation-mapping";

export interface DecisionIdentity {
  sequence: number;
  effectiveAt: string;
}
export async function assignDecisionIdentity(
  client: InvestorApiReadClient,
  input: AttestationEvidenceInput,
  store: KVStore<DecisionIdentity> = connectedKvStore("attestation-decision"),
): Promise<AttestationEvidenceInput> {
  if (isDevelopmentKycEvidence(input.kyc)) return input;
  const built = buildComplianceProfileAttestationRequest(input);
  if (!built.ok) return input;
  const key = createHash("sha256")
    .update(JSON.stringify([input.accountId, built.request]))
    .digest("hex");
  let identity = await store.get(`decision_${key}`);
  if (!identity) {
    let sequence = input.answersVersion.profileVersion;
    try {
      const current = await client.call(
        "getCurrentComplianceProfileAttestation",
        { path: { account_id: input.accountId } },
      );
      sequence = Math.max(sequence, current.data.data.decision_sequence + 1);
    } catch (err) {
      if (!(
        err instanceof InvestorApiError &&
        err.status === 404 &&
        err.code === "RESOURCE_NOT_FOUND"
      ))
        throw err;
    }
    const limit = Math.min(sequence + 32, 2147483647);
    for (;;) {
      const candidate = { sequence, effectiveAt: new Date().toISOString() };
      if (
        await store.putIfAbsent(
          `sequence_${input.accountId}_${String(sequence)}`,
          candidate,
        )
      ) {
        await store.putIfAbsent(`decision_${key}`, candidate);
        identity = await store.get(`decision_${key}`);
        break;
      }
      if (++sequence > limit)
        throw new Error(
          "Attestation sequence contention; retry identical evidence",
        );
    }
  }
  if (!identity) throw new Error("Attestation decision identity unavailable");
  return { ...input, decisionIdentity: identity };
}
