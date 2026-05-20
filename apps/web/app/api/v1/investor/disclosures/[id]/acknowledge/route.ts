/**
 * POST /api/v1/investor/disclosures/[id]/acknowledge
 *
 * Records an ack for (user, doc_id, version). Idempotent.
 */
import { z } from "zod";
import { createHmac } from "node:crypto";
import { bffMutate } from "@lib/bff/handler";
import {
  appendDisclosureAck,
  getDisclosureDocument,
} from "@lib/prototype-store";

const ackBody = z.object({
  version: z.string().min(1),
});

type AckBody = z.infer<typeof ackBody>;

function safeHash(input: string | null | undefined): string {
  const secret = process.env["IP_HASH_SECRET"] ?? "dev-hash-secret";
  return createHmac("sha256", secret)
    .update(input ?? "")
    .digest("hex");
}

function paramFromUrl(url: string): string | null {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("disclosures");
  return i >= 0 && parts[i + 1] ? parts[i + 1]! : null;
}

export const POST = bffMutate<AckBody>({
  action: "acknowledgeDisclosure",
  source: "prototype-bff",
  upstreamGap: "G-005",
  parse: (body) => ackBody.parse(body),
  apply: async (ctx) => {
    const docId = paramFromUrl(ctx.req.url);
    if (!docId) {
      throw new Error("Disclosure id missing from URL.");
    }
    const doc = await getDisclosureDocument(docId, ctx.input.version);
    if (!doc) {
      return {
        data: { ok: false, reason: "document_not_found" },
        outcome: "rejected" as const,
        reasonCode: "document_not_found",
        status: 404,
      };
    }
    if (doc.displayStatus === "pending_registration") {
      return {
        data: { ok: false, reason: "document_pending_registration" },
        outcome: "blocked" as const,
        reasonCode: "document_pending_registration",
        status: 409,
      };
    }
    const ip = ctx.req.headers.get("x-real-ip") ?? "unknown";
    const ua = ctx.req.headers.get("user-agent") ?? "";
    const { ack, created } = await appendDisclosureAck({
      userId: ctx.auth.authId,
      docId,
      version: ctx.input.version,
      acceptanceSource: "web",
      ipHash: safeHash(ip),
      userAgentHash: safeHash(ua),
      correlationId: ctx.correlationId,
    });
    return {
      data: { ok: true, created, ack },
      references: [`disclosure-ack:${docId}/${ctx.input.version}`],
    };
  },
});
