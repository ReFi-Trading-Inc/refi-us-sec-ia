/**
 * GET /api/v1/investor/orders/[client_order_id]/lineage
 *
 * PR-G Records Center lineage — an OrderLifecycleProjection composing
 * the full correlation spine (correlation_id, action_id, intent_id,
 * plan_id, order_id, client_order_id, broker_order_id, attempt_id,
 * fill_id, reconciliation_run_id) per Contract V3 §7.10.
 *
 * The route is dark behind FLAG_RECORDS_CENTER_SPINE until Sprint 4;
 * with the flag off it returns the historical stub preview so existing
 * UI paths continue to work.
 *
 * Emits a RecordAccessLog entry on every fetch (S4c completeness) —
 * examiners read this view.
 */
import { bffReadWithAccessLog } from "@lib/bff/handler";
import { isEnabled } from "@lib/feature-flags";
import { fetchOrderLifecycle } from "@lib/admin-portal-proxy/endpoints/order-lifecycle"; // allow-investor-boundary: "admin-portal" reason: "import from proxy transport module; identifier never rendered"

function clientOrderIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("orders");
  return parts[i + 1] ?? null;
}

export const GET = bffReadWithAccessLog({
  action: "viewRecord",
  source: "prototype-bff",
  upstreamGap: "G-001",
  recordRef: (ctx) =>
    `order-lineage:${clientOrderIdFromUrl(ctx.req.url) ?? "unknown"}`,
  fetch: async (ctx) => {
    const clientOrderId = clientOrderIdFromUrl(ctx.req.url);
    if (!clientOrderId) return null;

    // Dark-mode: keep the historical preview shape so no existing spec
    // that fetches this route regresses. Sprint 4 lights the flag on
    // and the projection is composed from the upstream.
    if (!isEnabled("FLAG_RECORDS_CENTER_SPINE") || !ctx.auth.accountId) {
      return {
        clientOrderId,
        stages: [] as unknown[],
        notice: "Lineage data is available in preview.",
      };
    }

    const projection = await fetchOrderLifecycle({
      accountId: ctx.auth.accountId,
      correlationId: ctx.correlationId,
      clientOrderId,
    });
    if (!projection) return null;
    return { clientOrderId, projection };
  },
});
