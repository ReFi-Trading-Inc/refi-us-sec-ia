/**
 * POST /api/v1/investor/allocation/leave — createAccountAction
 * { action: "leave_template" } through the frozen v1.1.0-alpha.2 client.
 * DISENGAGEMENT: reduces exposure, so it is never blocked here on a
 * non-AUTHORIZED account (the backend still decides).
 * Account scope is the session's AUTHORITATIVE account; the browser never
 * names one. Deterministic Idempotency-Key from the exact parameters; no
 * retry; the backend owns every resulting execution decision.
 */
import { z } from "zod";
import { operationIdFrom } from "../../../../../../src/lib/investor-api/operation-identity";
import { bffMutate } from "../../../../../../src/lib/bff/handler";
import {
  OPAQUE_ID_PATTERN,
  submitAccountAction,
} from "../../../../../../src/lib/investor-api/account-actions";
import {
  clientAndScopeOrRefusal,
  upstreamRefusal,
} from "../../../../../../src/lib/investor-api/mutation-route";

const bodySchema = z
  .object({
    templateId: z.string().regex(OPAQUE_ID_PATTERN),
  })
  .strict();
type Body = z.infer<typeof bodySchema>;

export const POST = bffMutate<Body>({
  action: "leaveTemplate",
  source: "backend",
  parse: (body) => bodySchema.parse(body),
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
      outcome = await submitAccountAction(client, scope.accountId, {
        operationId,
        action: "leave_template",
        templateId: ctx.input.templateId,
      });
    } catch (err) {
      return upstreamRefusal(err);
    }
    if (outcome.kind === "not_authorized") {
      return {
        data: {
          ok: false,
          reason: "account_not_authorized",
          authorization: outcome.authorization,
          action: outcome.action,
        },
        outcome: "blocked" as const,
        reasonCode: "account_not_authorized",
        status: 412,
      };
    }
    return {
      data: {
        ok: true,
        receipt: outcome.receipt,
        upstreamStatus: outcome.upstreamStatus,
      },
      references: [`action-receipt:${outcome.receipt.action_receipt_id}`],
      status: 202,
    };
  },
});
