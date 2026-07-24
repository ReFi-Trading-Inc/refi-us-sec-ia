/**
 * GET /api/v1/investor/activity
 *
 * Returns recent investor-visible activity. Today: projection from
 * InvestorActionReceipt + DecisionRecord. When Daniel's lifecycle tables
 * are reachable, this folds in real order / intent events.
 *
 * S4c completeness: authed reads emit a RecordAccessLog entry keyed to
 * `activity:index`; anonymous callers receive an empty projection and
 * leave no entry, so unauthenticated hits never appear in the compliance
 * log as "record accessed".
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bffReadWithAccessLog } from "@lib/bff/handler";
import { correlationIdFrom } from "@lib/bff/correlation";
import { getAuthContext } from "@lib/bff/auth";
import { listActionReceipts, listDecisionRecords } from "@lib/prototype-store";

interface ActivityItem {
  id: string;
  kind: "action" | "advisory";
  at: string;
  summary: string;
  references: string[];
}

const wrapped = bffReadWithAccessLog<{ items: ActivityItem[] }>({
  action: "viewRecord",
  source: "prototype-bff",
  upstreamGap: "G-001",
  recordRef: () => "activity:index",
  fetch: async (ctx) => {
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthContext(req);
  if (!auth) {
    const correlationId = correlationIdFrom(req);
    return NextResponse.json(
      { data: { items: [] }, source: "prototype-bff", correlationId },
      { status: 200 },
    );
  }
  return wrapped(req);
}
