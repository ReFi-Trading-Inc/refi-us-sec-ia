/**
 * Account event source — the contract's `streamAccountEvents` (SSE) as an
 * async iterable of validated `AccountEvent`s, behind one interface so the
 * BFF stream route is identical for the demo world and the frozen client.
 * Consumers must treat events as signals to refresh the named projection,
 * never as state (README: "refresh the corresponding GET projection when UI
 * correctness matters"; keepalives and duplicates are not state changes).
 */
import type { components } from "@refi/api-clients/generated/investor-api.gen";
import type { InvestorApiClient } from "@refi/api-clients/investor-api";

export type AccountEvent = components["schemas"]["AccountEvent"];

export interface InvestorApiEventSource {
  subscribe(
    accountId: string,
    lastEventId: string | undefined,
    signal: AbortSignal,
  ): AsyncIterable<AccountEvent>;
}

/** Wrap the frozen client's validated SSE stream. */
export function eventSourceFromClient(
  client: InvestorApiClient,
): InvestorApiEventSource {
  return {
    async *subscribe(accountId, lastEventId, signal) {
      const stream = await client.stream({
        path: { account_id: accountId },
        ...(lastEventId ? { lastEventId } : {}),
        signal,
      });
      const onAbort = () => {
        stream.cancel("client disconnected");
      };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        for await (const frame of stream.events) yield frame.event;
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}
