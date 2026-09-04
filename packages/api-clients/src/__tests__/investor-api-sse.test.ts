import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInvestorApiClient } from "../investor-api/client";
import { ContractVersionMismatchError } from "../investor-api/errors";
import { CONTRACT_PACKAGE_DIR } from "../investor-api/package";
import {
  parseSseFrames,
  SseProtocolError,
  type SseFrame,
} from "../investor-api/sse";

const LF = String.fromCharCode(10);
const CRLF = String.fromCharCode(13) + LF;

const examples = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", CONTRACT_PACKAGE_DIR, "examples.json"),
    "utf8",
  ),
) as {
  ids: { account: string };
  responses: { AccountEvent: Record<string, unknown> };
};

const VALID_EVENT = examples.responses.AccountEvent;

/** A push-controlled byte stream so tests can prove pre-EOF delivery. */
function pushStream(): {
  stream: ReadableStream<Uint8Array>;
  push: (text: string) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    push: (text) => {
      controller.enqueue(encoder.encode(text));
    },
    close: () => {
      controller.close();
    },
  };
}

function frame(id: string, payload: unknown, eventName?: string): string {
  const name =
    eventName ?? (payload as { event_type?: string }).event_type ?? "x";
  return `id: ${id}${LF}event: ${name}${LF}data: ${JSON.stringify(payload)}${LF}${LF}`;
}

describe("parseSseFrames — incremental framing", () => {
  it("yields a frame before the connection closes", async () => {
    const { stream, push, close } = pushStream();
    const it = parseSseFrames(stream)[Symbol.asyncIterator]();
    push(`id: evt_1${LF}event: valuation.updated${LF}data: {"a":1}${LF}${LF}`);
    const first = await it.next(); // resolves while the stream is still open
    expect(first.done).toBe(false);
    expect(first.value).toEqual<SseFrame>({
      id: "evt_1",
      event: "valuation.updated",
      data: '{"a":1}',
    });
    close();
    expect((await it.next()).done).toBe(true);
  });

  it("ignores comment/keepalive lines and data-less frames; persists the last id", async () => {
    const { stream, push, close } = pushStream();
    push(`: keepalive${LF}${LF}`);
    push(`id: evt_7${LF}${LF}`); // id-only frame: no yield, but id persists
    push(`data: one${LF}${LF}`);
    push(`:ka${LF}data: two${LF}data: three${LF}${LF}`);
    close();
    const frames: SseFrame[] = [];
    for await (const f of parseSseFrames(stream)) frames.push(f);
    expect(frames).toEqual([
      { id: "evt_7", event: null, data: "one" },
      { id: "evt_7", event: null, data: `two${LF}three` },
    ]);
  });

  it("handles CRLF line endings, chunk boundaries mid-line, and an EOF-terminated frame", async () => {
    const { stream, push, close } = pushStream();
    push(`id: e1${CRLF}da`);
    push(`ta: {"k":${CRLF}`.replace(CRLF, "")); // continue the same line
    push(`1}${CRLF}${CRLF}id: e2${CRLF}data: tail`); // no trailing blank line
    close();
    const frames: SseFrame[] = [];
    for await (const f of parseSseFrames(stream)) frames.push(f);
    expect(frames).toEqual([
      { id: "e1", event: null, data: '{"k":1}' },
      { id: "e2", event: null, data: "tail" },
    ]);
  });

  it("refuses to buffer an unbounded frame", async () => {
    const { stream, push } = pushStream();
    push("data: " + "x".repeat(1_000));
    await expect(async () => {
      for await (const _ of parseSseFrames(stream, { maxBufferedChars: 500 })) {
        // unreachable
      }
    }).rejects.toBeInstanceOf(SseProtocolError);
  });

  it("stops when the caller aborts", async () => {
    const { stream, push } = pushStream();
    const controller = new AbortController();
    const it = parseSseFrames(stream, { signal: controller.signal })[
      Symbol.asyncIterator
    ]();
    push(`data: a${LF}${LF}`);
    expect((await it.next()).value?.data).toBe("a");
    controller.abort();
    const next = await it
      .next()
      .catch((e: unknown) => ({ done: true, error: e }));
    expect(next.done).toBe(true);
  });
});

