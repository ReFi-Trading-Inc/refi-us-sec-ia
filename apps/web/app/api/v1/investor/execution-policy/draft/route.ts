/**
 * GET /api/v1/investor/execution-policy/draft
 *   → Returns the investor's working draft of the next Execution Policy.
 *     If none exists, returns a default-initialized draft (NOT persisted).
 *
 * PUT /api/v1/investor/execution-policy/draft
 *   → Persists the draft. Does NOT activate. Does NOT mutate the active
 *     ExecutionPolicy or ManagedExecutionState. Surface 3 activation is
 *     the only path that turns a draft into a signed policy version.
 */
import { z } from "zod";
import { bffRead, bffMutate } from "@lib/bff/handler";
import {
  defaultExecutionPolicyDraft,
  getExecutionPolicyDraft,
  saveExecutionPolicyDraft,
  type ExecutionPolicyDraft,
} from "@lib/prototype-store";
import {
  asDecimalString,
  decimalStringRefiner,
  decimalStringMessage,
  type DecimalString,
} from "@lib/sec203a/decimal";

// Numeric ranges mirror memory/handoff_phase2_surface2.md. UI validates with
// the same shape; the BFF re-validates so a misbehaving client cannot smuggle
// out-of-range values past the boundary.
const STALE_BROKER_DURATIONS = [
  "PT5M",
  "PT15M",
  "PT30M",
  "PT1H",
  "PT4H",
] as const;
const STALE_PROFILE_DURATIONS = [
  "P30D",
  "P60D",
  "P90D",
  "P180D",
  "P365D",
] as const;

const decimalUsdInRange = (min: number, max: number) =>
  z
    .string()
    .refine(decimalStringRefiner, decimalStringMessage("maxSingleOrderUsd"))
    .refine(
      (s) => {
        const n = Number(s);
        return Number.isFinite(n) && n >= min && n <= max;
      },
      `must be between ${min.toFixed(2)} and ${max.toFixed(2)} USD`,
    );

const draftBody = z.object({
  strategyId: z.string().min(1).max(64),
  accountScope: z.string().min(1).max(64),
  assetUniverse: z.array(z.string().min(1).max(64)).min(1).max(32),
  restrictedSectors: z.array(z.string().min(1).max(64)).max(32),
  maxSingleOrderUsd: decimalUsdInRange(25, 25000),
  maxPositionSizeBps: z.number().int().min(100).max(2500),
  minimumCashReserveBps: z.number().int().min(0).max(5000),
  dailyOrderLimit: z.number().int().min(1).max(25),
  dailyLossPauseBps: z.number().int().min(100).max(1000),
  drawdownPauseBps: z.number().int().min(300).max(3000),
  maxOpenOrders: z.number().int().min(1).max(20),
  staleBrokerDataPauseAfter: z.enum(STALE_BROKER_DURATIONS),
  staleProfilePauseAfter: z.enum(STALE_PROFILE_DURATIONS),
  pauseOnDisclosureSuperseded: z.boolean(),
  pauseOnProfileSuperseded: z.boolean(),
});

type DraftBody = z.infer<typeof draftBody>;

export const GET = bffRead<ExecutionPolicyDraft | null>({
  source: "prototype-bff",
  upstreamGap: "G-006",
  fetch: async (ctx) => {
    if (!("auth" in ctx) || !ctx.auth || !ctx.auth.accountId) return null;
    const existing = await getExecutionPolicyDraft(ctx.auth.accountId);
    if (existing) return existing;
    return defaultExecutionPolicyDraft(ctx.auth.accountId, ctx.correlationId);
  },
});

export const PUT = bffMutate<DraftBody>({
  action: "saveExecutionPolicyDraft",
  source: "prototype-bff",
  upstreamGap: "G-006",
  parse: (body) => draftBody.parse(body),
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
    const saved = await saveExecutionPolicyDraft({
      draft: {
        accountId,
        strategyId: ctx.input.strategyId,
        accountScope: ctx.input.accountScope,
        assetUniverse: ctx.input.assetUniverse,
        restrictedSectors: ctx.input.restrictedSectors,
        maxSingleOrderUsd: asDecimalString(ctx.input.maxSingleOrderUsd),
        maxPositionSizeBps: ctx.input.maxPositionSizeBps,
        minimumCashReserveBps: ctx.input.minimumCashReserveBps,
        dailyOrderLimit: ctx.input.dailyOrderLimit,
        dailyLossPauseBps: ctx.input.dailyLossPauseBps,
        drawdownPauseBps: ctx.input.drawdownPauseBps,
        maxOpenOrders: ctx.input.maxOpenOrders,
        staleBrokerDataPauseAfter: ctx.input.staleBrokerDataPauseAfter,
        staleProfilePauseAfter: ctx.input.staleProfilePauseAfter,
        pauseOnDisclosureSuperseded: ctx.input.pauseOnDisclosureSuperseded,
        pauseOnProfileSuperseded: ctx.input.pauseOnProfileSuperseded,
      },
      correlationId: ctx.correlationId,
    });
    return {
      data: saved,
      references: [`execution-policy-draft:${accountId}`],
    };
  },
});

// Reference the type so the unused-import lint doesn't strip it when the
// inferred return type already includes it.
export type _DecimalStringRef = DecimalString;
