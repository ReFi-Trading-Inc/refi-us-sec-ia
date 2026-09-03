import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": "corr_x",
      ...headers,
    },
  });
}

function makeClient(
  fetchImpl: (url: URL | RequestInfo, init?: RequestInit) => Promise<Response>,
  overrides: Partial<InvestorApiClientOptions> = {},
) {
  let n = 0;
  return createInvestorApiClient({
    baseUrl: "http://127.0.0.1:1",
    getBearer: () => Promise.resolve("bearer-token"),
    mintAssertion: () => Promise.resolve(`assertion-${String(++n)}`),
    fetch: fetchImpl,
    sleep: () => Promise.resolve(),
    random: () => 0,
    ...overrides,
  });
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

describe("InvestorApiClient — credentials and headers", () => {
  it("sends Google bearer, a user assertion, and a correlation id on investor-api reads", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(json(200, exampleFor("listAccounts"))),
    );
    const client = makeClient(fetchMock);
    const result = await client.call("listAccounts", {
      query: { page_size: 10 },
    });
    expect(result.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.toString()).toBe(
      "http://127.0.0.1:1/api/v1/investor/accounts?page_size=10",
    );
    expect(headerOf(init, "Authorization")).toBe("Bearer bearer-token");
    expect(headerOf(init, "X-Refinity-User-Assertion")).toBe("assertion-1");
    expect(headerOf(init, "X-Correlation-Id")).toBe(result.correlationId);
    expect(result.correlationId).toMatch(/^bff_[0-9a-f]{32}$/);
  });

  it("identity-ccid operations carry the bearer but no user assertion", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(json(200, exampleFor("exchangeIdentity"))),
    );
    const client = makeClient(fetchMock);
    await client.call("exchangeIdentity", {
      body: examples.requests["IdentityExchangeRequest"] as never,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(headerOf(init, "Authorization")).toBe("Bearer bearer-token");
    expect(headerOf(init, "X-Refinity-User-Assertion")).toBeNull();
  });

  it("the public JWKS route needs no credential decision by the caller but still gets a bearer header harmlessly", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(json(200, exampleFor("getIdentityJwks"))),
    );
    const client = makeClient(fetchMock);
    await client.call("getIdentityJwks");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("InvestorApiClient — idempotency and concurrency rules", () => {
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
      Promise.resolve(
        json(503, {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "down",
            correlation_id: "corr_x",
          },
        }),
      ),
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
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(headerOf(init, "Idempotency-Key")).toBe("k1");
    expect(headerOf(init, "If-Match")).toBe("v1");
  });
});

describe("InvestorApiClient — read retry policy", () => {
  it("retries a GET at most twice on 503 with a FRESH assertion each attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(503, {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "x",
            correlation_id: "c",
          },
        }),
      )
      .mockResolvedValueOnce(
        json(502, {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "x",
            correlation_id: "c",
          },
        }),
      )
      .mockResolvedValueOnce(json(200, exampleFor("listAccounts")));
    const client = makeClient(fetchMock);
    const result = await client.call("listAccounts");
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const assertions = fetchMock.mock.calls.map((c) =>
      headerOf(
        (c as unknown as [URL, RequestInit])[1],
        "X-Refinity-User-Assertion",
      ),
    );
    expect(new Set(assertions).size).toBe(3);
    const correlations = fetchMock.mock.calls.map((c) =>
      headerOf((c as unknown as [URL, RequestInit])[1], "X-Correlation-Id"),
    );
    expect(new Set(correlations).size).toBe(1);
  });

  it("gives up after the third attempt and surfaces the last backend error", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        json(504, {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "x",
            correlation_id: "c",
          },
        }),
      ),
    );
    const client = makeClient(fetchMock);
    await expect(client.call("listAccounts")).rejects.toBeInstanceOf(
      InvestorApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry 401 / 404 / 409 / 422 / 429 and exposes Retry-After", async () => {
    for (const [status, code] of [
      [401, "AUTHENTICATION_FAILED"],
      [404, "RESOURCE_NOT_FOUND"],
      [409, "VERSION_CONFLICT"],
      [422, "VALIDATION_ERROR"],
      [429, "RATE_LIMITED"],
    ] as const) {
      const fetchMock = vi.fn(() =>
        Promise.resolve(
          json(
            status,
            { error: { code, message: "x", correlation_id: "c" } },
            { "Retry-After": "7" },
          ),
        ),
      );
      const client = makeClient(fetchMock);
      const err = await client.call("listAccounts").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvestorApiError);
      expect((err as InvestorApiError).status).toBe(status);
      expect((err as InvestorApiError).code).toBe(code);
      expect((err as InvestorApiError).retryAfterSeconds).toBe(7);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("stops retrying when the 10 s budget is exhausted", async () => {
    let t = 0;
    const fetchMock = vi.fn(() => {
      t += 10_000;
      return Promise.reject(new TypeError("network down"));
    });
    const client = makeClient(fetchMock, { now: () => t });
    await expect(client.call("listAccounts")).rejects.toBeInstanceOf(
      InvestorApiTransportError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("InvestorApiClient — contract enforcement", () => {
  it("rejects a response with an unknown field as a contract-version mismatch", async () => {
    const body = structuredClone(exampleFor("listAccounts")) as {
      data: Record<string, unknown>;
    };
    body.data["surprise"] = true;
    const client = makeClient(vi.fn(() => Promise.resolve(json(200, body))));
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
      baseUrl: "https://investor-api-74kl57biwa-uw.a.run.app",
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

  it("stream() returns the raw event-stream text and forwards Last-Event-ID", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response("id: evt_1\nevent: valuation.updated\ndata: {}\n\n", {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "X-Correlation-Id": "c",
          },
        }),
      ),
    );
    const client = makeClient(fetchMock);
    const out = await client.stream({
      path: { account_id: ACCOUNT },
      lastEventId: "evt_0",
    });
    expect(out.text).toContain("id: evt_1");
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(headerOf(init, "Last-Event-ID")).toBe("evt_0");
    expect(headerOf(init, "Accept")).toBe("text/event-stream");
  });
});
