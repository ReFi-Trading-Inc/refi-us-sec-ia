/**
 * POST /api/v1/investor/exceptions/[id]/resolve
 *
 * A MIXED legacy remediation surface (C0 audit §3: SPLIT_SIGNAL_MANAGED). The
 * six ExceptionResolution categories cross the Signal/Managed boundary:
 *
 *   Signal remediation — permitted at the signal stage (C1a-1):
 *     update_profile, reconnect_broker, acknowledge_disclosure
 *   Managed-era legacy — refused at the signal stage, category-checked FIRST.
 *     (The three gated spellings are deliberately not written here; the
 *     partition, with both halves named, lives in
 *     sec203a/release-policy.ts, which is tripwire-exempt for exactly that
 *     reason.)
 *
 * The category is constrained by ExceptionResolution, so payloads outside the
 * set are rejected at the BFF and generic per-trade approval remains
 * impossible by construction. What Managed exception semantics look like when
 * that release exists is deliberately NOT settled here — this route only
 * enforces today's partition (release-policy.ts). The UI never spells the
 * legacy backend identifiers; the mapping lives in
 * packages/api-clients/src/hooks/exceptions.ts.
 *
 * INVARIANT: action "resolveException" is globally Signal-allowed ONLY because
 * this route applies isExceptionResolutionPermitted. A contract assertion pins
 * this file as the sole user of the action.
 */
import { z } from "zod";
import { bffMutate } from "@lib/bff/handler";
import { isExceptionResolution } from "@lib/sec203a/actions";
import { GATED_UNTIL_MANAGED_PAPER } from "@lib/sec203a/admin-verbs";
import {
  isExceptionResolutionPermitted,
  SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS,
} from "@lib/sec203a/release-policy";
import { getServerEnv } from "@lib/config/env";
import {
  appendExceptionResolution,
  getExceptionReview,
} from "@lib/prototype-store";

/**
 * C2a structural narrowing: the ACCEPTED request surface is Signal
 * remediation only. A Managed-era category is no longer representable in the
 * September artifact's schema — it fails shape validation (400) before the
 * C1a-1 stage guard could even see it. The guard stays as defence in depth
 * (and the mechanical pin requires its invocation), and the broader
 * ExceptionResolutions taxonomy remains intact for audit history.
 */
const resolveBody = z.object({
  resolution: z
    .string()
    .refine(isExceptionResolution, {
      message: `resolution must be one of: ${SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS.join(", ")}`,
    })
    .refine(
      (r) =>
        (SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS as readonly string[]).includes(r),
      {
        message: `resolution must be one of: ${SIGNAL_ALLOWED_EXCEPTION_RESOLUTIONS.join(", ")}`,
      },
    ),
  reasonCode: z.string().max(120).optional(),
  clientAttestation: z.literal(true),
});

type ResolveBody = z.infer<typeof resolveBody>;

function idFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("exceptions");
  return parts[i + 1] ?? null;
}

export const POST = bffMutate<ResolveBody>({
  action: "resolveException",
  source: "prototype-bff",
  upstreamGap: "G-008",
  parse: (body) => resolveBody.parse(body),
  apply: async (ctx) => {
    // Category-level release policy (C1a-1), checked FIRST — before account
    // linkage and before the exception is looked up. resolveException is
    // Signal-allowed as an ACTION because three categories are Signal
    // remediation, but the three Managed categories are capability expansion
    // and are refused at the signal stage regardless of whether the exception
    // exists (the partition lives in release-policy.ts).
    // Policy before existence keeps the refusal id-independent and uniform.
    if (
      !isExceptionResolutionPermitted(
        ctx.input.resolution,
        getServerEnv().REFI_RELEASE_STAGE,
      )
    ) {
      return {
        refuse: "forbidden" as const,
        message: "This resolution is not available in Signal mode.",
        outcome: "blocked" as const,
        reasonCode: GATED_UNTIL_MANAGED_PAPER,
      };
    }

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
      resolution: ctx.input.resolution,
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
