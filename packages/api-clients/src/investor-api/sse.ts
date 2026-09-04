/**
 * Incremental Server-Sent Events parser over a `ReadableStream<Uint8Array>`.
 *
 * Server-only. Follows the WHATWG event-stream parsing rules that matter for
 * a contract consumer:
 *
 * - lines end with CRLF, LF, or a lone CR; a CR at the very end of the input
 *   received so far is held until the next chunk shows whether an LF follows;
 * - an event is dispatched ONLY by a blank line — an incomplete event at end
 *   of stream is discarded, never dispatched;
 * - comment lines (`:` prefix) and events with no `data` (keepalives) change
 *   no state and are never yielded;
 * - `id:` persists as the last event id until the next `id:`; an `id:` value
 *   containing U+0000 is ignored (the previous id stays in effect);
 * - a single leading space after the field colon is stripped; multiple
 *   `data:` lines join with LF.
 *
 * Buffering is bounded on what is actually PENDING: the incomplete current
 * line plus the `data` accumulated for the undispatched event. A large chunk
 * that carries many complete frames is processed frame by frame and never
 * trips the cap; one genuinely oversized unfinished event does.
 */

export interface SseFrame {
  /** Last event id in effect for this frame (persisted per the SSE spec). */
  readonly id: string | null;
  readonly event: string | null;
  readonly data: string;
}

export interface SseParseOptions {
  signal?: AbortSignal;
  /**
   * Cap on pending state: the incomplete line buffer plus the current
   * undispatched event's accumulated `data`. Exceeding it is a protocol fault.
   */
  maxPendingChars?: number;
}

export const DEFAULT_MAX_PENDING_CHARS = 256 * 1024;

export class SseProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SseProtocolError";
  }
}

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const NUL = String.fromCharCode(0);

/**
 * Find the end of the next complete line in `buffer`.
 * Returns `[lineEnd, terminatorLength]`, or `null` if no complete line yet.
 * A trailing lone CR is treated as incomplete unless `eof` is set, because
 * the following chunk may begin with the LF of a CRLF pair.
 */
function nextLineBreak(buffer: string, eof: boolean): [number, number] | null {
  for (let i = 0; i < buffer.length; i += 1) {
    const ch = buffer[i];
    if (ch === LF) return [i, 1];
    if (ch === CR) {
      if (i + 1 < buffer.length) return [i, buffer[i + 1] === LF ? 2 : 1];
      return eof ? [i, 1] : null;
    }
  }
  return null;
}

export async function* parseSseFrames(
  body: ReadableStream<Uint8Array>,
  options: SseParseOptions = {},
): AsyncGenerator<SseFrame, void, undefined> {
  const maxPending = options.maxPendingChars ?? DEFAULT_MAX_PENDING_CHARS;
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  const onAbort = (): void => {
    void reader.cancel(options.signal?.reason);
  };
  if (options.signal?.aborted) {
    reader.releaseLock();
    return;
  }
  options.signal?.addEventListener("abort", onAbort, { once: true });

  let buffer = "";
  let lastEventId: string | null = null;
  let eventName: string | null = null;
  let dataLines: string[] = [];
  let pendingDataChars = 0;

  const dispatch = (): SseFrame | null => {
    const frame: SseFrame | null =
      dataLines.length > 0
        ? { id: lastEventId, event: eventName, data: dataLines.join(LF) }
        : null;
    eventName = null;
    dataLines = [];
    pendingDataChars = 0;
    return frame;
  };

  const consumeLine = (line: string): SseFrame | null => {
    if (line === "") return dispatch();
    if (line.startsWith(":")) return null; // comment / keepalive
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "id":
        if (!value.includes(NUL)) lastEventId = value;
        return null;
      case "event":
        eventName = value;
        return null;
      case "data":
        dataLines.push(value);
        pendingDataChars += value.length + 1;
        if (pendingDataChars > maxPending) {
          throw new SseProtocolError(
            `SSE event accumulated more than ${String(maxPending)} data characters without a terminating blank line`,
          );
        }
        return null;
      default:
        // `retry:` and unknown fields carry no contract state.
        return null;
    }
  };

  /** Consume every complete line in `buffer`, yielding dispatched frames. */
  function* drain(eof: boolean): Generator<SseFrame, void, undefined> {
    let brk = nextLineBreak(buffer, eof);
    while (brk !== null) {
      const [end, len] = brk;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + len);
      const frame = consumeLine(line);
      if (frame) yield frame;
      brk = nextLineBreak(buffer, eof);
    }
  }

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Complete lines first, so a big chunk of small frames never trips the
      // cap; then bound what remains pending.
      yield* drain(false);
      if (buffer.length + pendingDataChars > maxPending) {
        throw new SseProtocolError(
          `SSE pending state exceeded ${String(maxPending)} characters without a line terminator`,
        );
      }
    }
    // End of stream: a trailing lone CR now terminates its line, but anything
    // still undispatched (no blank line) is an incomplete event and is DROPPED.
    buffer += decoder.decode();
    yield* drain(true);
    buffer = "";
    eventName = null;
    dataLines = [];
    pendingDataChars = 0;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
