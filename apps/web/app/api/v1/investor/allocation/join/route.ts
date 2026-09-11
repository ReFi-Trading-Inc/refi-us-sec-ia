/**
 * POST /api/v1/investor/allocation/join — createAccountAction
 * { action: "join_template" } through the frozen v1.1.0-alpha.2 client.
 * ECONOMIC: AccountAuthorization must be exactly AUTHORIZED (read inside
 * the adapter) before the body is built or forwarded; PENDING/DENIED/SUSPENDED
 * → 412 with the backend's status word verbatim, never relabelled.
 * Account scope is the session's AUTHORITATIVE account; the browser never
 * names one. Deterministic Idempotency-Key from the exact parameters; no
 * retry; the backend owns every resulting execution decision.
 */
import { z } from "zod";
import { bffMutate } from "../../../../../../src/lib/bff/handler";
import {
  ALLOCATION_PERCENT_PATTERN,
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
    allocationPercent: z.string().regex(ALLOCATION_PERCENT_PATTERN),
    allocationPreviewId: z.string().regex(OPAQUE_ID_PATTERN),
  })
  .strict();
type Body = z.infer<typeof bodySchema>;

export const POST = bffMutate<Body>({
  action: "joinTemplate",
  source: "backend",
  parse: (body) => bodySchema.parse(body),
  apply: async (ctx) => {
    const scope = await clientAndScopeOrRefusal(ctx.auth);
    if ("refusal" in scope) return scope.refusal;
    const { client } = scope;
    let outcome;
    try {
      outcome = await submitAccountAction(client, scope.accountId, {
        action: "join_template",
        templateId: ctx.input.templateId,
        allocationPercent: ctx.input.allocationPercent,
        allocationPreviewId: ctx.input.allocationPreviewId,
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
