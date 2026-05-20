/**
 * GET /api/v1/investor/orders
 *
 * Read model of orders sent by the system on the investor's behalf under
 * the active execution policy. Today: empty / preview. When backend
 * lifecycle wires (G-001), projects from Daniel's Orders + OrderEvents.
 */
import { bffRead } from "@lib/bff/handler";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-001",
  fetch: async (ctx) => {
    if (!ctx.auth || !ctx.auth.accountId) {
      return { items: [], notice: "Sign in to view orders." };
    }
    return {
      items: [] as unknown[],
      notice: "Order projections are available in preview.",
    };
  },
});
