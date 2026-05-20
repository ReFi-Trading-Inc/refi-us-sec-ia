/**
 * GET /api/v1/investor/records
 *
 * Records Center index. Returns category counts + the most recent items in
 * each. Categories: disclosures, advisory, execution, broker, support, audit.
 *
 * This is a list endpoint, NOT a single-record fetch — so it does not emit a
 * RecordAccessLog entry. The /records/[id] route does.
 */
import { bffRead } from "@lib/bff/handler";
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

export const GET = bffRead<RecordsSummary>({
  source: "prototype-bff",
  upstreamGap: ["G-001", "G-005", "G-009"],
  fetch: async (ctx) => {
    if (!ctx.auth) {
      return {
        disclosures: { count: 0, recent: [] },
        advisory: { count: 0, recent: [] },
        actions: { count: 0, recent: [] },
        accesses: { count: 0, recent: [] },
        execution: { count: 0, recent: [], notice: "Available in preview." },
        broker: { count: 0, recent: [], notice: "Available in preview." },
        support: { count: 0, recent: [], notice: "Available in preview." },
        audit: { count: 0, recent: [], notice: "Available in preview." },
      };
    }
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
