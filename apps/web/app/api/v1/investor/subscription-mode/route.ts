/**
 * GET  /api/v1/investor/subscription-mode — current mode (signal | managed | null).
 * POST /api/v1/investor/subscription-mode — set mode (selectMode action).
 *
 * Switching Managed → Signal requires automation to be paused first.
 */
import { z } from "zod";
import { bffRead, bffMutate } from "@lib/bff/handler";
import {
  getSubscriptionMode,
  setSubscriptionMode,
  getManagedExecutionState,
  type SubscriptionMode,
} from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-006",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) return null;
    return getSubscriptionMode(ctx.auth.accountId);
  },
});

const modeBody = z.object({
  mode: z.enum(["signal", "managed"]),
});

type ModeBody = z.infer<typeof modeBody>;

export const POST = bffMutate<ModeBody>({
  action: "selectMode",
  source: "prototype-bff",
  upstreamGap: "G-006",
  parse: (body) => modeBody.parse(body),
  apply: async (ctx) => {
    if (!ctx.auth.accountId) {
      return {
        data: { ok: false, reason: "account_not_linked" },
        outcome: "blocked" as const,
        reasonCode: "account_not_linked",
        status: 412,
      };
    }
    const accountId = ctx.auth.accountId;
    const current = await getSubscriptionMode(accountId);

    // Managed → Signal: managed execution must be paused first.
    if (current?.mode === "managed" && ctx.input.mode === "signal") {
      const mes = await getManagedExecutionState(accountId);
      if (mes && mes.status === "active") {
        return {
          data: { ok: false, reason: "pause_required" },
          outcome: "blocked" as const,
          reasonCode: "pause_required",
          status: 412,
        };
      }
    }

    const next: SubscriptionMode = ctx.input.mode;
    const stored = await setSubscriptionMode({
      accountId,
      mode: next,
      correlationId: ctx.correlationId,
    });
    return {
      data: stored,
      references: [`subscription-mode:${accountId}`],
    };
  },
});
