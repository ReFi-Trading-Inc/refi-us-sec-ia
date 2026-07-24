/**
 * GET /api/v1/investor/activity/[id]
 *
 * S4c completeness: every single-record fetch emits a RecordAccessLog
 * entry keyed to `activity:<id>` before the fetch runs, so the intent
 * to view is logged even when the id resolves to no record (404).
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bffReadWithAccessLog } from "@lib/bff/handler";
import { correlationIdFrom } from "@lib/bff/correlation";
import { getAuthContext } from "@lib/bff/auth";
import { listActionReceipts, listDecisionRecords } from "@lib/prototype-store";

function idFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("activity");
  if (i < 0) return null;
  return parts[i + 1] ?? null;
}

const wrapped = bffReadWithAccessLog<{ item: unknown }>({
  action: "viewRecord",
  source: "prototype-bff",
  upstreamGap: "G-001",
  recordRef: (ctx) => `activity:${idFromUrl(ctx.req.url) ?? "unknown"}`,
  fetch: async (ctx) => {
    const id = idFromUrl(ctx.req.url);
    if (!id) return { item: null };
    const receipts = await listActionReceipts({ authId: ctx.auth.authId });
    const r = receipts.find((x) => x.receiptId === id);
    if (r) return { item: { kind: "action" as const, ...r } };
    if (ctx.auth.accountId) {
      const advisory = await listDecisionRecords(ctx.auth.accountId);
      const a = advisory.find((x) => x.recordId === id);
      if (a) return { item: { kind: "advisory" as const, ...a } };
    }
    return { item: null };
  },
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthContext(req);
  if (!auth) {
    const correlationId = correlationIdFrom(req);
    return NextResponse.json(
      { data: { item: null }, source: "prototype-bff", correlationId },
      { status: 200 },
    );
  }
  return wrapped(req);
}
