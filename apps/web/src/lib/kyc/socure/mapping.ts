/**
 * Socure decision → ReFi provider-neutral state (mandate §4, §10).
 *
 *   ACCEPT (sync or webhook)             → passed            (ReFi VERIFIED)
 *   REJECT (sync or webhook)             → failed            (ReFi REJECTED)
 *   REVIEW + evaluation_paused + DocV token
 *                                        → additional_info_required
 *                                          (ReFi REVIEW_REQUIRED: DocV step-up active)
 *   REVIEW without a DocV token          → under_review      (provider holds it; no
 *                                          user action available; manual/provider follow-up)
 *   DocV captured, awaiting webhook      → under_review      (ReFi IN_PROGRESS equivalent)
 *
 * The final ReFi state is ReFi-owned: a mapping is not admission, not
 * authorization, not eligibility. Existing lifecycle names are reused
 * (mandate: do not rename enums that already serve the purpose):
 * REVIEW_REQUIRED ≙ additional_info_required / under_review, VERIFIED ≙ passed,
 * REJECTED ≙ failed, IN_PROGRESS ≙ in_progress.
 */
import type { KycLifecycleState } from "../provider";
import type { KycProviderDecision } from "../evidence";
import {
  SOCURE_EVAL_STATUS_PAUSED,
  type SocureDecision,
  type SocureEvaluationCompletedEvent,
  type SocureEvaluationResponse,
} from "./schemas";

export function normalizeSocureDecision(
  d: SocureDecision,
): KycProviderDecision {
  switch (d) {
    case "ACCEPT":
      return "accept";
    case "REJECT":
      return "reject";
    case "REVIEW":
      return "review";
  }
}

/** Guide step 4: the DocV transaction token, if RiskOS triggered DocV. */
export function extractDocvTransactionToken(
  r: SocureEvaluationResponse,
): string | null {
  for (const e of r.data_enrichments ?? []) {
    const t = e.response?.data?.docvTransactionToken;
    if (typeof t === "string" && t.length > 0) return t;
  }
  return null;
}

export interface SocureSyncOutcome {
  refiState: KycLifecycleState;
  providerDecision: KycProviderDecision;
  final: boolean;
  /** Present only for REVIEW with an active DocV step-up. */
  docvTransactionToken: string | null;
  reviewReason: "docv_step_up" | "provider_review" | null;
}

/** Map a synchronous Evaluation API response. */
export function mapSocureEvaluation(
  r: SocureEvaluationResponse,
): SocureSyncOutcome {
  const providerDecision = normalizeSocureDecision(r.decision);
  switch (r.decision) {
    case "ACCEPT":
      return {
        refiState: "passed",
        providerDecision,
        final: true,
        docvTransactionToken: null,
        reviewReason: null,
      };
    case "REJECT":
      return {
        refiState: "failed",
        providerDecision,
        final: true,
        docvTransactionToken: null,
        reviewReason: null,
      };
    case "REVIEW": {
      const token = extractDocvTransactionToken(r);
      const paused = r.eval_status === SOCURE_EVAL_STATUS_PAUSED;
      if (token !== null && paused) {
        return {
          refiState: "additional_info_required",
          providerDecision,
          final: false,
          docvTransactionToken: token,
          reviewReason: "docv_step_up",
        };
      }
      // REVIEW without the documented paused+token shape: the provider holds
      // the case; no user step-up is available. Never a rejection.
      return {
        refiState: "under_review",
        providerDecision,
        final: false,
        docvTransactionToken: null,
        reviewReason: "provider_review",
      };
    }
  }
}

/** Map the asynchronous `evaluation_completed` webhook (final decision). */
export function mapSocureWebhookDecision(e: SocureEvaluationCompletedEvent): {
  refiState: KycLifecycleState;
  providerDecision: KycProviderDecision;
  final: boolean;
} {
  const providerDecision = normalizeSocureDecision(e.data.decision);
  switch (e.data.decision) {
    case "ACCEPT":
      return { refiState: "passed", providerDecision, final: true };
    case "REJECT":
      return { refiState: "failed", providerDecision, final: true };
    case "REVIEW":
      // A completed evaluation that still says REVIEW is a provider exception:
      // keep the case open for internal compliance follow-up, never verified.
      return { refiState: "under_review", providerDecision, final: false };
  }
}

export { deriveComponentStatuses } from "../evidence";
