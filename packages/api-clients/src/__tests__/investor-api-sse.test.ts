import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInvestorApiClient,
  type InvestorApiClientOptions,
} from "../investor-api/client";
import { ContractVersionMismatchError } from "../investor-api/errors";
import { CONTRACT_PACKAGE_DIR } from "../investor-api/package";
import {
  parseSseFrames,
  SseProtocolError,
  type SseFrame,
} from "../investor-api/sse";

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;
const NUL = String.fromCharCode(0);

const examples = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", CONTRACT_PACKAGE_DIR, "examples.json"),
    "utf8",
  ),
) as {
  ids: { account: string };
  responses: { AccountEvent: Record<string, unknown> & { event_id: string } };
};

const VALID_EVENT = examples.responses.AccountEvent;
const VALID_ID = VALID_EVENT.event_id;

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

async function collect(stream: ReadableStream<Uint8Array>, eol = LF) {
  const frames: SseFrame[] = [];
  for await (const f of parseSseFrames(stream)) frames.push(f);
  return frames.map((f) => ({ ...f, data: f.data.split(LF).join(eol) }));
}

function framed(id: string, payload: unknown, eventName?: string, eol = LF) {
  const name =
    eventName ?? (payload as { event_type?: string }).event_type ?? "x";
  return `id: ${id}${eol}event: ${name}${eol}data: ${JSON.stringify(payload)}${eol}${eol}`;
}

