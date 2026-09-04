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
  PRIVATE_CACHE_CONTROL,
  PUBLIC_JWKS_CACHE_CONTROL,
  READ_BUDGET_MS,
  type InvestorApiClientOptions,
  type RuntimeTarget,
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

/** A private JSON response as the contract declares it (Cache-Control included). */
function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": PRIVATE_CACHE_CONTROL,
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

const IDENTITY_HOST = "http://127.0.0.1:1";
const INVESTOR_HOST = "http://localhost:2";

function target(
  baseUrl: string,
  bearer: string,
  extra: Partial<RuntimeTarget> = {},
): RuntimeTarget {
  return { baseUrl, getBearer: () => Promise.resolve(bearer), ...extra };
}

function makeClient(
  fetchImpl: FetchLike,
  overrides: Partial<InvestorApiClientOptions> = {},
) {
  let n = 0;
  return createInvestorApiClient({
    identityCcid: target(IDENTITY_HOST, "identity-bearer"),
    investorApi: target(INVESTOR_HOST, "investor-bearer"),
    mintAssertion: () => Promise.resolve(`assertion-${String(++n)}`),
    fetch: fetchImpl,
    random: () => 0,
    ...overrides,
  });
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

function callOf(mock: ReturnType<typeof vi.fn>, call = 0): [URL, RequestInit] {
  return mock.mock.calls[call] as unknown as [URL, RequestInit];
}

function initOf(mock: ReturnType<typeof vi.fn>, call = 0): RequestInit {
  return callOf(mock, call)[1];
}

afterEach(() => {
  vi.useRealTimers();
});

// ─── 1. Two runtime targets ────────────────────────────────────────────────

describe("two runtime targets: routing and credentials are runtime-aware", () => {
  it("exchangeIdentity → identity-ccid host + identity-ccid bearer, no assertion; investor bearer never invoked", async () => {
    const identityBearer = vi.fn(() => Promise.resolve("identity-bearer"));
    const investorBearer = vi.fn(() => Promise.resolve("investor-bearer"));
    const mintAssertion = vi.fn(() => Promise.resolve("assertion"));
    const fetchMock = vi.fn(() =>
      Promise.resolve(json(200, exampleFor("exchangeIdentity"))),
    );
    const client = makeClient(fetchMock, {
      identityCcid: { baseUrl: IDENTITY_HOST, getBearer: identityBearer },
      investorApi: { baseUrl: INVESTOR_HOST, getBearer: investorBearer },
      mintAssertion,
    });
    await client.call("exchangeIdentity", {
      body: examples.requests["IdentityExchangeRequest"] as never,
    });
    const [url, init] = callOf(fetchMock);
    expect(url.origin).toBe(IDENTITY_HOST);
    expect(url.pathname).toBe("/api/v1/identity/exchanges");
    expect(headerOf(init, "Authorization")).toBe("Bearer identity-bearer");
    expect(headerOf(init, "X-Refinity-User-Assertion")).toBeNull();
    expect(identityBearer).toHaveBeenCalledTimes(1);
    expect(investorBearer).not.toHaveBeenCalled();
    expect(mintAssertion).not.toHaveBeenCalled();
  });

  it("getIdentityJwks → identity-ccid host, zero credentials, neither provider invoked", async () => {
    const identityBearer = vi.fn(() => Promise.resolve("identity-bearer"));
    const investorBearer = vi.fn(() => Promise.resolve("investor-bearer"));
    const mintAssertion = vi.fn(() => Promise.resolve("assertion"));
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        json(200, exampleFor("getIdentityJwks"), {
          "Cache-Control": PUBLIC_JWKS_CACHE_CONTROL,
        }),
      ),
    );
    const client = makeClient(fetchMock, {
      identityCcid: { baseUrl: IDENTITY_HOST, getBearer: identityBearer },
      investorApi: { baseUrl: INVESTOR_HOST, getBearer: investorBearer },
      mintAssertion,
    });
    const result = await client.call("getIdentityJwks");
    const [url, init] = callOf(fetchMock);
    expect(url.origin).toBe(IDENTITY_HOST);
    expect(url.pathname).toBe("/.well-known/jwks.json");
    expect(headerOf(init, "Authorization")).toBeNull();
    expect(headerOf(init, "X-Refinity-User-Assertion")).toBeNull();
    expect(headerOf(init, "X-Correlation-Id")).toBe(result.correlationId);
    expect(identityBearer).not.toHaveBeenCalled();
    expect(investorBearer).not.toHaveBeenCalled();
    expect(mintAssertion).not.toHaveBeenCalled();
  });

  it("every Investor API operation → investor-api host + investor bearer + fresh assertion; identity bearer never invoked", async () => {
    const identityBearer = vi.fn(() => Promise.resolve("identity-bearer"));
    const investorBearer = vi.fn(() => Promise.resolve("investor-bearer"));
    const fetchMock = vi.fn(() =>
      Promise.resolve(json(200, exampleFor("listAccounts"))),
    );
    const client = makeClient(fetchMock, {
      identityCcid: { baseUrl: IDENTITY_HOST, getBearer: identityBearer },
      investorApi: { baseUrl: INVESTOR_HOST, getBearer: investorBearer },
    });
    const result = await client.call("listAccounts", {
      query: { page_size: 10 },
    });
    const [url, init] = callOf(fetchMock);
    expect(url.toString()).toBe(
      `${INVESTOR_HOST}/api/v1/investor/accounts?page_size=10`,
    );
    expect(headerOf(init, "Authorization")).toBe("Bearer investor-bearer");
    expect(headerOf(init, "X-Refinity-User-Assertion")).toBe("assertion-1");
    expect(headerOf(init, "X-Correlation-Id")).toBe(result.correlationId);
    expect(result.correlationId).toMatch(/^bff_[0-9a-f]{32}$/);
    expect(investorBearer).toHaveBeenCalledTimes(1);
    expect(identityBearer).not.toHaveBeenCalled();
  });

  it("collapsing both targets to one host is detectable: identity and investor calls land on different origins", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, exampleFor("exchangeIdentity")))
      .mockResolvedValueOnce(json(200, exampleFor("getAccount")));
    const client = makeClient(fetchMock);
    await client.call("exchangeIdentity", {
      body: examples.requests["IdentityExchangeRequest"] as never,
    });
    await client.call("getAccount", { path: { account_id: ACCOUNT } });
    const origins = new Set([
      callOf(fetchMock, 0)[0].origin,
      callOf(fetchMock, 1)[0].origin,
    ]);
    expect(origins.size).toBe(2);
    expect(headerOf(initOf(fetchMock, 0), "Authorization")).not.toBe(
      headerOf(initOf(fetchMock, 1), "Authorization"),
    );
  });

  it("the simulator shape — both targets on one loopback URL — is allowed", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(json(200, exampleFor("listAccounts"))),
    );
    const client = makeClient(fetchMock, {
      identityCcid: target("http://127.0.0.1:8765", "fixture"),
      investorApi: target("http://127.0.0.1:8765", "fixture"),
    });
    expect((await client.call("listAccounts")).status).toBe(200);
  });

  it("remote promotion is explicit per target", () => {
    const remote = "https://investor-api-example.a.run.app";
    expect(() =>
      createInvestorApiClient({
        identityCcid: target(IDENTITY_HOST, "a"),
        investorApi: target(remote, "b"),
        mintAssertion: () => Promise.resolve("x"),
      }),
    ).toThrow(RemoteBaseUrlNotAllowedError);
    expect(() =>
      createInvestorApiClient({
        identityCcid: target(IDENTITY_HOST, "a"),
        investorApi: target(remote, "b", { allowRemote: true }),
        mintAssertion: () => Promise.resolve("x"),
      }),
    ).not.toThrow();
    // Promoting one target does not promote the other.
    expect(() =>
      createInvestorApiClient({
        identityCcid: target(remote, "a"),
        investorApi: target(INVESTOR_HOST, "b", { allowRemote: true }),
        mintAssertion: () => Promise.resolve("x"),
      }),
    ).toThrow(RemoteBaseUrlNotAllowedError);
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

// ─── Error responses fail closed on drift ──────────────────────────────────

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
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": PRIVATE_CACHE_CONTROL,
        "X-Correlation-Id": "corr_x",
      },
    });
    const client2 = makeClient(() => Promise.resolve(broken));
    const err2 = await client2.call("listAccounts").catch((e: unknown) => e);
    expect(err2).toBeInstanceOf(ContractVersionMismatchError);
    expect((err2 as ContractVersionMismatchError).problems.join(" ")).toMatch(
      /not valid JSON/,
    );
  });

  it("an impossible status/code pair for the route's error profile fails loudly", async () => {
    const wrongCode = makeClient(() =>
      Promise.resolve(json(409, envelope("ALLOCATION_INVALID"))),
    );
    const e1 = await wrongCode.call("listAccounts").catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(ContractVersionMismatchError);
    expect((e1 as ContractVersionMismatchError).problems.join(" ")).toMatch(
      /ALLOCATION_INVALID/,
    );

    const wrongStatus = makeClient(() =>
      Promise.resolve(json(400, envelope("VALIDATION_ERROR"))),
    );
    const e2 = await wrongStatus.call("listAccounts").catch((e: unknown) => e);
    expect(e2).toBeInstanceOf(ContractVersionMismatchError);
    expect((e2 as ContractVersionMismatchError).problems.join(" ")).toMatch(
      /HTTP 400/,
    );

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

  it("error responses must carry private, no-store: missing or cacheable Cache-Control → mismatch", async () => {
    const cases: [number, string, string | null][] = [
      [404, "RESOURCE_NOT_FOUND", null],
      [404, "RESOURCE_NOT_FOUND", "public"],
      [404, "RESOURCE_NOT_FOUND", "public, max-age=60"],
      [429, "RATE_LIMITED", null],
      [429, "RATE_LIMITED", "no-store"],
      [401, "AUTHENTICATION_FAILED", "private, max-age=0"],
    ];
    for (const [status, code, cacheControl] of cases) {
      const client = makeClient(() =>
        Promise.resolve(
          new Response(JSON.stringify(envelope(code)), {
            status,
            headers: {
              "Content-Type": "application/json",
              "X-Correlation-Id": "corr_x",
              ...(cacheControl === null
                ? {}
                : { "Cache-Control": cacheControl }),
            },
          }),
        ),
      );
      const err = await client.call("listAccounts").catch((e: unknown) => e);
      expect(
        err,
        `${String(status)} ${code} ${cacheControl ?? "(absent)"}`,
      ).toBeInstanceOf(ContractVersionMismatchError);
      expect((err as ContractVersionMismatchError).problems.join(" ")).toMatch(
        /Cache-Control/,
      );
    }
    // Conformant policy → the normal InvestorApiError; case/whitespace normalised.
    const ok = makeClient(() =>
      Promise.resolve(
        json(429, envelope("RATE_LIMITED"), {
          "Cache-Control": "Private,  No-Store",
        }),
      ),
    );
    const accepted = await ok.call("listAccounts").catch((e: unknown) => e);
    expect(accepted).toBeInstanceOf(InvestorApiError);
    expect((accepted as InvestorApiError).code).toBe("RATE_LIMITED");
  });

  it("the public JWKS caching exception never applies to an error response", async () => {
    const client = makeClient(() =>
      Promise.resolve(
        json(404, envelope("RESOURCE_NOT_FOUND"), {
          "Cache-Control": PUBLIC_JWKS_CACHE_CONTROL,
        }),
      ),
    );
    await expect(client.call("getIdentityJwks")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
  });

  it("the declared X-Correlation-Id response header is required on errors and successes (1–128 chars)", async () => {
    const withCorrelation = (
      value: string | null,
      body: unknown,
      status = 200,
    ) =>
      makeClient(() =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": PRIVATE_CACHE_CONTROL,
              ...(value === null ? {} : { "X-Correlation-Id": value }),
            },
          }),
        ),
      );
    for (const value of [null, "", "   ", "x".repeat(129)]) {
      const onSuccess = await withCorrelation(value, exampleFor("listAccounts"))
        .call("listAccounts")
        .catch((e: unknown) => e);
      expect(
        onSuccess,
        `success ${value === null ? "(absent)" : String(value.length)}`,
      ).toBeInstanceOf(ContractVersionMismatchError);
      expect(
        (onSuccess as ContractVersionMismatchError).problems.join(" "),
      ).toMatch(/X-Correlation-Id/);
      const onError = await withCorrelation(
        value,
        envelope("RESOURCE_NOT_FOUND"),
        404,
      )
        .call("listAccounts")
        .catch((e: unknown) => e);
      expect(
        onError,
        `error ${value === null ? "(absent)" : String(value.length)}`,
      ).toBeInstanceOf(ContractVersionMismatchError);
    }
    // Boundary: 128 characters is valid; no equality with the request id is required.
    const max = "c".repeat(128);
    const result = await withCorrelation(max, exampleFor("listAccounts")).call(
      "listAccounts",
    );
    expect(result.status).toBe(200);
    expect(result.correlationId).toMatch(/^bff_/); // caller-generated request id stays the call identifier
    const err = (await withCorrelation(max, envelope("RESOURCE_NOT_FOUND"), 404)
      .call("listAccounts")
      .catch((e: unknown) => e)) as InvestorApiError;
    expect(err).toBeInstanceOf(InvestorApiError);
    expect(err.correlationId).toBe("corr_x"); // the envelope's own value, carried, not compared
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

// ─── Exact wire success status, media type, cache-control ──────────────────

describe("exact success status, media type and cache-control are enforced", () => {
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
    const text = makeClient(() =>
      Promise.resolve(
        new Response(JSON.stringify(exampleFor("listAccounts")), {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": PRIVATE_CACHE_CONTROL,
          },
        }),
      ),
    );
    await expect(text.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
  });

  it("private responses must carry exactly `private, no-store`", async () => {
    const absent = makeClient(() =>
      Promise.resolve(
        new Response(JSON.stringify(exampleFor("listAccounts")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const e1 = await absent.call("listAccounts").catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(ContractVersionMismatchError);
    expect((e1 as ContractVersionMismatchError).problems.join(" ")).toMatch(
      /Cache-Control header is absent/,
    );

    const cacheable = makeClient(() =>
      Promise.resolve(
        json(200, exampleFor("listAccounts"), {
          "Cache-Control": "public, max-age=60",
        }),
      ),
    );
    await expect(cacheable.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );

    const partial = makeClient(() =>
      Promise.resolve(
        json(200, exampleFor("listAccounts"), { "Cache-Control": "no-store" }),
      ),
    );
    await expect(partial.call("listAccounts")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );

    const spaced = makeClient(() =>
      Promise.resolve(
        json(200, exampleFor("listAccounts"), {
          "Cache-Control": "Private,  No-Store",
        }),
      ),
    );
    expect((await spaced.call("listAccounts")).status).toBe(200);
  });

  it("the public JWKS must carry a bounded public cache policy (or stricter)", async () => {
    const jwks = (cacheControl: string | null) =>
      makeClient(() =>
        Promise.resolve(
          new Response(JSON.stringify(exampleFor("getIdentityJwks")), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Correlation-Id": "corr_x",
              ...(cacheControl === null
                ? {}
                : { "Cache-Control": cacheControl }),
            },
          }),
        ),
      );
    expect(
      (await jwks(PUBLIC_JWKS_CACHE_CONTROL).call("getIdentityJwks")).status,
    ).toBe(200);
    expect(
      (
        await jwks("public, max-age=60, must-revalidate").call(
          "getIdentityJwks",
        )
      ).status,
    ).toBe(200);
    // Daniel's simulator answers the JWKS route with private, no-store — stricter, accepted.
    expect(
      (await jwks(PRIVATE_CACHE_CONTROL).call("getIdentityJwks")).status,
    ).toBe(200);
    await expect(jwks(null).call("getIdentityJwks")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
    await expect(
      jwks("public, max-age=86400").call("getIdentityJwks"),
    ).rejects.toBeInstanceOf(ContractVersionMismatchError);
    await expect(jwks("public").call("getIdentityJwks")).rejects.toBeInstanceOf(
      ContractVersionMismatchError,
    );
    await expect(
      jwks("public, max-age=300, immutable").call("getIdentityJwks"),
    ).rejects.toBeInstanceOf(ContractVersionMismatchError);
  });

  it("private requests ask the fetch layer for no-store explicitly; the public JWKS does not", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, exampleFor("listAccounts")))
      .mockResolvedValueOnce(
        json(200, exampleFor("getIdentityJwks"), {
          "Cache-Control": PUBLIC_JWKS_CACHE_CONTROL,
        }),
      );
    const client = makeClient(fetchMock);
    await client.call("listAccounts");
    await client.call("getIdentityJwks");
    expect(initOf(fetchMock, 0).cache).toBe("no-store");
    expect(initOf(fetchMock, 1).cache).toBeUndefined();
  });

  it("a success body that is not valid JSON is a contract mismatch", async () => {
    const client = makeClient(() =>
      Promise.resolve(
        new Response("{oops", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": PRIVATE_CACHE_CONTROL,
          },
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

// ─── 2. Absolute read deadline through body consumption ────────────────────

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

  /** Valid 200 JSON headers immediately; the body then stalls forever (until abort). */
  function stalledBodyFetch(): ReturnType<typeof vi.fn> {
    return vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"data":'));
          init?.signal?.addEventListener("abort", () => {
            const reason: unknown = init.signal?.reason;
            controller.error(
              reason instanceof Error ? reason : new Error("aborted"),
            );
          });
        },
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": PRIVATE_CACHE_CONTROL,
            "X-Correlation-Id": "corr_x",
          },
        }),
      );
    });
  }

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

  it("valid 200 headers then a stalled body: the call is aborted at the ORIGINAL absolute deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = stalledBodyFetch();
    const client = makeClient(fetchMock);
    const pending = client.call("listAccounts").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(READ_BUDGET_MS - 1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false); // headers arrived long ago; body still stalled; deadline not reset
    await vi.advanceTimersByTimeAsync(1);
    const err = await pending;
    expect(err).toBeInstanceOf(InvestorApiTransportError);
    expect((err as InvestorApiTransportError).cause).toBeInstanceOf(
      DeadlineExceededError,
    );
    expect((err as InvestorApiTransportError).message).toMatch(
      /response body aborted/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("the budget covers bearer acquisition and assertion minting too", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    const client = makeClient(fetchMock, {
      investorApi: {
        baseUrl: INVESTOR_HOST,
        getBearer: () => new Promise<string>(() => undefined),
      },
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
});
