import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContractVersionMismatchError,
  IdempotencyKeyRequiredError,
  IfMatchRequiredError,
  InvestorApiError,
  InvestorApiTransportError,
  RemoteBaseUrlNotAllowedError,
} from "../investor-api/errors";
import { CONTRACT_PACKAGE_DIR } from "../investor-api/package";
import {
  createInvestorApiClient,
  DeadlineExceededError,
  READ_BUDGET_MS,
  type InvestorApiClientOptions,
} from "../investor-api/client";

const examples = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", CONTRACT_PACKAGE_DIR, "examples.json"),
    "utf8",
  ),
) as {
  ids: { account: string; foreign_account: string };
  requests: Record<string, unknown>;
  responses: Record<string, unknown>;
  errors: Record<string, unknown>;
};

const ACCOUNT = examples.ids.account;

const openapi = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", CONTRACT_PACKAGE_DIR, "openapi.json"),
    "utf8",
  ),
) as {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId: string;
        responses: Record<
          string,
          { content?: Record<string, { example?: unknown }> }
        >;
      }
    >
  >;
};

/** Daniel's success example for an operation, straight from openapi.json. */
function exampleFor(operationId: string): unknown {
  for (const methods of Object.values(openapi.paths)) {
    for (const op of Object.values(methods)) {
      if (op.operationId !== operationId) continue;
      for (const status of ["200", "201", "202"]) {
        const ex = op.responses[status]?.content?.["application/json"]?.example;
        if (ex !== undefined) return ex;
      }
    }
  }
  throw new Error(`no example for ${operationId}`);
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Correlation-Id": "corr_x",
      ...headers,
    },
  });
}

function envelope(code: string, extra: Record<string, unknown> = {}): unknown {
  return {
    error: {
      code,
      message: "safe display text",
      correlation_id: "corr_x",
      ...extra,
    },
  };
}

type FetchLike = (
  url: URL | RequestInfo,
  init?: RequestInit,
) => Promise<Response>;

function makeClient(
  fetchImpl: FetchLike,
  overrides: Partial<InvestorApiClientOptions> = {},
) {
  let n = 0;
  return createInvestorApiClient({
    baseUrl: "http://127.0.0.1:1",
    getBearer: () => Promise.resolve("bearer-token"),
    mintAssertion: () => Promise.resolve(`assertion-${String(++n)}`),
    fetch: fetchImpl,
    random: () => 0,
    ...overrides,
  });
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

function initOf(mock: ReturnType<typeof vi.fn>, call = 0): RequestInit {
  return (mock.mock.calls[call] as unknown as [URL, RequestInit])[1];
}

afterEach(() => {
  vi.useRealTimers();
});

// ─── 1. Credentials per operation ──────────────────────────────────────────

describe("credentials follow the contract's per-operation auth policy", () => {
  it("investor-api reads send Google bearer + user assertion + correlation id", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(json(200, exampleFor("listAccounts"))),
    );
    const client = makeClient(fetchMock);
    const result = await client.call("listAccounts", {
      query: { page_size: 10 },
    });
    expect(result.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(url.toString()).toBe(
      "http://127.0.0.1:1/api/v1/investor/accounts?page_size=10",
    );
    expect(headerOf(initOf(fetchMock), "Authorization")).toBe(
      "Bearer bearer-token",
    );
    expect(headerOf(initOf(fetchMock), "X-Refinity-User-Assertion")).toBe(
      "assertion-1",
    );
    expect(headerOf(initOf(fetchMock), "X-Correlation-Id")).toBe(
      result.correlationId,
    );
    expect(result.correlationId).toMatch(/^bff_[0-9a-f]{32}$/);
  });

  it("the public identity JWKS obtains ZERO credentials — neither provider is invoked", async () => {
    const getBearer = vi.fn(() => Promise.resolve("bearer-token"));
    const mintAssertion = vi.fn(() => Promise.resolve("assertion"));
    const fetchMock = vi.fn(() =>
      Promise.resolve(json(200, exampleFor("getIdentityJwks"))),
    );
    const client = makeClient(fetchMock, { getBearer, mintAssertion });
    const result = await client.call("getIdentityJwks");
    expect(result.status).toBe(200);
    expect(getBearer).not.toHaveBeenCalled();
    expect(mintAssertion).not.toHaveBeenCalled();
    expect(headerOf(initOf(fetchMock), "Authorization")).toBeNull();
    expect(headerOf(initOf(fetchMock), "X-Refinity-User-Assertion")).toBeNull();
    expect(headerOf(initOf(fetchMock), "X-Correlation-Id")).toBe(
      result.correlationId,
    );
  });

  it("the identity exchange is Google-authenticated with no user assertion", async () => {
    const mintAssertion = vi.fn(() => Promise.resolve("assertion"));
    const fetchMock = vi.fn(() =>
      Promise.resolve(json(200, exampleFor("exchangeIdentity"))),
    );
    const client = makeClient(fetchMock, { mintAssertion });
    await client.call("exchangeIdentity", {
      body: examples.requests["IdentityExchangeRequest"] as never,
    });
    expect(mintAssertion).not.toHaveBeenCalled();
    expect(headerOf(initOf(fetchMock), "Authorization")).toBe(
      "Bearer bearer-token",
    );
    expect(headerOf(initOf(fetchMock), "X-Refinity-User-Assertion")).toBeNull();
  });
});

