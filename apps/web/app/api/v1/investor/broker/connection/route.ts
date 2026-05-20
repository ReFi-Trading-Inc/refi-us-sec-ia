/**
 * GET /api/v1/investor/broker/connection
 *
 * Returns the broker connection projection (status only — credentials never
 * cross this boundary).
 */
import { bffRead } from "@lib/bff/handler";
import { getBrokerageConnection } from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-001",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) return null;
    return getBrokerageConnection(ctx.auth.accountId);
  },
});
