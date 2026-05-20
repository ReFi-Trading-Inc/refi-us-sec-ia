/**
 * GET /api/v1/investor/records/[id]
 *
 * Single-record lookup. Resolves against ack / decision-record / receipt
 * stores. Emits a RecordAccessLog entry (NOT an InvestorActionReceipt) —
 * view/download/export are accesses, not state-changing actions.
 */
import { bffReadWithAccessLog } from "@lib/bff/handler";
import {
  listDisclosureAcksForUser,
  listDecisionRecords,
  listActionReceipts,
} from "@lib/prototype-store";

function idFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("records");
  return i >= 0 && parts[i + 1] ? parts[i + 1]! : null;
}

export const GET = bffReadWithAccessLog({
  action: "viewRecord",
  source: "prototype-bff",
  upstreamGap: "G-009",
  recordRef: (ctx) => `record:${idFromUrl(ctx.req.url) ?? "unknown"}`,
  fetch: async (ctx) => {
    const id = idFromUrl(ctx.req.url);
    if (!id) return null;
    const [acks, receipts, advisory] = await Promise.all([
      listDisclosureAcksForUser(ctx.auth.authId),
      listActionReceipts({ authId: ctx.auth.authId }),
      ctx.auth.accountId
        ? listDecisionRecords(ctx.auth.accountId)
        : Promise.resolve([]),
    ]);
    return (
      receipts.find((r) => r.receiptId === id) ??
      advisory.find((a) => a.recordId === id) ??
      acks.find((a) => `${a.docId}:${a.version}` === id) ??
      null
    );
  },
});
