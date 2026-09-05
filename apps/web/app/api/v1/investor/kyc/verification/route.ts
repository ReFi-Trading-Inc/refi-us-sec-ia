/**
 * GET /api/v1/investor/kyc/verification
 *
 * The caller's identity-verification JOURNEY as the frontend/BFF knows it —
 * the provider-neutral lifecycle (`src/lib/kyc`). This is domain A of the
 * 2026-09-04 KYC decision: frontend-owned provider lifecycle, currently a
 * clearly-labelled mock. It is NOT Daniel's `getKycStatus`, which is a backend
 * policy projection and is deliberately not read here.
 *
 * The browser never talks to a KYC vendor or to the Investor API for this;
 * this same-origin route is its only path. When no provider is configured the
 * view says so explicitly (`available: false`) rather than inventing a state.
 */
import { bffRead } from "@lib/bff/handler";
import {
  getKycProvider,
  KycProviderUnavailableError,
  toNormalizedKycResult,
  type AttestationKyc,
  type KycLifecycleState,
  type KycVerificationSession,
} from "@lib/kyc";

export interface KycVerificationView {
  available: boolean;
  /** Adapter kind — a label for humans/tests ("mock"), never product logic. */
  adapter: "mock" | null;
  session: KycVerificationSession | null;
  /**
   * What a LATER attestation slice would submit for `kyc`. Informational
   * here; this route submits nothing and no backend authorization is implied.
   */
  normalized: AttestationKyc | null;
  reason?: "provider_unconfigured";
}

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx): Promise<KycVerificationView> => {
    if (!ctx.auth) {
      return {
        available: false,
        adapter: null,
        session: null,
        normalized: null,
      };
    }
    try {
      const provider = getKycProvider();
      const session = await provider.getSession({ authId: ctx.auth.authId });
      return {
        available: true,
        adapter: provider.kind,
        session,
        normalized: toNormalizedKycResult(session, provider.kind),
      };
    } catch (err) {
      if (err instanceof KycProviderUnavailableError) {
        return {
          available: false,
          adapter: null,
          session: null,
          normalized: null,
          reason: "provider_unconfigured",
        };
      }
      throw err;
    }
  },
});

export type { KycLifecycleState };
