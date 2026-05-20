/**
 * GET  /api/v1/investor/profile — return latest immutable snapshot (or null).
 * POST /api/v1/investor/profile — promote a profile draft to a new immutable
 *                                  snapshot, refreshProfile action.
 */
import { z } from "zod";
import { bffRead, bffMutate } from "@lib/bff/handler";
import {
  appendProfileSnapshot,
  getLatestProfileSnapshot,
  type InvestorProfileFields,
} from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-003",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) return null;
    return getLatestProfileSnapshot(ctx.auth.accountId);
  },
});

const profileBody = z.object({
  goal: z.string().min(1),
  horizon: z.string().min(1),
  incomeBand: z.string().min(1),
  liquidityNeed: z.string().min(1),
  riskTolerance: z.string().min(1),
  experience: z.string().min(1),
  accountPurpose: z.string().min(1),
  restrictions: z.string().optional(),
});

export const POST = bffMutate<InvestorProfileFields>({
  action: "refreshProfile",
  source: "prototype-bff",
  upstreamGap: "G-003",
  parse: (body) => profileBody.parse(body),
  apply: async (ctx) => {
    if (!ctx.auth.accountId) {
      return {
        data: { ok: false, reason: "account_not_linked" },
        outcome: "blocked" as const,
        reasonCode: "account_not_linked",
        status: 412,
      };
    }
    const snapshot = await appendProfileSnapshot({
      accountId: ctx.auth.accountId,
      fields: ctx.input,
      correlationId: ctx.correlationId,
    });
    return {
      data: snapshot,
      references: [
        `advisory-profile:${snapshot.accountId}/v${snapshot.profileVersion}`,
      ],
      status: 201,
    };
  },
});
