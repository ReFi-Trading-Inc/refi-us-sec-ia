/**
 * POST /api/v1/investor/broker/connection/[id]/sync — syncBrokerageConnection
 * through the frozen v1.1.0-alpha.2 client. No body. The connection must
 * belong to the session's AUTHORITATIVE account (checked before any mutation
 * path is built). Idempotency-Key bucketed per minute; no retry.
 */
import { bffMutate } from "../../../../../../../../src/lib/bff/handler";
import { operationIdFrom } from "../../../../../../../../src/lib/investor-api/operation-identity";
import { syncBrokerageConnection } from "../../../../../../../../src/lib/investor-api/brokerage-maintenance";
import {
  clientAndScopeOrRefusal,
  upstreamRefusal,
} from "../../../../../../../../src/lib/investor-api/mutation-route";

function connectionIdFromUrl(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.indexOf("connection") + 1] ?? "");
}

export const POST = bffMutate<undefined>({
  action: "syncBrokerConnection",
  source: "backend",
  apply: async (ctx) => {
    const operationId = operationIdFrom(ctx.req.headers);
    if (!operationId)
      return {
        refuse: "bad_request",
        message:
          "A stable Idempotency-Key is required; reuse it only for the same action.",
      };
    const scope = await clientAndScopeOrRefusal(ctx.auth);
    if ("refusal" in scope) return scope.refusal;
    const { client } = scope;
    let outcome;
    try {
      outcome = await syncBrokerageConnection(
        client,
        scope.accountId,
        connectionIdFromUrl(ctx.req.url),
        operationId,
      );
    } catch (err) {
      return upstreamRefusal(err);
    }
    if (outcome.kind === "connection_out_of_scope") {
      return {
        data: {
          ok: false,
          reason: "connection_out_of_scope",
          detail: outcome.reason,
        },
        outcome: "blocked" as const,
        reasonCode: "connection_out_of_scope",
        status: 404,
      };
    }
    return {
      data: {
        ok: true,
        sync: outcome.result,
        upstreamStatus: outcome.upstreamStatus,
      },
      references: [`sync-receipt:${outcome.result.sync_receipt_id}`],
      status: 202,
    };
  },
});