// ─── Idempotency and concurrency rules ─────────────────────────────────────

describe("idempotency and concurrency rules", () => {
  it("refuses an investor-api mutation without Idempotency-Key before any network call", async () => {
    const fetchMock = vi.fn();
    const client = makeClient(fetchMock);
    await expect(
      client.call("createAllocationPreview", {
        path: { account_id: ACCOUNT },
        body: examples.requests["AllocationPreviewRequest"] as never,
      }),
    ).rejects.toBeInstanceOf(IdempotencyKeyRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a PATCH without If-Match", async () => {
    const fetchMock = vi.fn();
    const client = makeClient(fetchMock);
    await expect(
      client.call("updateAccountPreferences", {
        path: { account_id: ACCOUNT },
        body: examples.requests["PreferencePatch"] as never,
        idempotencyKey: "k1",
      }),
    ).rejects.toBeInstanceOf(IfMatchRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards Idempotency-Key and If-Match and never retries a mutation", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(json(503, envelope("SERVICE_UNAVAILABLE"))),
    );
    const client = makeClient(fetchMock);
    await expect(
      client.call("updateAccountPreferences", {
        path: { account_id: ACCOUNT },
        body: examples.requests["PreferencePatch"] as never,
        idempotencyKey: "k1",
        ifMatch: "v1",
      }),
    ).rejects.toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headerOf(initOf(fetchMock), "Idempotency-Key")).toBe("k1");
    expect(headerOf(initOf(fetchMock), "If-Match")).toBe("v1");
  });
});

// ─── 2. Error responses fail closed on drift ───────────────────────────────

