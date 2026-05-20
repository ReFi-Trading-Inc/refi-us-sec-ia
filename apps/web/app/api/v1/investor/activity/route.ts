/**
 * GET /api/v1/investor/activity
 *
 * Returns recent investor-visible activity. Today: projection from
 * InvestorActionReceipt + DecisionRecord. When Daniel's lifecycle tables
 * are reachable, this folds in real order / intent events.
 */
import { bffRead } from "@lib/bff/handler";
import { listActionReceipts, listDecisionRecords } from "@lib/prototype-store";

interface ActivityItem {
  id: string;
  kind: "action" | "advisory";
  at: string;
  summary: string;
  references: string[];
}

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-001",
  fetch: async (ctx) => {
    if (!ctx.auth) return { items: [] as ActivityItem[] };
    const [receipts, advisory] = await Promise.all([
      listActionReceipts({ authId: ctx.auth.authId, limit: 100 }),
      ctx.auth.accountId
        ? listDecisionRecords(ctx.auth.accountId)
        : Promise.resolve([]),
    ]);

    const items: ActivityItem[] = [];
    for (const r of receipts) {
      items.push({
        id: r.receiptId,
        kind: "action",
        at: r.emittedAt,
        summary: `${r.action} (${r.outcome})`,
        references: r.references,
      });
    }
    for (const a of advisory) {
      items.push({
        id: a.recordId,
        kind: "advisory",
        at: a.deliveredAt,
        summary: a.decisionSummary,
        references: [
          ...a.orderIds.map((o) => `order:${o}`),
          ...a.fillIds.map((f) => `fill:${f}`),
        ],
      });
    }
    items.sort((x, y) => y.at.localeCompare(x.at));
    return { items: items.slice(0, 200) };
  },
});
