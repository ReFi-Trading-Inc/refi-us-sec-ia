/**
 * Support intake — the same-origin BFF boundary for the investor support
 * channel, and the point at which the support boundary is enforced.
 *
 * Supports ReFi's intended Rule 203A-2(e) Internet Adviser posture. Designed to
 * prevent support personnel from becoming an alternate channel for
 * individualized investment advice; final regulatory treatment is subject to
 * counsel review.
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
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createRateLimiter } from "@app/_lib/rateLimit";
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

/**
 * Abuse protection, retained as defence in depth.
 *
 * The orphaned route this replaces had an IP limiter, and dropping it while
 * making the route REAL would have been a net loss: an authenticated caller can
 * otherwise drive unbounded blocked/rejected action receipts into the
 * append-only store.
 *
 * Deliberately in front of `bffMutate` rather than inside `apply`. The refusal
 * variant intentionally offers only forbidden / precondition_failed /
 * bad_request, and "too many requests" is none of those — routing it through
 * one of them would misreport the reason, while adding a fourth kind would
 * invent a new public error code for a concern the repository already answers
 * another way. `us/eligibility` and `investor/alpha-claim` both reply to a
 * limiter hit with a bare 429 JSON body, so this matches the established
 * convention exactly and leaves the BFF envelope untouched.
 *
 * Keyed by IP, like its siblings. That is not authentication and is not
 * claimed to be; it bounds volume, and authentication is enforced immediately
 * after by `bffMutate`.
 */
// Threshold preserved from the route this replaces. Workstream B restores the
// existing abuse control; it does not tune support policy. Revisit when the
// real sink and operational expectations exist.
const limiter = createRateLimiter({ windowMs: 60 * 60_000, max: 3 });

const handle = bffMutate<z.infer<typeof bodySchema>>({
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const { allowed } = limiter(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many support requests. Please wait before trying again." },
      { status: 429 },
    );
  }
  return handle(request);
}