describe("error responses fail closed on schema or profile drift", () => {
  it("a conformant envelope with a profile-allowed status/code becomes InvestorApiError", async () => {
    const client = makeClient(() =>
      Promise.resolve(
        json(404, envelope("RESOURCE_NOT_FOUND"), { "Retry-After": "7" }),
      ),
    );
    const err = await client.call("listAccounts").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvestorApiError);
    expect(err).toMatchObject({
      status: 404,
      code: "RESOURCE_NOT_FOUND",
      correlationId: "corr_x",
      retryAfterSeconds: 7,
    });
  });

  it("unknown envelope field → ContractVersionMismatchError", async () => {
    const client = makeClient(() =>
      Promise.resolve(
        json(404, envelope("RESOURCE_NOT_FOUND", { hint: "extra" })),
      ),
    );
    await expect(client.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
  });

  it("missing required correlation_id → ContractVersionMismatchError", async () => {
    const client = makeClient(() =>
      Promise.resolve(
        json(404, { error: { code: "RESOURCE_NOT_FOUND", message: "x" } }),
      ),
    );
    await expect(client.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
  });

  it("malformed error object → ContractVersionMismatchError", async () => {
    const client = makeClient(() =>
      Promise.resolve(json(404, { error: "not-an-object" })),
    );
    await expect(client.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
    const client2 = makeClient(() =>
      Promise.resolve(json(404, { message: "no error key" })),
    );
    await expect(client2.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
  });

  it("non-JSON error body when the contract expects JSON → ContractVersionMismatchError, never UNKNOWN_ERROR", async () => {
    const html = new Response("<html>gateway</html>", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
    const client = makeClient(() => Promise.resolve(html));
    const err = await client.call("listAccounts").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContractVersionMismatchError);
    expect((err as ContractVersionMismatchError).problems.join(" ")).toMatch(
      /text\/html/,
    );

    const broken = new Response("{not json", {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
    const client2 = makeClient(() => Promise.resolve(broken));
    const err2 = await client2.call("listAccounts").catch((e: unknown) => e);
    expect(err2).toBeInstanceOf(ContractVersionMismatchError);
    expect((err2 as ContractVersionMismatchError).problems.join(" ")).toMatch(
      /not valid JSON/,
    );
  });

  it("an impossible status/code pair for the route's error profile fails loudly", async () => {
    // listAccounts → authenticated_read: 409 is allowed, but ALLOCATION_INVALID is not.
    const wrongCode = makeClient(() =>
      Promise.resolve(json(409, envelope("ALLOCATION_INVALID"))),
    );
    const e1 = await wrongCode.call("listAccounts").catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(ContractVersionMismatchError);
    expect((e1 as ContractVersionMismatchError).problems.join(" ")).toMatch(
      /ALLOCATION_INVALID/,
    );

    // 400 is not a declared status for authenticated_read (it is for identity_exchange).
    const wrongStatus = makeClient(() =>
      Promise.resolve(json(400, envelope("VALIDATION_ERROR"))),
    );
    const e2 = await wrongStatus.call("listAccounts").catch((e: unknown) => e);
    expect(e2).toBeInstanceOf(ContractVersionMismatchError);
    expect((e2 as ContractVersionMismatchError).problems.join(" ")).toMatch(
      /HTTP 400/,
    );

    // Same code on a route whose profile allows it is fine.
    const allowed = makeClient(() =>
      Promise.resolve(json(422, envelope("ALLOCATION_INVALID"))),
    );
    const e3 = await allowed
      .call("createAccountAction", {
        path: { account_id: ACCOUNT },
        body: examples.requests["AccountActionRequest"] as never,
        idempotencyKey: "k",
      })
      .catch((e: unknown) => e);
    expect(e3).toBeInstanceOf(InvestorApiError);
    expect((e3 as InvestorApiError).code).toBe("ALLOCATION_INVALID");
  });

  it("the safe display message is carried but never used to branch", async () => {
    const client = makeClient(() =>
      Promise.resolve(
        json(429, envelope("RATE_LIMITED", { message: "RESOURCE_NOT_FOUND" })),
      ),
    );
    const err = (await client
      .call("listAccounts")
      .catch((e: unknown) => e)) as InvestorApiError;
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.status).toBe(429);
  });
});

// ─── 3. Exact wire success status and media type ───────────────────────────

describe("exact success status and media type are enforced", () => {
  const preview = () =>
    ({
      path: { account_id: ACCOUNT },
      body: examples.requests["AllocationPreviewRequest"] as never,
      idempotencyKey: "k",
    }) as const;

  it("operation expects 201, backend returns a valid envelope with 200 → reject", async () => {
    const client = makeClient(() =>
      Promise.resolve(json(200, exampleFor("createAllocationPreview"))),
    );
    await expect(
      client.call("createAllocationPreview", preview()),
    ).rejects.toBeInstanceOf(ContractVersionMismatchError);
  });

  it("operation expects 202, backend returns 201 → reject", async () => {
    const client = makeClient(() =>
      Promise.resolve(json(201, exampleFor("createBrokerageConnection"))),
    );
    await expect(
      client.call("createBrokerageConnection", {
        path: { account_id: ACCOUNT },
        body: examples.requests["BrokerageConnectionRequest"] as never,
        idempotencyKey: "k",
      }),
    ).rejects.toBeInstanceOf(ContractVersionMismatchError);
  });

  it("exact status → accept; 204 for a 200 operation → reject", async () => {
    const ok = makeClient(() =>
      Promise.resolve(json(201, exampleFor("createAllocationPreview"))),
    );
    expect((await ok.call("createAllocationPreview", preview())).status).toBe(
      201,
    );
    const noContent = makeClient(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    await expect(noContent.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
  });

  it("JSON operations require the JSON media type; charset parameters are fine", async () => {
    const utf8 = makeClient(() =>
      Promise.resolve(
        new Response(JSON.stringify(exampleFor("listAccounts")), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }),
      ),
    );
    expect((await utf8.call("listAccounts")).status).toBe(200);
    const text = makeClient(() =>
      Promise.resolve(
        new Response(JSON.stringify(exampleFor("listAccounts")), {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );
    await expect(text.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
  });

  it("a success body that is not valid JSON is a contract mismatch", async () => {
    const client = makeClient(() =>
      Promise.resolve(
        new Response("{oops", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(client.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
  });
});

// ─── Read retry policy ─────────────────────────────────────────────────────

describe("read retry policy", () => {
  it("retries a GET at most twice on 503/502 with a FRESH assertion each attempt, same correlation id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(503, envelope("SERVICE_UNAVAILABLE")))
      .mockResolvedValueOnce(
        new Response("bad gateway", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(json(200, exampleFor("listAccounts")));
    vi.useFakeTimers();
    const client = makeClient(fetchMock);
    const pending = client.call("listAccounts");
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await pending;
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const assertions = [0, 1, 2].map((i) =>
      headerOf(initOf(fetchMock, i), "X-Refinity-User-Assertion"),
    );
    expect(new Set(assertions).size).toBe(3);
    const correlations = [0, 1, 2].map((i) =>
      headerOf(initOf(fetchMock, i), "X-Correlation-Id"),
    );
    expect(new Set(correlations).size).toBe(1);
  });

  it("out of retries on a contract-declared 503: the envelope must be conformant", async () => {
    vi.useFakeTimers();
    const good = makeClient(() =>
      Promise.resolve(json(503, envelope("SERVICE_UNAVAILABLE"))),
    );
    const p1 = good.call("listAccounts").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await p1).toBeInstanceOf(InvestorApiError);

    const drifted = makeClient(() =>
      Promise.resolve(
        new Response("down", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );
    const p2 = drifted.call("listAccounts").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await p2).toBeInstanceOf(ContractVersionMismatchError);
  });

  it("out of retries on 504 (never declared by the contract) surfaces a transport failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response("timeout", {
          status: 504,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    const client = makeClient(fetchMock);
    const p = client.call("listAccounts").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await p).toBeInstanceOf(InvestorApiTransportError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry 401 / 404 / 409 / 422 / 429", async () => {
    for (const [status, code] of [
      [401, "AUTHENTICATION_FAILED"],
      [404, "RESOURCE_NOT_FOUND"],
      [409, "ACCOUNT_TRUTH_STALE"],
      [422, "VALIDATION_ERROR"],
      [429, "RATE_LIMITED"],
    ] as const) {
      const fetchMock = vi.fn(() =>
        Promise.resolve(json(status, envelope(code))),
      );
      const client = makeClient(fetchMock);
      const err = await client.call("listAccounts").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvestorApiError);
      expect((err as InvestorApiError).status).toBe(status);
      expect((err as InvestorApiError).code).toBe(code);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
});

// ─── 6. Absolute read deadline ─────────────────────────────────────────────

describe("the 10 s read budget is one absolute end-to-end deadline", () => {
  /** A fetch that never resolves until its signal aborts. */
  const hangingFetch = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const reason: unknown = init.signal?.reason;
        reject(reason instanceof Error ? reason : new Error("aborted"));
      });
    });
  });

  it("a hanging GET is aborted exactly at the budget, after one attempt", async () => {
    vi.useFakeTimers();
    hangingFetch.mockClear();
    const client = makeClient(hangingFetch);
    const pending = client.call("listAccounts").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(READ_BUDGET_MS - 1);
    expect(hangingFetch).toHaveBeenCalledTimes(1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await pending;
    expect(err).toBeInstanceOf(InvestorApiTransportError);
    expect((err as InvestorApiTransportError).cause).toBeInstanceOf(
      DeadlineExceededError,
    );
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });

  it("the budget covers bearer acquisition and assertion minting too", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    const client = makeClient(fetchMock, {
      getBearer: () => new Promise<string>(() => undefined), // hangs
    });
    const pending = client.call("listAccounts").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(READ_BUDGET_MS);
    const err = await pending;
    expect(err).toBeInstanceOf(InvestorApiTransportError);
    expect((err as InvestorApiTransportError).cause).toBeInstanceOf(
      DeadlineExceededError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a retry only begins if time remains: retries + delays never exceed the budget", async () => {
    vi.useFakeTimers();
    let t = 0;
    const slowFail = vi.fn(() => {
      t += 4_000;
      vi.advanceTimersByTime(4_000);
      return Promise.reject(new TypeError("network down"));
    });
    const client = makeClient(slowFail, { now: () => t });
    const pending = client.call("listAccounts").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(READ_BUDGET_MS);
    const err = await pending;
    expect(err).toBeInstanceOf(InvestorApiTransportError);
    // attempt 1 at t=0 (fails at 4 s), retry at ~4.1 s (fails at 8.1 s); a third
    // attempt would start after ~8.3 s but could not complete inside 10 s, and
    // the deadline aborts it — never more than MAX_READ_RETRIES retries.
    expect(slowFail.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("a caller AbortSignal still works and is composed with the deadline", async () => {
    vi.useFakeTimers();
    hangingFetch.mockClear();
    const client = makeClient(hangingFetch);
    const controller = new AbortController();
    const pending = client
      .call("listAccounts", { signal: controller.signal })
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(500);
    controller.abort(new Error("caller cancelled"));
    const err = await pending;
    expect(err).toBeInstanceOf(InvestorApiTransportError);
    expect(((err as InvestorApiTransportError).cause as Error).message).toBe(
      "caller cancelled",
    );
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });

  it("mutations are not retried and are governed by the caller's signal, not the read budget", async () => {
    vi.useFakeTimers();
    hangingFetch.mockClear();
    const client = makeClient(hangingFetch);
    const controller = new AbortController();
    const pending = client
      .call("joinWaitlist", {
        body: examples.requests["WaitlistRequest"] as never,
        idempotencyKey: "k",
        signal: controller.signal,
      })
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(READ_BUDGET_MS * 2);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    controller.abort();
    expect(await pending).toBeInstanceOf(InvestorApiTransportError);
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });
});

// ─── Contract enforcement on our side ──────────────────────────────────────

describe("contract enforcement", () => {
  it("rejects a response with an unknown field as a contract-version mismatch", async () => {
    const body = structuredClone(exampleFor("listAccounts")) as {
      data: Record<string, unknown>;
    };
    body.data["surprise"] = true;
    const client = makeClient(() => Promise.resolve(json(200, body)));
    await expect(client.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
  });

  it("validates the request body before sending", async () => {
    const fetchMock = vi.fn();
    const client = makeClient(fetchMock);
    await expect(
      client.call("createAllocationPreview", {
        path: { account_id: ACCOUNT },
        idempotencyKey: "k",
        body: {
          template_id: "template_us_sp500_following_v1",
          allocation_percent: 0.25,
        } as never,
      }),
    ).rejects.toBeInstanceOf(ContractVersionMismatchError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a non-loopback base URL unless allowRemote is set", () => {
    const opts = {
      baseUrl: "https://investor-api-example.a.run.app",
      getBearer: () => Promise.resolve("b"),
      mintAssertion: () => Promise.resolve("a"),
    };
    expect(() => createInvestorApiClient(opts)).toThrow(
      RemoteBaseUrlNotAllowedError,
    );
    expect(() =>
      createInvestorApiClient({ ...opts, allowRemote: true }),
    ).not.toThrow();
  });
});
