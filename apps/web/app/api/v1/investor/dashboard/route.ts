/**
 * GET /api/v1/investor/dashboard
 *
 * Composite read for the home dashboard: status summary, latest decision
 * record, pending disclosure acks, open exceptions. Pure projection; no
 * state mutation, no access-log entry (the dashboard is the entry point —
 * individual record views log themselves).
 */
import { bffRead } from "@lib/bff/handler";
import {
  getLifecycleState,
  getSubscriptionMode,
  getManagedExecutionState,
  getLatestExecutionPolicy,
  getLatestProfileSnapshot,
  getBrokerageConnection,
  listExceptionReviews,
  listDecisionRecords,
  listDisclosureDocuments,
  listDisclosureAcksForUser,
} from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: ["G-001", "G-003", "G-005", "G-006"],
  fetch: async (ctx) => {
    if (!ctx.auth) {
      return {
        ready: false,
        notice: "Sign in to view your dashboard.",
      };
    }
    const accountId = ctx.auth.accountId ?? null;

    const [
      lifecycle,
      mode,
      mes,
      policy,
      profile,
      broker,
      exceptions,
      decisions,
      docs,
      acks,
    ] = await Promise.all([
      accountId ? getLifecycleState(accountId) : Promise.resolve(null),
      accountId ? getSubscriptionMode(accountId) : Promise.resolve(null),
      accountId ? getManagedExecutionState(accountId) : Promise.resolve(null),
      accountId ? getLatestExecutionPolicy(accountId) : Promise.resolve(null),
      accountId ? getLatestProfileSnapshot(accountId) : Promise.resolve(null),
      accountId ? getBrokerageConnection(accountId) : Promise.resolve(null),
      accountId ? listExceptionReviews(accountId) : Promise.resolve([]),
      accountId ? listDecisionRecords(accountId) : Promise.resolve([]),
      listDisclosureDocuments(),
      listDisclosureAcksForUser(ctx.auth.authId),
    ]);

    const ackedKey = new Set(acks.map((a) => `${a.docId}__${a.version}`));
    const pendingDisclosures = docs.filter(
      (d) =>
        d.displayStatus === "available" &&
        !ackedKey.has(`${d.docId}__${d.version}`),
    );

    return {
      ready: true,
      authId: ctx.auth.authId,
      accountId,
      lifecycle,
      subscriptionMode: mode,
      managedExecutionState: mes,
      executionPolicy: policy
        ? { policyId: policy.policyId, policyVersion: policy.policyVersion }
        : null,
      latestProfile: profile
        ? {
            profileVersion: profile.profileVersion,
            contentHash: profile.contentHash,
          }
        : null,
      brokerageStatus: broker?.status ?? null,
      openExceptions: exceptions.filter((e) => e.status === "open").length,
      recentDecisions: decisions.slice(0, 5),
      pendingDisclosures,
    };
  },
});
