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
 * alpha.3 error disposition for the generic mutation layer. Backend
 * decisions keep their status and code; ambiguous/transport states are 503;
 * never a message, never diagnostic material.
 *
 *   403 ACCOUNT_AUTHORIZATION_REQUIRED → explicit denial (rejected, 403)
 *   409 ACKNOWLEDGMENT_REQUIRED       → challenge (rejected, 409) with the
 *                                       VALIDATED continuation only
 *   409 ACKNOWLEDGMENT_BINDING_INVALID / ACKNOWLEDGMENT_NOT_REQUIRED /
 *       VERSION_CONFLICT / other 409  → rejected, 409
 *   404 / 413 REQUEST_TOO_LARGE / 422 VALIDATION_ERROR|CURSOR_*  → rejected, same status
 *   429 RATE_LIMITED                  → blocked, 429, Retry-After surfaced
 *   5xx envelope                      → blocked, 503 (retryable)
 *   transport / config                → blocked, 503
 */
export function upstreamRefusal(err: unknown): RouteRefusal {
  if (err instanceof InvestorApiError) {
    const base = {
      ok: false,
      code: err.code,
      upstreamStatus: err.status,
      upstreamCorrelationId: err.correlationId,
      retryAfterSeconds: err.retryAfterSeconds,
    };
    if (err.status === 429) {
      return {
        data: base,
        outcome: "blocked",
        reasonCode: err.code.toLowerCase(),
        status: 429,
      };
    }
    if (err.status >= 500) {
      return {
        data: base,
        outcome: "blocked",
        reasonCode: err.code.toLowerCase(),
        status: 503,
      };
    }
    if ([403, 404, 409, 413, 422].includes(err.status)) {
      return {
        data: {
          ...base,
          ...(err.code === "ACKNOWLEDGMENT_REQUIRED" && err.continuation
            ? { continuation: err.continuation, mutationApplied: false }
            : {}),
        },
        outcome: "rejected",
        reasonCode: err.code.toLowerCase(),
        status: err.status,
      };
    }
    return {
      data: base,
      outcome: "blocked",
      reasonCode: err.code.toLowerCase(),
      status: 502,
    };
  }
  return {
    data: { ok: false, upstream: classifyUpstream(err) },
    outcome: "blocked",
    reasonCode: "upstream",
    status: 503,
  };
}
