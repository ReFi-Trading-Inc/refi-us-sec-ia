/**
 * GET /api/v1/investor/activity/[id]
 */
import { bffRead } from "@lib/bff/handler";
import { listActionReceipts, listDecisionRecords } from "@lib/prototype-store";

function idFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("activity");
  return i >= 0 && parts[i + 1] ? parts[i + 1]! : null;
}

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-001",
  fetch: async (ctx) => {
    if (!ctx.auth) return { item: null };
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
