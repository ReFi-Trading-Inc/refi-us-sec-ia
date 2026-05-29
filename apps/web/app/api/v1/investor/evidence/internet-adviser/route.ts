/**
 * GET /api/v1/investor/evidence/internet-adviser
 *
 * Examiner-facing evidence package: proves software-generated advice +
 * exclusive platform delivery + records exist. Today: skeleton projection
 * (G-117); access logged for completeness.
 */
import { bffReadWithAccessLog } from "@lib/bff/handler";

export const GET = bffReadWithAccessLog({
  action: "viewEvidence",
  source: "prototype-bff",
  upstreamGap: "G-117",
  recordRef: () => "evidence:internet-adviser",
  fetch: () => ({
    kind: "internet-adviser" as const,
    notice: "Evidence package is available in preview.",
    sections: {
      operationalInteractive: { present: false },
      softwareGeneratedAdvice: { present: false },
      exclusiveDelivery: { present: false },
      recordsRetention: { present: false },
    },
  }),
});
