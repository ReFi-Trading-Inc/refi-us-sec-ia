/**
 * POST /api/v1/investor/kyc/step-up/complete
 *
 * The browser reports that the provider's capture flow finished for the
 * current subject. This moves the ReFi journey to `under_review` and nothing
 * more: capture completion is NOT verification. The authoritative final
 * decision arrives asynchronously from the provider (webhook), which is the
 * only path that can reach `passed` or `failed`.
 */
import { bffMutate } from "@lib/bff/handler";
import { getKycProvider, KycProviderUnavailableError } from "@lib/kyc";

export const POST = bffMutate<Record<string, never>>({
  action: "completeKycStepUp",
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
    if (!provider.markStepUpCaptured) {
      return {
        data: { ok: false, reason: "no_step_up_capability" },
        outcome: "rejected" as const,
        reasonCode: "no_step_up_capability",
        status: 409,
      };
    }
    const session = await provider.markStepUpCaptured(
      { authId: ctx.auth.authId },
      ctx.correlationId,
    );
    if (!session) {
      return {
        data: { ok: false, reason: "no_active_step_up" },
        outcome: "rejected" as const,
        reasonCode: "no_active_step_up",
        status: 409,
      };
    }
    return {
      data: { ok: true, session },
      references: [`kyc-session:${session.referenceId}`],
      status: 200,
    };
  },
});
