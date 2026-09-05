/**
 * POST /api/v1/investor/kyc/verification/start
 *
 * Start or resume the caller's identity-verification journey with the
 * configured provider adapter (frontend-owned lifecycle; currently the mock).
 * Idempotent from an in-progress state. Records a `startKycVerification`
 * receipt. Submits nothing to the trading backend: the normalized result is
 * consumed by a LATER attestation slice.
 */
import { bffMutate } from "@lib/bff/handler";
import { getKycProvider, KycProviderUnavailableError } from "@lib/kyc";

export const POST = bffMutate<Record<string, never>>({
  action: "startKycVerification",
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
    const result = await provider.start(
      { authId: ctx.auth.authId },
      ctx.correlationId,
    );
    if (!result.accepted) {
      return {
        data: { ok: false, reason: result.reason, session: result.session },
        outcome: "rejected" as const,
        reasonCode: result.reason,
        status: 409,
      };
    }
    return {
      data: {
        ok: true,
        adapter: provider.kind,
        session: result.session,
        continuePath: result.continuePath,
      },
      references: [`kyc-session:${result.session.referenceId}`],
      status: 200,
    };
  },
});
