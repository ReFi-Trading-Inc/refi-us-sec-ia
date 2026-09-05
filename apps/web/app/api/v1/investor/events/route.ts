/**
 * GET /api/v1/investor/events — same-origin Server-Sent Events.
 *
 * Forwards the backend's account event stream (`streamAccountEvents`,
 * v1.1.0-alpha.2) to the browser: one `id:`/`event:`/`data:` frame per
 * validated `AccountEvent`, `Last-Event-ID` resume forwarded exactly, a comment
 * keepalive every 15 s, closed when the browser disconnects. The browser never
 * opens the upstream stream itself and never supplies an account id: the
 * session is verified here and the account scope is re-authorized against
 * `listAccounts`. Events are refresh SIGNALS; the UI refetches projections.
 * Read-only; nothing here mutates.
 */
import type { NextRequest } from "next/server";
import { getAuthContext } from "@lib/bff/auth";
import { correlationIdFrom } from "@lib/bff/correlation";
import {
  investorApiClientFor,
  investorApiEventSourceFor,
} from "@lib/investor-api/gateway";
import { resolveAccountScope } from "@lib/investor-api/account-scope";
import { classifyUpstream } from "@lib/investor-api/upstream-state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEEPALIVE_MS = 15_000;
const encoder = new TextEncoder();

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await getAuthContext(req);
  if (!auth) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required" } },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    );
  }
  const correlationId = correlationIdFrom(req);
  let accountId: string;
  let source;
  try {
    const client = investorApiClientFor(auth);
    accountId = await resolveAccountScope(client, auth);
    source = investorApiEventSourceFor(auth);
  } catch (err) {
    return Response.json(
      { data: { upstream: classifyUpstream(err) } },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }
  const lastEventId = req.headers.get("last-event-id") ?? undefined;
  const controller = new AbortController();
  req.signal.addEventListener(
    "abort",
    () => {
      controller.abort();
    },
    { once: true },
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (s: string) => {
        ctrl.enqueue(encoder.encode(s));
      };
      send(`: connected ${correlationId}\n\n`);
      const keepalive = setInterval(() => {
        try {
          send(`: keepalive ${new Date().toISOString()}\n\n`);
        } catch {
          clearInterval(keepalive);
        }
      }, KEEPALIVE_MS);
      try {
        for await (const ev of source.subscribe(
          accountId,
          lastEventId,
          controller.signal,
        )) {
          send(
            `id: ${ev.event_id}\nevent: ${ev.event_type}\ndata: ${JSON.stringify(ev)}\n\n`,
          );
        }
      } catch (err) {
        send(
          `event: upstream\ndata: ${JSON.stringify({ upstream: classifyUpstream(err) })}\n\n`,
        );
      } finally {
        clearInterval(keepalive);
        try {
          ctrl.close();
        } catch {
          // already closed by the client
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "private, no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-correlation-id": correlationId,
    },
  });
}
