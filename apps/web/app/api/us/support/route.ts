/**
 * Support intake — the same-origin BFF boundary for the investor support
 * channel, and the point at which SEC Rule 203A-2(e)(3) is enforced.
 *
 * ─── What this route used to be ────────────────────────────────────────────
 *
 * An orphan. Nothing called it. It authenticated nobody, classified nothing,
 * forwarded nowhere, and answered with a fabricated `tkt_${Date.now()}`.
 * Meanwhile the support page posted straight past it to
 * `${NEXT_PUBLIC_API_BASE_URL}/v1/support/ticket` from the browser, so no
 * server in this repository ever saw a support message. The browser-side
 * pattern check disabled the submit button and that was the entire control:
 * a direct POST, a script, or a modified bundle bypassed it completely.
 *
 * ─── What it is now ────────────────────────────────────────────────────────
 *
 *   browser -> POST /api/us/support (same origin)
 *           -> CSRF + authenticated session          (bffMutate)
 *           -> shape validation
 *           -> server classifies the RAW message     (authoritative)
 *           -> blocked: receipt + 403, sink NOT invoked
 *           -> allowed: forward to the support sink
 *
 * The browser still runs the same classifier for immediate feedback, but that
 * result is never transmitted and never trusted. The client sends only
 * `{ category, message }` — there is no `blocked` flag to forge, because the
 * server does not accept one.
 */
import { z } from "zod";
import { bffMutate } from "@lib/bff/handler";
import { classifySupportMessage } from "@lib/support-boundary";
import {
  submitSupportTicket,
  SupportSinkUnavailableError,
} from "@lib/support/sink";

const bodySchema = z.object({
  category: z.string().min(1).max(100),
  message: z.string().min(10).max(4000),
});

export const POST = bffMutate<z.infer<typeof bodySchema>>({
  action: "submitSupportRequest",
  parse: (json) => bodySchema.parse(json),
  apply: async ({ auth, correlationId, input }) => {
    // AUTHORITATIVE classification. Runs on the raw message, server-side, on
    // every request — including ones that never touched the UI.
    const verdict = classifySupportMessage(input.message);
    if (verdict.blocked) {
      // Refused before the sink is reached. The receipt records the stable
      // rule id and never the message, so the audit trail can show which rule
      // fired without retaining the investor's text.
      return {
        refuse: "forbidden" as const,
        message:
          "That request may involve client-specific investment advice, which " +
          "support cannot provide. Please review your recommendations in the " +
          "platform.",
        outcome: "blocked" as const,
        ...(verdict.ruleId ? { reasonCode: verdict.ruleId } : {}),
      };
    }

    try {
      const { ticketId } = await submitSupportTicket({
        authId: auth.authId,
        ...(auth.accountId ? { accountId: auth.accountId } : {}),
        category: input.category,
        message: input.message,
        correlationId,
      });
      return { data: { ticketId }, references: [ticketId] };
    } catch (err) {
      if (err instanceof SupportSinkUnavailableError) {
        // No sink is configured (D-SUPPORT-01). Say so rather than claiming a
        // ticket exists. The receipt records the attempt.
        return {
          refuse: "precondition_failed" as const,
          message:
            "Support requests cannot be submitted right now. Please email " +
            "support directly.",
          outcome: "rejected" as const,
          reasonCode: "support_sink_unavailable",
        };
      }
      throw err;
    }
  },
});
