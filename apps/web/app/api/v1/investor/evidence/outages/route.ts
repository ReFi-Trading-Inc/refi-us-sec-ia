/**
 * GET /api/v1/investor/evidence/outages
 *
 * Platform-availability evidence (Rule 203A-2(e) allows only de minimis
 * outages). Skeleton today; backend telemetry feed is upstream.
 */
import { bffReadWithAccessLog } from "@lib/bff/handler";

export const GET = bffReadWithAccessLog({
  action: "viewEvidence",
  source: "prototype-bff",
  upstreamGap: "G-117",
  recordRef: () => "evidence:outages",
  fetch: () => ({
    kind: "outages" as const,
    notice: "Outage timeline is available in preview.",
    windows: [] as unknown[],
  }),
});
