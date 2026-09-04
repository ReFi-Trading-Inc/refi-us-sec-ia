/**
 * Incremental Server-Sent Events parser over a `ReadableStream<Uint8Array>`.
 *
 * Server-only. Frames are surfaced as they arrive — never held until the
 * connection closes — with bounded buffering. Comment lines (`:` prefix) and
 * frames with no `data` (keepalives) are not state changes and are not
 * yielded. Per the SSE specification an `id:` field persists as the last event
 * id until the next `id:` field, so a data-less `id:` frame still updates the
 * id carried by the next data frame.
 */

export interface SseFrame {
  /** Last event id in effect for this frame (persisted per the SSE spec). */
  readonly id: string | null;
  readonly event: string | null;
  readonly data: string;
}

export interface SseParseOptions {
  signal?: AbortSignal;
  /** Hard cap on buffered, not-yet-dispatched characters; exceeding it is a protocol fault. */
  maxBufferedChars?: number;
}

export const DEFAULT_MAX_BUFFERED_CHARS = 256 * 1024;

export class SseProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SseProtocolError";
  }
}

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

export async function* parseSseFrames(
  body: ReadableStream<Uint8Array>,
  options: SseParseOptions = {},
): AsyncGenerator<SseFrame, void, undefined> {
  const maxBuffered = options.maxBufferedChars ?? DEFAULT_MAX_BUFFERED_CHARS;
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

  const dispatch = (): SseFrame | null => {
    const frame: SseFrame | null =
      dataLines.length > 0
        ? { id: lastEventId, event: eventName, data: dataLines.join(LF) }
        : null;
    eventName = null;
    dataLines = [];
    return frame;
  };

  const consumeLine = (rawLine: string): SseFrame | null => {
    const line = rawLine.endsWith(CR) ? rawLine.slice(0, -1) : rawLine;
    if (line === "") return dispatch();
    if (line.startsWith(":")) return null; // comment / keepalive
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "id":
        lastEventId = value;
        return null;
      case "event":
        eventName = value;
        return null;
      case "data":
        dataLines.push(value);
        return null;
      default:
        // `retry:` and unknown fields carry no contract state.
        return null;
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > maxBuffered) {
        throw new SseProtocolError(
          `SSE frame exceeded ${String(maxBuffered)} buffered characters without a terminator`,
        );
      }
      let newline = buffer.indexOf(LF);
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const frame = consumeLine(line);
        if (frame) yield frame;
        newline = buffer.indexOf(LF);
      }
    }
    // A final line terminated by EOF rather than a newline.
    if (buffer.length > 0) {
      const frame = consumeLine(buffer);
      if (frame) yield frame;
    }
    const tail = dispatch();
    if (tail) yield tail;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
