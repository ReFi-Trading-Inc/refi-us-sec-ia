/**
 * POST /api/v1/investor/exceptions/[id]/resolve
 *
 * The single per-decision investor touchpoint allowed under Managed mode.
 * The resolution category is constrained by ExceptionResolution — anything
 * outside that set is rejected at the BFF, so generic per-trade approval
 * payloads are impossible by construction.
 *
 * The "resolve" resolution category is the only one that releases a held
 * intent for downstream replay; the other categories are user-side
 * remediations that unblock the same intent without per-trade authorization.
 * The UI never spells the legacy backend identifiers — the mapping lives in
 * packages/api-clients/src/hooks/exceptions.ts.
 */
import { z } from "zod";
import { bffMutate } from "@lib/bff/handler";
import {
  ExceptionResolutions,
  isExceptionResolution,
} from "@lib/sec203a/actions";
import {
  appendExceptionResolution,
  getExceptionReview,
} from "@lib/prototype-store";

const resolveBody = z.object({
  resolution: z.string().refine(isExceptionResolution, {
    message: `resolution must be one of: ${ExceptionResolutions.join(", ")}`,
  }),
  reasonCode: z.string().max(120).optional(),
  clientAttestation: z.literal(true),
});

type ResolveBody = z.infer<typeof resolveBody>;

function idFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("exceptions");
  return i >= 0 && parts[i + 1] ? parts[i + 1]! : null;
}

export const POST = bffMutate<ResolveBody>({
  action: "resolveException",
  source: "prototype-bff",
  upstreamGap: "G-008",
  parse: (body) => resolveBody.parse(body),
  apply: async (ctx) => {
    const accountId = ctx.auth.accountId;
    if (!accountId) {
      return {
        data: { ok: false, reason: "account_not_linked" },
        outcome: "blocked" as const,
        reasonCode: "account_not_linked",
        status: 412,
      };
    }
    const exceptionId = idFromUrl(ctx.req.url);
    if (!exceptionId) {
      return {
        data: { ok: false, reason: "exception_id_missing" },
        outcome: "rejected" as const,
        reasonCode: "exception_id_missing",
        status: 400,
      };
    }
    const existing = await getExceptionReview(accountId, exceptionId);
    if (!existing) {
      return {
        data: { ok: false, reason: "exception_not_found" },
        outcome: "rejected" as const,
        reasonCode: "exception_not_found",
        status: 404,
      };
    }
    if (existing.status !== "open") {
      return {
        data: { ok: false, reason: "exception_not_open" },
        outcome: "rejected" as const,
        reasonCode: "exception_not_open",
        status: 412,
      };
    }

    await appendExceptionResolution({
      accountId,
      exceptionId,
      resolution: ctx.input.resolution as (typeof ExceptionResolutions)[number],
      ...(ctx.input.reasonCode ? { reasonCode: ctx.input.reasonCode } : {}),
      clientAttestation: true,
      signedAt: new Date().toISOString(),
      authId: ctx.auth.authId,
      correlationId: ctx.correlationId,
    });

    return {
      data: {
        ok: true,
        exceptionId,
        resolution: ctx.input.resolution,
      },
      references: [
        `exception:${exceptionId}`,
        `resolution:${ctx.input.resolution}`,
      ],
    };
  },
});
