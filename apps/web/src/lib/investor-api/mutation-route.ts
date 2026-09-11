/**
 * Shared refusal shapes for the automated-Alpha mutation routes (server-only).
 * Keeps each route to: resolve scope → call adapter → map outcome.
 */
import { InvestorApiError } from "@refi/api-clients/investor-api";
import type { AuthContext } from "../bff/auth";
import { AccountScopeError, resolveAccountScope } from "./account-scope";
import type { InvestorApiReadClient } from "./demo-client";
import { investorApiClientFor } from "./gateway";
import { classifyUpstream } from "./upstream-state";

export interface RouteRefusal {
  data: Record<string, unknown>;
  outcome: "blocked" | "rejected";
  reasonCode: string;
  status: number;
}

/**
 * The session-bound frozen client and the AUTHORITATIVE account for this
 * request, or a refusal. Client construction is inside the guard so an
 * unconfigured upstream is a 503 refusal with a receipt, never a 500.
 */
export async function clientAndScopeOrRefusal(
  auth: AuthContext,
): Promise<
  | { client: InvestorApiReadClient; accountId: string }
  | { refusal: RouteRefusal }
> {
  try {
    const client = investorApiClientFor(auth);
    return { client, accountId: await resolveAccountScope(client, auth) };
  } catch (err) {
    if (err instanceof AccountScopeError) {
      return {
        refusal: {
          data: { ok: false, reason: "account_not_linked", detail: err.reason },
          outcome: "blocked",
          reasonCode: "account_not_linked",
          status: 412,
        },
      };
    }
    return {
      refusal: {
        data: { ok: false, upstream: classifyUpstream(err) },
        outcome: "blocked",
        reasonCode: "account_scope",
        status: 503,
      },
    };
  }
}

/**
 * Contract errors keep their status and code (409/422 are the backend's own
 * rejections; the rest are upstream faults); transport/config failures are
 * 503 and never carry submitted content.
 */
export function upstreamRefusal(err: unknown): RouteRefusal {
  if (err instanceof InvestorApiError) {
    const backendDecision = err.status === 409 || err.status === 422;
    return {
      data: {
        ok: false,
        code: err.code,
        upstreamStatus: err.status,
        upstreamCorrelationId: err.correlationId,
        retryAfterSeconds: err.retryAfterSeconds,
      },
      outcome: backendDecision ? "rejected" : "blocked",
      reasonCode: err.code.toLowerCase(),
      status: backendDecision ? err.status : 502,
    };
  }
  return {
    data: { ok: false, upstream: classifyUpstream(err) },
    outcome: "blocked",
    reasonCode: "upstream",
    status: 503,
  };
}
