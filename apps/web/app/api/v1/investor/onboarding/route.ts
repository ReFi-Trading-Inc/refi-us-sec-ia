/**
 * GET /api/v1/investor/onboarding — the setup summary for the onboarding
 * pages (strategy review, setup checklist).
 *
 * Composition, all READ, in this order:
 *   1. unscoped backend projections: onboarding status, the current template;
 *   2. BFF-local identity-verification lifecycle (keyed by authId);
 *   3. authoritative account scope (`resolveAccountScope` → `listAccounts`);
 *   4. only for the RESOLVED account: authorization, brokerage connection and
 *      the BFF-local Investor Profile v2 assessment.
 * A zero-account applicant is valid: nulls, never a fabricated account.
 *
 * Nothing here asserts admission, enables management, or activates anything:
 * `authorization` and `onboarding.state` are the backend's words, echoed.
 */
import { bffRead } from "@lib/bff/handler";
import { investorApiClientFor } from "@lib/investor-api/gateway";
import {
  AccountScopeError,
  resolveAccountScope,
} from "@lib/investor-api/account-scope";
import { classifyUpstream } from "@lib/investor-api/upstream-state";
import { getBrokerageConnection } from "@lib/investor-api/brokerage-connection";
import { getKycProvider, KycProviderUnavailableError } from "@lib/kyc";
import {
  getProfileAssessment,
  latestProfileVersion,
} from "@lib/prototype-store/entities/investor-profile-v2";
import { ASSESSMENT_POLICY_VERSION } from "@lib/sec203a/investor-profile-engine";

export const GET = bffRead({
  source: "backend",
  fetch: async (ctx) => {
    if (!ctx.auth) return null;
    const auth = ctx.auth;
    const client = investorApiClientFor(auth);

    const identity = await (async () => {
      try {
        const provider = getKycProvider();
        const session = await provider.getSession({ authId: auth.authId });
        return { state: session.state };
      } catch (err) {
        if (err instanceof KycProviderUnavailableError) return { state: null };
        throw err;
      }
    })();

    const [status, templates] = await Promise.all([
      client.call("getOnboardingStatus"),
      client.call("listTemplates", { query: { page_size: 1 } }),
    ]);
    const t = templates.data.data.items[0];
    const template = t
      ? {
          templateId: t.template_id,
          name: t.name,
          benchmark: t.benchmark,
          constituentCount: t.constituent_count,
          freshnessStatus: t.freshness_status,
        }
      : null;

    // Account-scoped reads happen ONLY after authoritative ownership
    // resolution against `listAccounts`. The BFF-local Investor Profile v2
    // record is keyed by account id, so it is read for the RESOLVED id — never
    // for a claim that failed re-authorization. A zero-account applicant
    // (WAITLISTED) is a valid state: accountId/profile/authorization/connection
    // are null and the onboarding state still renders.
    let accountId: string | null = null;
    let authorization: { status: string; policyVersion: string } | null = null;
    let connection = null;
    let profile: {
      version: number;
      assessment: {
        permittedRiskBand: number | null;
        riskCapacityBand: number | null;
        riskWillingnessBand: number | null;
        productFitStatus: string;
        bindingConstraint: string | null;
        assessedAt: string;
      } | null;
    } | null = null;
    let upstream: { state: string } = { state: "ok" };
    try {
      accountId = await resolveAccountScope(client, auth);
    } catch (err) {
      if (!(err instanceof AccountScopeError)) throw err;
      upstream = classifyUpstream(err);
    }
    if (accountId !== null) {
      const resolved = accountId;
      const [authz, conn, version] = await Promise.all([
        client.call("getAccountAuthorization", {
          path: { account_id: resolved },
        }),
        getBrokerageConnection(client, resolved),
        latestProfileVersion(resolved),
      ]);
      authorization = {
        status: authz.data.data.status,
        policyVersion: authz.data.data.policy_version,
      };
      connection = conn;
      if (version > 0) {
        const record = await getProfileAssessment(
          resolved,
          version,
          ASSESSMENT_POLICY_VERSION,
        );
        profile = record
          ? {
              version,
              assessment: {
                permittedRiskBand: record.assessment.permittedRiskBand,
                riskCapacityBand: record.assessment.riskCapacityBand,
                riskWillingnessBand: record.assessment.riskWillingnessBand,
                productFitStatus: record.assessment.productFitStatus,
                bindingConstraint: record.assessment.bindingConstraint,
                assessedAt: record.assessment.assessedAt,
              },
            }
          : { version, assessment: null };
      }
    }

    return {
      onboarding: {
        state: status.data.data.state,
        requiredSteps: status.data.data.required_steps,
        policyVersion: status.data.data.policy_version,
      },
      accountId,
      authorization,
      identity,
      profile,
      connection,
      template,
      upstream,
    };
  },
});
