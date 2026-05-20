/**
 * GET /api/v1/investor/execution-policy — latest version of the active
 *                                          execution policy (or null).
 * PUT /api/v1/investor/execution-policy — propose an updated policy. Returns
 *                                          a draft preview without committing;
 *                                          activation goes through /activate.
 */
import { z } from "zod";
import { bffRead, bffMutate } from "@lib/bff/handler";
import { getLatestExecutionPolicy } from "@lib/prototype-store";
import {
  decimalStringRefiner,
  decimalStringMessage,
} from "@lib/sec203a/decimal";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-006",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) return null;
    return getLatestExecutionPolicy(ctx.auth.accountId);
  },
});

const updateBody = z.object({
  strategyId: z.string().min(1),
  accountScope: z.string().min(1),
  assetUniverse: z.array(z.string().min(1)).min(1),
  driftThreshold: z
    .string()
    .refine(decimalStringRefiner, decimalStringMessage("driftThreshold"))
    .optional(),
  rebalanceFrequency: z.string().optional(),
  maxOrderSize: z
    .string()
    .refine(decimalStringRefiner, decimalStringMessage("maxOrderSize"))
    .optional(),
  maxTurnover: z
    .string()
    .refine(decimalStringRefiner, decimalStringMessage("maxTurnover"))
    .optional(),
  pauseRules: z.array(z.string()).default([]),
  notificationPreferences: z.array(z.string()).default([]),
  restrictionsHash: z.string().min(1),
  riskGuardrailHash: z.string().min(1),
});

type UpdateBody = z.infer<typeof updateBody>;

/**
 * PUT returns a draft preview, NOT a committed policy. Committing requires
 * /activate so the activation preconditions run as a single atomic step.
 */
export const PUT = bffMutate<UpdateBody>({
  action: "updateExecutionPolicy",
  source: "prototype-bff",
  upstreamGap: "G-006",
  parse: (body) => updateBody.parse(body),
  apply: async (ctx) => {
    return {
      data: {
        draftPreview: ctx.input,
        note: "Draft preview only. Call /api/v1/investor/execution-policy/activate to sign and commit a new policy version.",
      },
      references: [],
    };
  },
});
