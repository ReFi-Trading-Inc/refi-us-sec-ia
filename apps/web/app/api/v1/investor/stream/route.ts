/**
 * GET /api/v1/investor/stream
 *
 * Server-Sent Events bridge from the Admin Portal `/api/v1/stream` to the
 * investor client. Dark behind FLAG_ADMIN_PROXY_STREAM.
 *
 * Invariants (S4c, Sprint 2):
 *   - Auth is verified on connect. Anonymous or invalid session ⇒ 401.
 *   - Per-event account filtering happens in the transport module
 *     (endpoints/stream.ts). A cross-account event never reaches the
 *     browser.
 *   - Auth expiry mid-stream: the session cookie is re-verified on a
 *     15-second cadence and on every heartbeat. On failure the stream
 *     is closed with a final `event: auth_expired` line — never with a
 *     degraded identity fallback.
 *   - Strict envelope. If the upstream emits a shape we have not
 *     schema'd for, the strict parse throws and the stream terminates.
 *
 * The route does not use `bffRead` because that helper is JSON-oriented;
 * SSE requires long-lived `text/event-stream` responses that are not
 * envelope-wrapped. Auth, correlation, and CSP header behavior are
 * replicated inline.
 */
import type { NextRequest } from "next/server";
import { correlationIdFrom } from "@lib/bff/correlation";
import { getAuthContext } from "@lib/bff/auth";
import { admit, sessionKey } from "@lib/bff/rate-limit";
import { isEnabled } from "@lib/feature-flags";
import {
  fixtureEvents,
  openUpstreamStream,
  parseSseDataLine,
  streamUsesFixture,
} from "@lib/admin-portal-proxy/endpoints/stream"; // allow-investor-boundary: "admin-portal" reason: "import from proxy transport module; identifier is never rendered"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_RECHECK_MS = 15_000;
const HEARTBEAT_MS = 15_000;

function sseLine(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

function sseComment(text: string): Uint8Array {
  return new TextEncoder().encode(`: ${text}\n\n`);
}

export async function GET(req: NextRequest): Promise<Response> {
  const correlationId = correlationIdFrom(req);
  const headers = new Headers({
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store, no-transform",
    "x-correlation-id": correlationId,
    // Explicitly disable proxy buffering (nginx / Cloud Run).
    "x-accel-buffering": "no",
  });

  if (!isEnabled("FLAG_ADMIN_PROXY_STREAM")) {
    return new Response("stream disabled", { status: 404 });
  }

  const auth = await getAuthContext(req);
  if (!auth || !auth.accountId) {
    return new Response("unauthorized", { status: 401 });
  }
  const accountId = auth.accountId;

  // S6 rate limit: tighter on stream connects (3/60s/session). Cap
  // reconnection stampedes after a deploy while leaving established
  // streams untouched. Uses `admit` directly rather than the JSON
  // NextResponse builder because SSE clients don't parse envelopes.
  if (!admit("stream", sessionKey(req))) {
    return new Response("rate_limited", {
      status: 429,
      headers: { "retry-after": "60" },
    });
  }

  const upstreamAbort = new AbortController();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (bytes: Uint8Array): void => {
        if (closed) return;
        try {
          controller.enqueue(bytes);
        } catch {
          // controller already closed by the platform
          closed = true;
        }
      };

      const close = (reason?: string): void => {
        if (closed) return;
        closed = true;
        upstreamAbort.abort();
        if (reason) {
          try {
            controller.enqueue(sseLine("closed", { reason }));
          } catch {
            /* ignore */
          }
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      // Preamble: comment + ready event; tells the client the connection
      // is established even before upstream produces its first event.
      enqueue(sseComment("stream established"));
      enqueue(sseLine("ready", { correlationId, accountId }));

      const heartbeat = setInterval(() => {
        enqueue(sseComment("hb"));
      }, HEARTBEAT_MS);

      // Auth re-verify loop. Any failure closes the stream with an
      // auth_expired event — the client reconnects only after a new
      // sign-in, never by silently retrying with the same expired token.
      const recheck = setInterval(() => {
        void (async () => {
          try {
            const ctx = await getAuthContext(req);
            if (!ctx || ctx.accountId !== accountId) {
              close("auth_expired");
            }
          } catch {
            close("auth_expired");
          }
        })();
      }, AUTH_RECHECK_MS);

      // Detach cleanup so both intervals stop on any close path.
      const cleanup = (): void => {
        clearInterval(heartbeat);
        clearInterval(recheck);
      };

      try {
        if (streamUsesFixture()) {
          for (const ev of fixtureEvents(accountId)) {
            enqueue(sseLine(ev.eventType, ev));
          }
          // Fixture completes; keep the connection open on heartbeats
          // so the client can observe the same lifecycle as live mode.
        } else {
          const body = await openUpstreamStream({
            accountId,
            correlationId,
            signal: upstreamAbort.signal,
          });
          const reader = body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // SSE frames are separated by blank lines; split on \n and
            // process complete lines only, retaining the trailing partial.
            let idx: number;
            while ((idx = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, idx).replace(/\r$/, "");
              buffer = buffer.slice(idx + 1);
              try {
                const ev = parseSseDataLine(line, accountId);
                if (ev) enqueue(sseLine(ev.eventType, ev));
              } catch (err) {
                // Strict parse failure or JSON error: fail closed.
                const message =
                  err instanceof Error ? err.message : "parse error";
                close(`strict_envelope_violation:${message}`);
                break;
              }
            }
            if (closed) break;
          }
        }
      } catch (err) {
        if (!closed) {
          const message = err instanceof Error ? err.message : "upstream error";
          close(`upstream_error:${message}`);
        }
      } finally {
        cleanup();
        if (!closed) close("upstream_complete");
      }
    },
    cancel() {
      closed = true;
      upstreamAbort.abort();
    },
  });

  return new Response(stream, { status: 200, headers });
}
