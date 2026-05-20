/**
 * GET /api/v1/investor/status
 *
 * Aggregated status for the investor home dashboard.
 */
import { bffRead } from "@lib/bff/handler";
import {
  getLifecycleState,
  getSubscriptionMode,
  getManagedExecutionState,
  getLatestExecutionPolicy,
  getLatestProfileSnapshot,
  getBrokerageConnection,
} from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: ["G-003", "G-006", "G-007"],
  fetch: async (ctx) => {
    if (!ctx.auth) {
      return {
        authId: "",
        accountId: null,
        lifecycle: null,
        subscriptionMode: null,
        managedExecutionState: null,
        executionPolicyVersion: null,
        latestProfileVersion: null,
        brokerageStatus: null,
      };
    }
    const accountId = ctx.auth.accountId ?? null;
    if (!accountId) {
      return {
        authId: ctx.auth.authId,
        accountId: null,
        lifecycle: null,
        subscriptionMode: null,
        managedExecutionState: null,
        executionPolicyVersion: null,
        latestProfileVersion: null,
        brokerageStatus: null,
      };
    }
    const [lifecycle, mode, mes, policy, profile, broker] = await Promise.all([
      getLifecycleState(accountId),
      getSubscriptionMode(accountId),
      getManagedExecutionState(accountId),
      getLatestExecutionPolicy(accountId),
      getLatestProfileSnapshot(accountId),
      getBrokerageConnection(accountId),
    ]);
    return {
      authId: ctx.auth.authId,
      accountId,
      lifecycle,
      subscriptionMode: mode,
      managedExecutionState: mes,
      executionPolicyVersion: policy?.policyVersion ?? null,
      latestProfileVersion: profile?.profileVersion ?? null,
      brokerageStatus: broker?.status ?? null,
    };
  },
});
