/**
 * GET /api/v1/investor/kyc/step-up
 *
 * The caller's document step-up, if one is active: `{ required, token }`.
 * The token is the provider's capture token for THIS authenticated subject
 * only (issued by the provider for the paused evaluation); it is the only
 * provider value the browser needs to launch the capture SDK with the
 * PUBLIC SDK key. No server credential is ever exposed. Absent an active
 * step-up (or an adapter without the capability) → `{ required: false }`.
 */
import { bffRead } from "@lib/bff/handler";
import { getKycProvider, KycProviderUnavailableError } from "@lib/kyc";

export interface KycStepUpView {
  required: boolean;
  token: string | null;
}

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx): Promise<KycStepUpView> => {
    if (!ctx.auth) return { required: false, token: null };
    let provider;
    try {
      provider = getKycProvider();
    } catch (err) {
      if (err instanceof KycProviderUnavailableError) {
        return { required: false, token: null };
      }
      throw err;
    }
    if (!provider.stepUpToken) return { required: false, token: null };
    const token = await provider.stepUpToken({ authId: ctx.auth.authId });
    return { required: token !== null, token };
  },
});
