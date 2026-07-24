/**
 * Admin-portal-proxy: SSE bridge (S4, Sprint 2).
 *
 * Proxies the upstream Admin Portal event stream to the investor with
 * two invariants enforced at the transport seam, not at the render layer:
 *
 *   1. Per-event account filtering. Every event carries an `account_id`
 *      in its payload; events that do not match the caller's authoritative
 *      account are dropped before they leave the BFF. There is no client-
 *      side filter; a cross-account event never reaches the browser.
 *   2. Strict envelope. The wire event is Zod-parsed with `.strict()` so
 *      an upstream field the redaction layer has not been taught about
 *      halts the stream (fail closed) rather than passes through.
 *
 * Auth expiry mid-stream is handled by the route handler, which arms a
 * periodic re-verify of the session cookie and closes the connection on
 * failure. The bridge itself is stateless.
 *
 * Fixture path: when the entity backing for `intents` (used as a proxy for
 * stream availability) resolves to `msw`, we serve a small canned event
 * cycle for the caller's account, so E2E and dev can exercise the bridge
 * without upstream. This is not a mock of the upstream stream; it is a
 * deterministic fixture that exercises the projection and filter code.
 */
import { z } from "zod";
import { getServerEnv } from "../../config/env";
import { backingFor } from "../../config/backing";

/**
 * Wire envelope for a single SSE event from the Admin Portal stream.
 * Kept intentionally narrow: id, event type, ISO timestamp, account
 * scope, and a projection-shaped payload. Anything else must be added
 * here explicitly or the strict parse will reject it.
 */
export const wireStreamEventSchema = z
  .object({
    event_id: z.string().min(1),
    event_type: z.string().min(1),
    ts: z.string().min(1),
    account_id: z.string().min(1),
    correlation_id: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type WireStreamEvent = z.infer<typeof wireStreamEventSchema>;

export interface InvestorStreamEvent {
  eventId: string;
  eventType: string;
  ts: string;
  accountId: string;
  correlationId?: string;
  payload?: Record<string, unknown>;
}

export function project(wire: WireStreamEvent): InvestorStreamEvent {
  const out: InvestorStreamEvent = {
    eventId: wire.event_id,
    eventType: wire.event_type,
    ts: wire.ts,
    accountId: wire.account_id,
  };
  if (wire.correlation_id !== undefined)
    out.correlationId = wire.correlation_id;
  if (wire.payload !== undefined) out.payload = wire.payload;
  return out;
}

/**
 * Parse a single line from an SSE stream as a wire event. Returns the
 * projected event on success, null on lines that are not `data:` events
 * (comments, retry directives, blank lines). Throws on strict-parse
 * failure so the route handler closes the connection.
 */
export function parseSseDataLine(
  line: string,
  accountId: string,
): InvestorStreamEvent | null {
  if (!line.startsWith("data:")) return null;
  const body = line.slice(5).trim();
  if (body.length === 0) return null;
  const json: unknown = JSON.parse(body);
  const wire = wireStreamEventSchema.parse(json);
  // Per-event account filter. This is the primary cross-account defense.
  if (wire.account_id !== accountId) return null;
  return project(wire);
}

/**
 * Return true if the SSE bridge should draw events from a canned fixture
 * rather than upstream. Keyed to the intents entity backing because the
 * two ship live together in Sprint 5.
 */
export function streamUsesFixture(): boolean {
  return backingFor("intents") === "msw";
}

/**
 * Deterministic fixture stream for the given account. Yields a short
 * warm-up sequence (heartbeat, intent, risk decision, order) then stops.
 * Called only when `streamUsesFixture()` returns true.
 */
export function* fixtureEvents(
  accountId: string,
): Generator<InvestorStreamEvent> {
  const now = new Date().toISOString();
  const base = { accountId, ts: now };
  yield { ...base, eventId: `hb-${accountId}-0`, eventType: "heartbeat" };
  yield {
    ...base,
    eventId: `intent-${accountId}-0`,
    eventType: "intent.created",
    payload: { status: "pending" },
  };
  yield {
    ...base,
    eventId: `risk-${accountId}-0`,
    eventType: "risk_decision.recorded",
    payload: { outcome: "approved" },
  };
  yield {
    ...base,
    eventId: `order-${accountId}-0`,
    eventType: "order.acknowledged",
    payload: { status: "acked" },
  };
}

/**
 * Open the upstream SSE connection. Returns a ReadableStream of decoded
 * text lines. Fails closed on non-2xx upstream response.
 *
 * Callers must abort the returned response body when they close their
 * own stream to release the upstream socket; the `signal` parameter is
 * forwarded to fetch so this happens automatically when the outer route
 * response is aborted.
 */
export async function openUpstreamStream(args: {
  accountId: string;
  correlationId: string;
  signal: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const env = getServerEnv();
  const url = new URL("/api/v1/stream", env.ADMIN_PORTAL_BASE_URL);
  url.searchParams.set("account_id", args.accountId);
  const res = await fetch(url, {
    method: "GET",
    signal: args.signal,
    headers: {
      "x-correlation-id": args.correlationId,
      "x-investor-account-id": args.accountId,
      authorization: `Bearer ${env.ADMIN_PORTAL_SERVICE_TOKEN}`,
      accept: "text/event-stream",
    },
  });
  if (!res.ok || !res.body) {
    throw new Error(
      `stream upstream returned ${String(res.status)} (path=/api/v1/stream)`,
    );
  }
  return res.body;
}
