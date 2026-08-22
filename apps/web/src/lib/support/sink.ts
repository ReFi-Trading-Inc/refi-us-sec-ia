/**
 * Support-sink seam.
 *
 * The narrowest possible boundary between "we accepted a support request" and
 * "somebody durably owns it", so the upstream target can change without
 * touching the classification boundary in front of it.
 *
 * ─── Why there is no HTTP client here ──────────────────────────────────────
 *
 * There is no configured upstream sink, and no invented one either. The
 * previous browser-direct path posted to `${NEXT_PUBLIC_API_BASE_URL}/v1/
 * support/ticket`, an endpoint this repository does not implement and whose
 * status is unknown — it may be real, provisional, or obsolete. That is open
 * question D-SUPPORT-01. Guessing an endpoint, payload, and auth scheme would
 * repeat the mistake of inventing a backend contract and would have to be
 * unwound when the real one arrives.
 *
 * So the live implementation FAILS CLOSED. Support is honestly unavailable
 * rather than falsely successful.
 *
 * ─── What it must never do ─────────────────────────────────────────────────
 *
 * It must never fabricate a ticket id. The route it replaced returned
 * `tkt_${Date.now()}` and told the investor "Request submitted" while nothing
 * was created anywhere — a release-candidate product cannot claim a support
 * ticket exists when it does not.
 *
 * It must never forward session cookies, session JWTs, or BFF user assertions
 * to an unknown sink. When the real sink is defined, it gets its own credential.
 */

export interface SupportTicketSubmission {
  /** Stable opaque auth id. Never an email or wallet address. */
  readonly authId: string;
  readonly accountId?: string;
  readonly category: string;
  /**
   * The raw investor message. Passed to the sink and to nothing else — never
   * logged, never placed in a receipt, never emitted as telemetry.
   */
  readonly message: string;
  readonly correlationId: string;
}

export interface SupportTicketResult {
  readonly ticketId: string;
}

export class SupportSinkUnavailableError extends Error {
  constructor() {
    super(
      "No support ticket sink is configured. The upstream endpoint, auth, and " +
        "request/response contract are unresolved (D-SUPPORT-01), so the " +
        "request is refused rather than reported as submitted.",
    );
    this.name = "SupportSinkUnavailableError";
  }
}

export type SupportSink = (
  submission: SupportTicketSubmission,
) => Promise<SupportTicketResult>;

const liveSink: SupportSink = () => {
  throw new SupportSinkUnavailableError();
};

let sink: SupportSink = liveSink;

/**
 * Test seam. The e2e and unit suites install a deterministic sink so the
 * classification boundary can be exercised end to end without a real backend —
 * and so a test can assert the sink was NOT invoked for a blocked request.
 *
 * Deliberately not driven by an env var: a configuration flag that swaps in a
 * fake ticket pipeline is exactly the kind of thing that survives into a
 * deployed tier by accident.
 */
export function __setSupportSinkForTests(next: SupportSink | null): void {
  sink = next ?? liveSink;
}

export async function submitSupportTicket(
  submission: SupportTicketSubmission,
): Promise<SupportTicketResult> {
  return sink(submission);
}