describe("parseSseFrames — WHATWG-correct incremental framing", () => {
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

  it("an incomplete event at EOF is DISCARDED — EOF is not an implicit dispatch", async () => {
    const { stream, push, close } = pushStream();
    push(`id: e1${LF}data: ${JSON.stringify(VALID_EVENT)}${LF}`); // no blank line
    close();
    expect(await collect(stream)).toEqual([]);

    const second = pushStream();
    second.push(`id: e1${LF}data: ${JSON.stringify(VALID_EVENT)}`); // not even a newline
    second.close();
    expect(await collect(second.stream)).toEqual([]);
  });

  for (const [name, eol] of [
    ["LF", LF],
    ["CRLF", CRLF],
    ["lone CR", CR],
  ] as const) {
    it(`parses ${name} line endings, including a CR/LF split across chunks`, async () => {
      const { stream, push, close } = pushStream();
      const text = `id: e1${eol}event: t${eol}data: a${eol}data: b${eol}${eol}: comment${eol}id: e2${eol}data: c${eol}${eol}`;
      // Feed one character at a time so every terminator can straddle a chunk.
      for (const ch of text) push(ch);
      close();
      const frames = await collect(stream);
      expect(frames).toEqual([
        { id: "e1", event: "t", data: `a${LF}b` },
        { id: "e2", event: null, data: "c" },
      ]);
    });
  }

  it("a lone CR at the end of a chunk is held until the next chunk disambiguates CRLF", async () => {
    const { stream, push, close } = pushStream();
    push(`data: x${CR}`);
    push(`${LF}${CR}${LF}`); // completes CRLF, then a blank CRLF line
    close();
    expect(await collect(stream)).toEqual([
      { id: null, event: null, data: "x" },
    ]);
  });

  it("ignores comment/keepalive lines and data-less frames; persists the last id", async () => {
    const { stream, push, close } = pushStream();
    push(`: keepalive${LF}${LF}`);
    push(`id: evt_7${LF}${LF}`); // id-only frame: no yield, but id persists
    push(`data: one${LF}${LF}`);
    push(`:ka${LF}data: two${LF}data: three${LF}${LF}`);
    close();
    expect(await collect(stream)).toEqual([
      { id: "evt_7", event: null, data: "one" },
      { id: "evt_7", event: null, data: `two${LF}three` },
    ]);
  });

  it("an id: containing U+0000 is ignored and the previous id stays in effect", async () => {
    const { stream, push, close } = pushStream();
    push(`id: good${LF}data: a${LF}${LF}`);
    push(`id: ba${NUL}d${LF}data: b${LF}${LF}`);
    close();
    expect(await collect(stream)).toEqual([
      { id: "good", event: null, data: "a" },
      { id: "good", event: null, data: "b" },
    ]);
  });

  it("one large chunk with many complete small frames is fine under a small cap", async () => {
    const { stream, push, close } = pushStream();
    let chunk = "";
    for (let i = 0; i < 200; i += 1)
      chunk += `id: e${String(i)}${LF}data: {"n":${String(i)}}${LF}${LF}`;
    expect(chunk.length).toBeGreaterThan(2_000);
    push(chunk);
    close();
    const frames: SseFrame[] = [];
    for await (const f of parseSseFrames(stream, { maxPendingChars: 200 }))
      frames.push(f);
    expect(frames).toHaveLength(200);
    expect(frames[199]).toEqual({ id: "e199", event: null, data: '{"n":199}' });
  });

  it("one genuinely oversized unfinished event fails: an unterminated line …", async () => {
    const { stream, push } = pushStream();
    push("data: " + "x".repeat(1_000));
    await expect(async () => {
      for await (const _ of parseSseFrames(stream, { maxPendingChars: 500 })) {
        // unreachable
      }
    }).rejects.toBeInstanceOf(SseProtocolError);
  });

  it("… and unlimited data: lines inside one unclosed event", async () => {
    const { stream, push } = pushStream();
    for (let i = 0; i < 100; i += 1) push(`data: ${"y".repeat(20)}${LF}`); // never a blank line
    await expect(async () => {
      for await (const _ of parseSseFrames(stream, { maxPendingChars: 500 })) {
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

describe("client.stream() — validated, incremental account events bound to event_id", () => {
  function clientFor(
    body: ReadableStream<Uint8Array>,
    capture?: { init?: RequestInit },
    headers: Record<string, string> = {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Correlation-Id": "c",
    },
  ) {
    const target = (
      bearer: string,
    ): InvestorApiClientOptions["investorApi"] => ({
      baseUrl: "http://127.0.0.1:1",
      getBearer: () => Promise.resolve(bearer),
    });
    return createInvestorApiClient({
      identityCcid: target("id-bearer"),
      investorApi: target("inv-bearer"),
      mintAssertion: () => Promise.resolve("a"),
      fetch: ((_url: URL, init?: RequestInit) => {
        if (capture) capture.init = init;
        return Promise.resolve(new Response(body, { status: 200, headers }));
      }) as typeof fetch,
    });
  }

  async function expectRejects(events: AsyncIterable<unknown>) {
    await expect(async () => {
      for await (const _ of events) {
        // unreachable
      }
    }).rejects.toBeInstanceOf(ContractVersionMismatchError);
  }

  it("delivers a valid event before EOF, with id === event_id, and forwards Last-Event-ID exactly", async () => {
    const { stream, push, close } = pushStream();
    const capture: { init?: RequestInit } = {};
    const client = clientFor(stream, capture);
    const opened = await client.stream({
      path: { account_id: examples.ids.account },
      lastEventId: "event_alpha_00000000",
    });
    const sent = new Headers(capture.init?.headers);
    expect(sent.get("Last-Event-ID")).toBe("event_alpha_00000000");
    expect(sent.get("Accept")).toBe("text/event-stream");
    expect(sent.get("Authorization")).toBe("Bearer inv-bearer");
    const it = opened.events[Symbol.asyncIterator]();
    push(framed(VALID_ID, VALID_EVENT));
    const first = await it.next();
    expect(first.done).toBe(false);
    if (first.done) throw new Error("expected an event before EOF");
    expect(first.value.eventId).toBe(VALID_ID);
    expect(first.value.event.event_id).toBe(VALID_ID);
    expect(first.value.eventName).toBe("recommendation.updated");
    close();
    expect((await it.next()).done).toBe(true);
  });

  it("framing id that differs from the payload event_id → reject", async () => {
    const { stream, push, close } = pushStream();
    const opened = await clientFor(stream).stream({
      path: { account_id: examples.ids.account },
    });
    push(framed("event_alpha_99999999", VALID_EVENT));
    close();
    await expectRejects(opened.events);
  });

  it("missing framing id for an AccountEvent → reject (no resume cursor)", async () => {
    const { stream, push, close } = pushStream();
    const opened = await clientFor(stream).stream({
      path: { account_id: examples.ids.account },
    });
    push(
      `event: recommendation.updated${LF}data: ${JSON.stringify(VALID_EVENT)}${LF}${LF}`,
    );
    close();
    await expectRejects(opened.events);
  });

  it("a NUL-containing id cannot become the resume cursor", async () => {
    const { stream, push, close } = pushStream();
    const opened = await clientFor(stream).stream({
      path: { account_id: examples.ids.account },
    });
    push(
      `id: ${VALID_ID.slice(0, 5)}${NUL}${VALID_ID.slice(5)}${LF}data: ${JSON.stringify(VALID_EVENT)}${LF}${LF}`,
    );
    close();
    await expectRejects(opened.events); // id ignored → frame has no id → rejected
  });

  it("rejects an unknown event variant", async () => {
    const { stream, push, close } = pushStream();
    const opened = await clientFor(stream).stream({
      path: { account_id: examples.ids.account },
    });
    push(
      framed(
        VALID_ID,
        { ...VALID_EVENT, event_type: "mystery.updated" },
        "mystery.updated",
      ),
    );
    close();
    await expectRejects(opened.events);
  });

  it("rejects an extra field on the event payload", async () => {
    const { stream, push, close } = pushStream();
    const opened = await clientFor(stream).stream({
      path: { account_id: examples.ids.account },
    });
    push(framed(VALID_ID, { ...VALID_EVENT, surprise: true }));
    close();
    await expectRejects(opened.events);
  });

  it("rejects a malformed event_id and non-JSON data", async () => {
    const { stream, push, close } = pushStream();
    const opened = await clientFor(stream).stream({
      path: { account_id: examples.ids.account },
    });
    push(framed("bad id!", { ...VALID_EVENT, event_id: "bad id!" }));
    close();
    await expectRejects(opened.events);

    const second = pushStream();
    const opened2 = await clientFor(second.stream).stream({
      path: { account_id: examples.ids.account },
    });
    second.push(`id: e2${LF}data: not-json${LF}${LF}`);
    second.close();
    await expectRejects(opened2.events);
  });

  it("an event name that differs from event_type → reject", async () => {
    const { stream, push, close } = pushStream();
    const opened = await clientFor(stream).stream({
      path: { account_id: examples.ids.account },
    });
    push(framed(VALID_ID, VALID_EVENT, "valuation.updated"));
    close();
    await expectRejects(opened.events);
  });

  it("keepalives are ignored and duplicate ids remain parseable", async () => {
    const { stream, push, close } = pushStream();
    const opened = await clientFor(stream).stream({
      path: { account_id: examples.ids.account },
    });
    push(`: ping${LF}${LF}`);
    push(framed(VALID_ID, VALID_EVENT));
    push(framed(VALID_ID, VALID_EVENT)); // duplicate delivery — parseable; dedupe is the BFF's job
    close();
    const ids: string[] = [];
    for await (const e of opened.events) ids.push(e.eventId);
    expect(ids).toEqual([VALID_ID, VALID_ID]);
  });

  it("cancel() closes the live stream", async () => {
    const { stream, push } = pushStream();
    const opened = await clientFor(stream).stream({
      path: { account_id: examples.ids.account },
    });
    const it = opened.events[Symbol.asyncIterator]();
    push(framed(VALID_ID, VALID_EVENT));
    expect((await it.next()).done).toBe(false);
    opened.cancel();
    const next = await it
      .next()
      .catch(() => ({ done: true as const, value: undefined }));
    expect(next.done).toBe(true);
  });

  it("rejects a stream answered with application/json, or without private, no-store", async () => {
    const jsonAnswer = pushStream();
    await expect(
      clientFor(jsonAnswer.stream, undefined, {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
      }).stream({ path: { account_id: examples.ids.account } }),
    ).rejects.toBeInstanceOf(ContractVersionMismatchError);
    const cached = pushStream();
    await expect(
      clientFor(cached.stream, undefined, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "public, max-age=60",
      }).stream({ path: { account_id: examples.ids.account } }),
    ).rejects.toBeInstanceOf(ContractVersionMismatchError);
  });
});
