/**
 * GET /api/v1/investor/disclosures
 *
 * Returns the disclosure registry + the user's acknowledgement state per doc.
 */
import { bffRead } from "@lib/bff/handler";
import {
  listDisclosureDocuments,
  listDisclosureAcksForUser,
} from "@lib/prototype-store";

export const GET = bffRead({
  source: "prototype-bff",
  upstreamGap: "G-005",
  fetch: async (ctx) => {
    const [documents, userAcks] = await Promise.all([
      listDisclosureDocuments(),
      ctx.auth
        ? listDisclosureAcksForUser(ctx.auth.authId)
        : Promise.resolve([]),
    ]);
    return { documents, userAcks };
  },
});