describe("client.stream() — validated, incremental account events", () => {
  function clientFor(
    body: ReadableStream<Uint8Array>,
    capture?: { init?: RequestInit },
  ) {
    return createInvestorApiClient({
      baseUrl: "http://127.0.0.1:1",
      getBearer: () => Promise.resolve("b"),
      mintAssertion: () => Promise.resolve("a"),
      fetch: ((_url: URL, init?: RequestInit) => {
        if (capture) capture.init = init;
        return Promise.resolve(
          new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "X-Correlation-Id": "c",
            },
          }),
        );
      }) as typeof fetch,
    });
  }

  it("delivers a valid event before EOF, with its id and name, and forwards Last-Event-ID exactly", async () => {
    const { stream, push, close } = pushStream();
    const capture: { init?: RequestInit } = {};
    const client = clientFor(stream, capture);
    const opened = await client.stream({
      path: { account_id: examples.ids.account },
      lastEventId: "event_alpha_00000000",
    });
    expect(new Headers(capture.init?.headers).get("Last-Event-ID")).toBe(
      "event_alpha_00000000",
    );
    expect(new Headers(capture.init?.headers).get("Accept")).toBe(
      "text/event-stream",
    );
    const it = opened.events[Symbol.asyncIterator]();
    push(frame("event_alpha_00000001", VALID_EVENT));
    const first = await it.next();
    expect(first.done).toBe(false);
    if (first.done) throw new Error("expected an event before EOF");
    expect(first.value.eventId).toBe("event_alpha_00000001");
    expect(first.value.eventName).toBe("recommendation.updated");
    expect(first.value.event.event_type).toBe("recommendation.updated");
    close();
    expect((await it.next()).done).toBe(true);
  });

  it("rejects an unknown event variant as a contract-version mismatch", async () => {
    const { stream, push, close } = pushStream();
    const client = clientFor(stream);
    const opened = await client.stream({
      path: { account_id: examples.ids.account },
    });
    push(
      frame(
        "e1",
        { ...VALID_EVENT, event_type: "mystery.updated" },
        "mystery.updated",
      ),
    );
    close();
    await expect(async () => {
      for await (const _ of opened.events) {
        // unreachable
      }
    }).rejects.toBeInstanceOf(ContractVersionMismatchError);
  });

  it("rejects an extra field on the event payload", async () => {
    const { stream, push, close } = pushStream();
    const client = clientFor(stream);
    const opened = await client.stream({
      path: { account_id: examples.ids.account },
    });
    push(frame("e1", { ...VALID_EVENT, surprise: true }));
    close();
    await expect(async () => {
      for await (const _ of opened.events) {
        // unreachable
      }
    }).rejects.toBeInstanceOf(ContractVersionMismatchError);
  });

  it("rejects a malformed event id / non-JSON data", async () => {
    const { stream, push, close } = pushStream();
    const client = clientFor(stream);
    const opened = await client.stream({
      path: { account_id: examples.ids.account },
    });
    push(frame("e1", { ...VALID_EVENT, event_id: "bad id!" }));
    close();
    await expect(async () => {
      for await (const _ of opened.events) {
        // unreachable
      }
    }).rejects.toBeInstanceOf(ContractVersionMismatchError);

    const second = pushStream();
    const opened2 = await clientFor(second.stream).stream({
      path: { account_id: examples.ids.account },
    });
    second.push(`id: e2${LF}data: not-json${LF}${LF}`);
    second.close();
    await expect(async () => {
      for await (const _ of opened2.events) {
        // unreachable
      }
    }).rejects.toBeInstanceOf(ContractVersionMismatchError);
  });

  it("keepalives are ignored and duplicate ids remain parseable", async () => {
    const { stream, push, close } = pushStream();
    const client = clientFor(stream);
    const opened = await client.stream({
      path: { account_id: examples.ids.account },
    });
    push(`: ping${LF}${LF}`);
    push(frame("event_alpha_00000001", VALID_EVENT));
    push(frame("event_alpha_00000001", VALID_EVENT)); // duplicate delivery — parseable; dedupe is the BFF's job
    close();
    const ids: (string | null)[] = [];
    for await (const e of opened.events) ids.push(e.eventId);
    expect(ids).toEqual(["event_alpha_00000001", "event_alpha_00000001"]);
  });

  it("cancel() closes the live stream", async () => {
    const { stream, push } = pushStream();
    const client = clientFor(stream);
    const opened = await client.stream({
      path: { account_id: examples.ids.account },
    });
    const it = opened.events[Symbol.asyncIterator]();
    push(frame("event_alpha_00000001", VALID_EVENT));
    expect((await it.next()).done).toBe(false);
    opened.cancel();
    const next = await it
      .next()
      .catch(() => ({ done: true as const, value: undefined }));
    expect(next.done).toBe(true);
  });

  it("rejects a stream answered with application/json", async () => {
    const client = createInvestorApiClient({
      baseUrl: "http://127.0.0.1:1",
      getBearer: () => Promise.resolve("b"),
      mintAssertion: () => Promise.resolve("a"),
      fetch: () =>
        Promise.resolve(
          new Response("{}", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    });
    await expect(
      client.stream({ path: { account_id: examples.ids.account } }),
    ).rejects.toBeInstanceOf(ContractVersionMismatchError);
  });
});
