/**
 * POST /api/v1/investor/broker/connection/[id]/rotate —
 * rotateBrokerageCredentials through the frozen v1.1.0-alpha.2 client.
 * The connection must belong to the session's AUTHORITATIVE account (checked
 * against listBrokerageConnections before any mutation path is built).
 * The second credential-bearing request in the app: a paper Alpaca key pair
 * validated by shape, forwarded ONCE and forgotten — never logged, stored,
 * hashed, echoed or reused; Idempotency-Key from the key ID only.
 */
import { z } from "zod";
import { bffMutate } from "../../../../../../../../src/lib/bff/handler";
import { rotateBrokerageCredentials } from "../../../../../../../../src/lib/investor-api/brokerage-maintenance";
import {
  clientAndScopeOrRefusal,
  upstreamRefusal,
} from "../../../../../../../../src/lib/investor-api/mutation-route";

const PAPER_KEY_ID = /^PK[A-Z0-9]{18}$/;
const SECRET = /^[A-Za-z0-9]{40}$/;
const bodySchema = z
  .object({
    environment: z.literal("paper"),
    apiKeyId: z.string().regex(PAPER_KEY_ID),
    apiSecretKey: z.string().regex(SECRET),
  })
  .strict();
type Body = z.infer<typeof bodySchema>;

function connectionIdFromUrl(url: string): string {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.indexOf("connection") + 1] ?? "");
}

export const POST = bffMutate<Body>({
  action: "rotateBrokerCredentials",
  source: "backend",
  parse: (body) => bodySchema.parse(body),
  apply: async (ctx) => {
    const scope = await clientAndScopeOrRefusal(ctx.auth);
    if ("refusal" in scope) return scope.refusal;
    const { client } = scope;
    let outcome;
    try {
      outcome = await rotateBrokerageCredentials(
        client,
        scope.accountId,
        connectionIdFromUrl(ctx.req.url),
        { apiKeyId: ctx.input.apiKeyId, apiSecretKey: ctx.input.apiSecretKey },
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
        connection: outcome.result,
        upstreamStatus: outcome.upstreamStatus,
      },
      references: [`brokerage-connection:${outcome.result.connectionId}`],
      status: 202,
    };
  },
});
