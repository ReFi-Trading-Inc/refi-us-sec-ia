/**
 * GET /api/v1/investor/evidence/multi-client
 *
 * Active-client counter evidence (Rule 203A-2(e) requires >1 active client
 * on an ongoing basis). Skeleton today (G-006).
 */
import { bffReadWithAccessLog } from "@lib/bff/handler";
import { listActiveClientCount } from "@lib/prototype-store";

export const GET = bffReadWithAccessLog({
  action: "viewEvidence",
  source: "prototype-bff",
  upstreamGap: "G-006",
  recordRef: () => "evidence:multi-client",
  fetch: async () => {
    const activeClients = await listActiveClientCount();
    return {
      kind: "multi-client" as const,
      activeClients,
      meetsThreshold: activeClients > 1,
      notice:
        activeClients > 1
          ? undefined
          : "Active-client count is below the 203A-2(e) threshold; this is expected in preview.",
    };
  },
});
