/**
 * DELETE /api/v1/investor/broker/connection/[id] — disconnectBrokerageConnection
 * through the frozen v1.1.0-alpha.3 client. The connection MUST belong to the
 * session's authoritative account (checked before any upstream call; the
 * browser never names an account). No credentials are involved, returned or
 * stored. Disconnect is not liquidation, closure, identity deletion or
 * record revocation.
 *
 * Without a body: the initial request. A 409 ACKNOWLEDGMENT_REQUIRED retains
 * the continuation; the investor confirms explicitly by sending
 * { confirm: true, continuationRef } and the BFF records consent for exactly
 * the required disclosure, then re-issues the DELETE with the binding under a
 * NEW Idempotency-Key.
 */
import { z } from "zod";
import { bffMutate } from "../../../../../../../src/lib/bff/handler";
import {
  confirmBrokerageDisconnect,
  disconnectBrokerageConnection,
} from "../../../../../../../src/lib/investor-api/brokerage-maintenance";
import {
  clientAndScopeOrRefusal,
  upstreamRefusal,
} from "../../../../../../../src/lib/investor-api/mutation-route";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const bodySchema = z.union([
  z.null(),
  z.object({}).strict(),
  z
    .object({ confirm: z.literal(true), continuationRef: z.string().regex(ID) })
    .strict(),
]);
type Body = z.infer<typeof bodySchema>;

function connectionIdFromUrl(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.indexOf("connection") + 1] ?? "");
}

export const DELETE = bffMutate<Body>({
  action: "disconnectBroker",
  source: "backend",
  parse: (body) => bodySchema.parse(body),
  apply: async (ctx) => {
    const scope = await clientAndScopeOrRefusal(ctx.auth);
    if ("refusal" in scope) return scope.refusal;
    const connectionId = connectionIdFromUrl(ctx.req.url);
    const b = ctx.input;
    let out;
    try {
      out =
        b && "confirm" in b
          ? await confirmBrokerageDisconnect(
              scope.client,
              scope.accountId,
              connectionId,
              b.continuationRef,
              ctx.correlationId,
            )
          : await disconnectBrokerageConnection(
              scope.client,
              scope.accountId,
              connectionId,
              ctx.correlationId,
            );
    } catch (err) {
      return upstreamRefusal(err);
    }
    switch (out.kind) {
      case "accepted":
        return {
          data: {
            ok: true,
            disconnect: out.receipt,
            backendStatus: out.backendStatus,
            upstreamStatus: out.upstreamStatus,
          },
          references: [
            `disconnect-receipt:${out.receipt.disconnect_receipt_id}`,
            `brokerage-connection:${connectionId}`,
          ],
          status: 202,
        };
      case "acknowledgment_required":
        return {
          data: {
            ok: false,
            reason: "acknowledgment_required",
            mutationApplied: false,
            continuation: out.challenge.continuation,
          },
          outcome: "rejected" as const,
          reasonCode: "acknowledgment_required",
          references: [`continuation:${out.challenge.continuationRef}`],
          status: 409,
        };
      case "connection_out_of_scope":
        return {
          data: {
            ok: false,
            reason: "connection_out_of_scope",
            detail: out.reason,
          },
          outcome: "blocked" as const,
          reasonCode: "connection_out_of_scope",
          status: 404,
        };
      case "refused":
        return {
          data: {
            ok: false,
            reason: `confirmation_${out.reason}`,
            detail: out.detail ?? null,
          },
          outcome: "blocked" as const,
          reasonCode: `confirmation_${out.reason}`,
          status: 412,
        };
      case "retryable":
        return {
          data: {
            ok: false,
            reason: "retryable",
            upstreamStatus: out.status,
            code: out.code,
            retryAfterSeconds: out.retryAfterSeconds,
          },
          outcome: "blocked" as const,
          reasonCode: out.code.toLowerCase(),
          status: out.status === 429 ? 429 : 503,
        };
      case "rejected":
        return {
          data: {
            ok: false,
            reason: "rejected",
            upstreamStatus: out.status,
            code: out.code,
            upstreamCorrelationId: out.correlationId,
          },
          outcome:
            out.status === 403 ? ("rejected" as const) : ("rejected" as const),
          reasonCode: out.code.toLowerCase(),
          status: [403, 404, 409, 413, 422].includes(out.status)
            ? out.status
            : 502,
        };
    }
  },
});
