/**
 * GET /api/v1/investor/records
 *
 * Records Center index. Returns category counts + the most recent items in
 * each. Categories: disclosures, advisory, execution, broker, support, audit.
 *
 * S4c completeness: every records/documents read path writes a
 * RecordAccessLog entry, including the index browse. The recordRef marks
 * the view as `records:index` so an auditor can distinguish index browses
 * from single-record fetches under `/records/[id]`. Anonymous callers get
 * an empty preview and no access-log entry, so unauthenticated hits never
 * appear in the compliance log as "record accessed".
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bffReadWithAccessLog } from "@lib/bff/handler";
import { correlationIdFrom } from "@lib/bff/correlation";
import { getAuthContext } from "@lib/bff/auth";
import {
  listDisclosureAcksForUser,
  listDecisionRecords,
  listActionReceipts,
  listRecordAccesses,
} from "@lib/prototype-store";

interface RecordsSummary {
  disclosures: { count: number; recent: unknown[] };
  advisory: { count: number; recent: unknown[] };
  actions: { count: number; recent: unknown[] };
  accesses: { count: number; recent: unknown[] };
  execution: { count: number; recent: unknown[]; notice: string };
  broker: { count: number; recent: unknown[]; notice: string };
  support: { count: number; recent: unknown[]; notice: string };
  audit: { count: number; recent: unknown[]; notice: string };
}

const EMPTY: RecordsSummary = {
  disclosures: { count: 0, recent: [] },
  advisory: { count: 0, recent: [] },
  actions: { count: 0, recent: [] },
  accesses: { count: 0, recent: [] },
  execution: { count: 0, recent: [], notice: "Available in preview." },
  broker: { count: 0, recent: [], notice: "Available in preview." },
  support: { count: 0, recent: [], notice: "Available in preview." },
  audit: { count: 0, recent: [], notice: "Available in preview." },
};

const wrapped = bffReadWithAccessLog<RecordsSummary>({
  action: "viewRecord",
  source: "prototype-bff",
  upstreamGap: ["G-001", "G-005", "G-009"],
  recordRef: () => "records:index",
  fetch: async (ctx) => {
    const [acks, advisory, receipts, accesses] = await Promise.all([
      listDisclosureAcksForUser(ctx.auth.authId),
      ctx.auth.accountId
        ? listDecisionRecords(ctx.auth.accountId)
        : Promise.resolve([]),
      listActionReceipts({ authId: ctx.auth.authId, limit: 200 }),
      listRecordAccesses({ authId: ctx.auth.authId, limit: 50 }),
    ]);
    return {
      disclosures: { count: acks.length, recent: acks.slice(0, 5) },
      advisory: { count: advisory.length, recent: advisory.slice(0, 5) },
      actions: { count: receipts.length, recent: receipts.slice(0, 10) },
      accesses: { count: accesses.length, recent: accesses.slice(0, 10) },
      execution: { count: 0, recent: [], notice: "Available in preview." },
      broker: { count: 0, recent: [], notice: "Available in preview." },
      support: { count: 0, recent: [], notice: "Available in preview." },
      audit: { count: 0, recent: [], notice: "Available in preview." },
    };
  },
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthContext(req);
  if (!auth) {
    const correlationId = correlationIdFrom(req);
    return NextResponse.json(
      { data: EMPTY, source: "prototype-bff", correlationId },
      { status: 200 },
    );
  }
  return wrapped(req);
}
