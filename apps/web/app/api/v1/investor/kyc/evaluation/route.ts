/**
 * POST /api/v1/investor/kyc/evaluation
 *
 * Submit the identity data collected by ReFi's OWN onboarding form to the
 * configured KYC adapter (Build Your Own UI). Same-origin, session-
 * authenticated, account-scoped by the BFF wrapper. The browser never talks
 * to a provider: the provider's server key, workflow, base URL and
 * environment are server configuration and cannot appear in this body (the
 * strict schema refuses unknown keys). A device-intelligence session token
 * from the provider's browser SDK is required.
 *
 * PII lifecycle: parsed → normalised → handed to the adapter once → dropped.
 * Nothing in the receipt, the response or any log carries an identity value;
 * the response is the provider-neutral product state only.
 *
 * Answers when no adapter evaluates in-app (mock / unconfigured): a
 * controlled `not_evaluating` result, never a fabricated verification.
 */
import { bffMutate } from "@lib/bff/handler";
import {
  getKycProvider,
  identityInputSchema,
  KycProviderUnavailableError,
  normalizeIdentityInput,
  type IdentityInput,
  type KycVerificationSession,
} from "@lib/kyc";

export interface KycEvaluationResponse {
  result:
    | "evaluated"
    | "reused"
    | "already_terminal"
    | "submission_in_flight"
    | "provider_error"
    | "not_evaluating";
  session: KycVerificationSession | null;
  stepUpRequired: boolean;
  retryable?: boolean;
  retryAfterSeconds?: number | null;
  reason?: string;
}

export const POST = bffMutate<IdentityInput>({
  action: "submitKycEvaluation",
  source: "prototype-bff",
  parse: (body) => identityInputSchema.parse(body),
  apply: async (ctx) => {
    const input = ctx.input;
    let provider;
    try {
      provider = getKycProvider();
    } catch (err) {
      if (err instanceof KycProviderUnavailableError) {
        return {
          data: {
            result: "not_evaluating",
            session: null,
            stepUpRequired: false,
            reason: "provider_unconfigured",
          } satisfies KycEvaluationResponse,
          outcome: "blocked" as const,
          reasonCode: "provider_unconfigured",
          status: 503,
        };
      }
      throw err;
    }
    if (!provider.evaluateIdentity) {
      return {
        data: {
          result: "not_evaluating",
          session: await provider.getSession({ authId: ctx.auth.authId }),
          stepUpRequired: false,
          reason: "adapter_does_not_evaluate_in_app",
        } satisfies KycEvaluationResponse,
        outcome: "blocked" as const,
        reasonCode: "adapter_does_not_evaluate_in_app",
        status: 409,
      };
    }
    // ReFi records the investor's consent server-side at submission time.
    const consentTimestamp = new Date().toISOString();
    const outcome = await provider.evaluateIdentity({
      subject: { authId: ctx.auth.authId },
      input: normalizeIdentityInput(input),
      consentTimestamp,
      correlationId: ctx.correlationId,
    });
    const ref = `kyc-session:${outcome.session.referenceId}`;
    switch (outcome.kind) {
      case "evaluated":
      case "reused":
        return {
          data: {
            result: outcome.kind,
            session: outcome.session,
            stepUpRequired: outcome.stepUpRequired,
          } satisfies KycEvaluationResponse,
          references: [ref],
          status: 200,
        };
      case "already_terminal":
        return {
          data: {
            result: "already_terminal",
            session: outcome.session,
            stepUpRequired: false,
          } satisfies KycEvaluationResponse,
          outcome: "rejected" as const,
          reasonCode: "already_terminal",
          references: [ref],
          status: 409,
        };
      case "submission_in_flight":
        return {
          data: {
            result: "submission_in_flight",
            session: outcome.session,
            stepUpRequired: false,
          } satisfies KycEvaluationResponse,
          outcome: "rejected" as const,
          reasonCode: "submission_in_flight",
          references: [ref],
          status: 409,
        };
      case "provider_error":
        return {
          data: {
            result: "provider_error",
            session: outcome.session,
            stepUpRequired: false,
            retryable: outcome.retryable,
            retryAfterSeconds: outcome.retryAfterSeconds,
            reason: outcome.errorKind,
          } satisfies KycEvaluationResponse,
          outcome: "blocked" as const,
          reasonCode: `provider_${outcome.errorKind}`,
          references: [ref],
          status: outcome.retryable ? 503 : 502,
        };
    }
  },
});
