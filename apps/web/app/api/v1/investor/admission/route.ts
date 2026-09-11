/**
 * GET /api/v1/investor/admission
 *
 * The caller's Alpha admission state, evaluated on read from CURRENT
 * authoritative prerequisite state (order-independent: a consent accepted
 * after a final KYC ACCEPT admits the user here without a new evaluation).
 * Read-only for the browser: nothing in this request can set or override
 * admission. Admission never implies AccountAuthorization.
 */
import { bffRead } from "@lib/bff/handler";
import { runAlphaAdmissionEvaluation } from "@lib/compliance/alpha-admission";
import { investorApiClientFor } from "@lib/investor-api/gateway";
import { getKycProvider, KycProviderUnavailableError } from "@lib/kyc";

export const GET = bffRead({
  source: "prototype-bff",
  fetch: async (ctx) => {
    if (!ctx.auth) return null;
    let provider = null;
    try {
      provider = getKycProvider();
    } catch (err) {
      if (!(err instanceof KycProviderUnavailableError)) throw err;
    }
    const { record } = await runAlphaAdmissionEvaluation({
      auth: ctx.auth,
      client: investorApiClientFor(ctx.auth),
      provider,
      correlationId: ctx.correlationId,
      trigger: "read",
    });
    return {
      state: record.state,
      reason: record.reason,
      ruleVersion: record.ruleVersion,
      admittedAt: record.admittedAt,
      evaluatedAt: record.evaluatedAt,
    };
  },
});
