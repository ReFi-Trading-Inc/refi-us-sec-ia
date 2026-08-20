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

const decimalInRange = (field: string, min: number, max: number) =>
  z
    .string()
    .refine(decimalStringRefiner, decimalStringMessage(field))
    .refine(
      (s) => {
        const n = Number(s);
        return Number.isFinite(n) && n >= min && n <= max;
      },
      `must be between ${String(min)} and ${String(max)}`,
    );

/**
 * Investor-editable fields only — the four Daniel approved (§4 of
 * docs/phase2-7-daniel-direction-resolution.md). The capital-allocation and
 * risk-limit controls that used to live here were removed on 2026-07-30:
 * `RiskLimits` and template limits are backend-owned and read-only, so
 * accepting them at this boundary would have let the BFF become the system of
 * record for guardrails the backend enforces.
 *
 * The BFF re-validates everything the UI validates, so a misbehaving client
 * cannot smuggle an out-of-range — or removed — value past the boundary.
 * Unknown keys are stripped by Zod's default object behaviour; the contract
 * assertion in scripts/contract-assertions.ts proves the removed control names
 * are not silently re-accepted.
 */
const draftBody = z.object({
  strategyId: z.string().min(1).max(64),
  accountScope: z.string().min(1).max(64),
  assetUniverse: z.array(z.string().min(1).max(64)).min(1).max(32),
  restrictedSectors: z.array(z.string().min(1).max(64)).max(32),
  // drift_threshold — decimal fraction, 0.1% to 25%.
  driftThreshold: decimalInRange("driftThreshold", 0.001, 0.25),
  // min_order — USD notional floor.
  minOrder: decimalInRange("minOrder", 1, 25000),
  // excluded_assets — opaque backend asset ids.
  excludedAssets: z.array(z.string().min(1).max(64)).max(64),
  // fractional_enabled
  fractionalEnabled: z.boolean(),
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
        driftThreshold: asDecimalString(ctx.input.driftThreshold),
        minOrder: asDecimalString(ctx.input.minOrder),
        excludedAssets: ctx.input.excludedAssets,
        fractionalEnabled: ctx.input.fractionalEnabled,
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
