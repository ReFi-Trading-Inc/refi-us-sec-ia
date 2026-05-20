/**
 * GET /api/v1/investor/orders/[client_order_id]/lineage
 *
 * Full advisory chain for a single order: intent → risk → plan → orders →
 * fills → records. Projection from Daniel's lifecycle (G-001); today empty
 * with a preview notice.
 *
 * Emits a record access log because the lineage view is, definitionally,
 * a record access — examiners read this.
 */
import { bffReadWithAccessLog } from "@lib/bff/handler";

function clientOrderIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("orders");
  return i >= 0 && parts[i + 1] ? parts[i + 1]! : null;
}

export const GET = bffReadWithAccessLog({
  action: "viewRecord",
  source: "prototype-bff",
  upstreamGap: "G-001",
  recordRef: (ctx) =>
    `order-lineage:${clientOrderIdFromUrl(ctx.req.url) ?? "unknown"}`,
  fetch: async (ctx) => {
    const id = clientOrderIdFromUrl(ctx.req.url);
    if (!id) return null;
    // Until backend wires, return a stub projection so the access log entry
    // is meaningful but the UI sees a clear preview state.
    return {
      clientOrderId: id,
      stages: [] as unknown[],
      notice: "Lineage data is available in preview.",
    };
  },
});
