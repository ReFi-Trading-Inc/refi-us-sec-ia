/**
 * POST /api/v1/investor/kyc/reconcile
 *
 * User-initiated provider reconciliation for the CURRENT subject's
 * non-terminal KYC journey (page resumed, DocV capture finished, webhook
 * suspected missed). The BFF asks the provider adapter to reconcile with
 * `GET /api/evaluation/{eval_id}` (no identity inputs); the browser never
 * talks to the provider. Bounded by the adapter's backoff; a terminal
 * provider result is finalized through the exact same path as a webhook.
 * A provider outage is a retryable condition, never a rejection.
 */
import { bffMutate } from "@lib/bff/handler";
import { getKycProvider, KycProviderUnavailableError } from "@lib/kyc";

export const POST = bffMutate<Record<string, never>>({
  action: "reconcileKycEvaluation",
  source: "prototype-bff",
  parse: () => ({}),
  apply: async (ctx) => {
    let provider;
    try {
      provider = getKycProvider();
    } catch (err) {
      if (err instanceof KycProviderUnavailableError) {
        return {
          data: { ok: false, reason: "provider_unconfigured" },
          outcome: "blocked" as const,
          reasonCode: "provider_unconfigured",
          status: 503,
        };
      }
      throw err;
    }
    if (!provider.reconcile) {
      return {
        data: { ok: false, reason: "no_reconcile_capability" },
        outcome: "rejected" as const,
        reasonCode: "no_reconcile_capability",
        status: 409,
      };
    }
    const result = await provider.reconcile(
      { authId: ctx.auth.authId },
      ctx.correlationId,
    );
    return {
      data: { ok: true, outcome: result.outcome, session: result.session },
      references: [`kyc-session:${result.session.referenceId}`],
      status: 200,
    };
  },
});
