/**
 * POST /api/v1/investor/allocation/preview — createAllocationPreview through
 * the frozen v1.1.0-alpha.2 client. Non-economic (changes nothing); gated on
 * the session's AUTHORITATIVE account scope. The browser names a template
 * and a percent, never an account. Deterministic Idempotency-Key; no retry.
 */
import { z } from "zod";
import { bffMutate } from "../../../../../../src/lib/bff/handler";
import {
  ALLOCATION_PERCENT_PATTERN,
  OPAQUE_ID_PATTERN,
  previewAllocation,
} from "../../../../../../src/lib/investor-api/account-actions";
import {
  clientAndScopeOrRefusal,
  upstreamRefusal,
} from "../../../../../../src/lib/investor-api/mutation-route";

const bodySchema = z
  .object({
    templateId: z.string().regex(OPAQUE_ID_PATTERN),
    allocationPercent: z.string().regex(ALLOCATION_PERCENT_PATTERN),
  })
  .strict();
type Body = z.infer<typeof bodySchema>;

export const POST = bffMutate<Body>({
  action: "previewAllocation",
  source: "backend",
  parse: (body) => bodySchema.parse(body),
  apply: async (ctx) => {
    const scope = await clientAndScopeOrRefusal(ctx.auth);
    if ("refusal" in scope) return scope.refusal;
    const { client } = scope;
    try {
      const out = await previewAllocation(client, scope.accountId, ctx.input);
      return {
        data: {
          ok: true,
          preview: out.preview,
          upstreamStatus: out.upstreamStatus,
        },
        references: [`allocation-preview:${out.preview.allocation_preview_id}`],
        status: 201,
      };
    } catch (err) {
      return upstreamRefusal(err);
    }
  },
});
