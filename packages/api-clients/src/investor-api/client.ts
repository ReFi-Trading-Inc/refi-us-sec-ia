/**
 * Server-only Investor API client for the vendored v1.1.0-alpha.2 contract.
 *
 * ─── Boundary ──────────────────────────────────────────────────────────────
 * This module runs in the BFF only. It must never be imported by browser code
 * (`investor-api-boundary.test.ts` enforces it). The browser talks to the BFF;
 * the BFF talks to Daniel's services with TWO credentials per request:
 *
 *   Authorization: Bearer <google-oidc-id-token>     ← `getBearer()`  (injected)
 *   X-Refinity-User-Assertion: <fresh ES256 JWT>      ← `mintAssertion()` (injected)
 *   X-Correlation-Id: <opaque, generated per call>
 *
 * How the Google credential is obtained (metadata server on Cloud Run vs an
 * external OIDC → WIF exchange) is an architecture decision outside this
 * module — hence injection. The assertion is minted FRESH PER ATTEMPT, so a
 * retried read never replays a JTI.
 *
 * ─── Contract rules encoded here (package README) ──────────────────────────
 * - Every Investor API POST/PATCH/DELETE requires `Idempotency-Key`; PATCH
 *   requires `If-Match`. Missing → thrown before any network call.
 * - Mutations are NEVER retried automatically.
 * - Ordinary GETs: total budget 10 s, at most two jittered retries on
 *   transport failure or 502/503/504, new assertion each attempt.
 * - Requests are validated against `schemas.json` before sending; responses
 *   after receiving. Any mismatch is `ContractVersionMismatchError`.
 * - `baseUrl` must be loopback unless `allowRemote` is set: the connected Dev
 *   services are `provisioned_not_enabled` and no addendum has promoted them.
 * - Nothing here logs, traces, or returns a token, assertion, or credential.
 */
import type { operations } from "../generated/investor-api.gen";
import { CONTRACT_ROUTES, type ContractRoute } from "./package";
import {
  IdempotencyKeyRequiredError,
  IfMatchRequiredError,
  InvestorApiError,
  InvestorApiTransportError,
  RemoteBaseUrlNotAllowedError,
} from "./errors";
import { expandPath, routeFor, type OperationId } from "./routes";
import { assertMatches, hasSchema } from "./validation";

// ─── Type plumbing from the generated `operations` interface ────────────────

type Op<K extends OperationId> = operations[K];

type JsonBody<R> = R extends { content: { "application/json": infer B } }
  ? B
  : never;

type SuccessStatus = 200 | 201 | 202;

export type OperationRequestBody<K extends OperationId> =
  Op<K> extends { requestBody: { content: { "application/json": infer B } } }
    ? B
    : Op<K> extends {
          requestBody?: { content: { "application/json": infer B } };
        }
      ? B | undefined
      : undefined;

export type OperationResponse<K extends OperationId> = {
  [S in keyof Op<K>["responses"] & SuccessStatus]: JsonBody<
    Op<K>["responses"][S]
  >;
}[keyof Op<K>["responses"] & SuccessStatus];

type PathParams<K extends OperationId> = Op<K>["parameters"] extends {
  path: infer P;
}
  ? P extends Record<string, string>
    ? P
    : never
  : never;

type QueryParams<K extends OperationId> = Op<K>["parameters"] extends {
  query?: infer Q;
}
  ? Q
  : never;

export interface CallOptions<K extends OperationId> {
  path?: PathParams<K>;
  query?: QueryParams<K>;
  body?: OperationRequestBody<K>;
  /** Required on every Investor API mutation. Reuse only with a byte-identical body. */
  idempotencyKey?: string;
  /** Required on PATCH; optional version binding on action/disconnect. */
  ifMatch?: string;
  /** SSE resume cursor (`streamAccountEvents`). */
  lastEventId?: string;
  signal?: AbortSignal;
}

export interface InvestorApiResult<K extends OperationId> {
  status: number;
  correlationId: string;
  data: OperationResponse<K>;
  headers: Headers;
}

/** `streamAccountEvents` returns the raw event-stream text (the BFF re-frames it). */
export interface InvestorApiStreamResult {
  status: number;
  correlationId: string;
  text: string;
  headers: Headers;
}

export interface InvestorApiClientOptions {
  baseUrl: string;
  /** Google OIDC ID token for the target service. Injected; never read from env here. */
  getBearer: () => Promise<string>;
  /** Fresh single-use ES256 user assertion. Called once per attempt. */
  mintAssertion: () => Promise<string>;
  fetch?: typeof fetch;
  /** Only a reviewed BFF configuration path may set this. */
  allowRemote?: boolean;
  correlationId?: () => string;
  /** Test seams. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export const READ_BUDGET_MS = 10_000;
export const MAX_READ_RETRIES = 2;
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
]);

function defaultCorrelationId(): string {
  return `bff_${crypto.randomUUID().replace(/-/g, "")}`;
}

function isMutation(route: ContractRoute): boolean {
  return route.method !== "GET";
}

function assertLoopbackOrAllowed(baseUrl: string, allowRemote: boolean): URL {
  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Investor API base URL must be http(s), got ${url.protocol}`,
    );
  }
  if (!allowRemote && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new RemoteBaseUrlNotAllowedError(url.hostname);
  }
  return url;
}

function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get("Retry-After");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function errorFromResponse(
  res: Response,
  fallbackCorrelation: string,
): Promise<InvestorApiError> {
  let code = "UNKNOWN_ERROR";
  let message = "request could not be completed";
  const echoed = res.headers.get("X-Correlation-Id");
  let correlationId = typeof echoed === "string" ? echoed : fallbackCorrelation;
  try {
    const parsed: unknown = await res.json();
    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      assertMatches("ErrorEnvelope", parsed, "response");
      const envelope = parsed as {
        error: { code: string; message: string; correlation_id: string };
      };
      code = envelope.error.code;
      message = envelope.error.message;
      correlationId = envelope.error.correlation_id;
    }
  } catch {
    // Non-JSON or non-envelope error body: keep the status-derived defaults.
  }
  return new InvestorApiError({
    status: res.status,
    code,
    message,
    correlationId,
    retryAfterSeconds: parseRetryAfter(res.headers),
  });
}

export class InvestorApiClient {
  private readonly baseUrl: URL;
  private readonly opts: Required<
    Pick<
      InvestorApiClientOptions,
      "fetch" | "correlationId" | "now" | "sleep" | "random"
    >
  > &
    Pick<InvestorApiClientOptions, "getBearer" | "mintAssertion">;

  constructor(options: InvestorApiClientOptions) {
    this.baseUrl = assertLoopbackOrAllowed(
      options.baseUrl,
      options.allowRemote ?? false,
    );
    this.opts = {
      getBearer: options.getBearer,
      mintAssertion: options.mintAssertion,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      correlationId: options.correlationId ?? defaultCorrelationId,
      now: options.now ?? (() => Date.now()),
      sleep:
        options.sleep ??
        ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
      random: options.random ?? Math.random,
    };
  }

  /** Typed call for any of the 41 contract operations except the SSE stream. */
  async call<K extends Exclude<OperationId, "streamAccountEvents">>(
    operationId: K,
    options: CallOptions<K> = {},
  ): Promise<InvestorApiResult<K>> {
    const route = routeFor(operationId);
    const { res, correlationId } = await this.perform(
      route,
      operationId,
      options,
    );
    const payload: unknown = await res.json();
    const schema = route.response_schema;
    if (!hasSchema(schema)) {
      throw new Error(`contract.json names unknown response schema ${schema}`);
    }
    assertMatches(schema, payload, "response");
    return {
      status: res.status,
      correlationId,
      data: payload as OperationResponse<K>,
      headers: res.headers,
    };
  }

  /** The account event stream. Returns the raw `text/event-stream` body. */
  async stream(
    options: CallOptions<"streamAccountEvents">,
  ): Promise<InvestorApiStreamResult> {
    const route = routeFor("streamAccountEvents");
    const { res, correlationId } = await this.perform(
      route,
      "streamAccountEvents",
      options,
    );
    const text = await res.text();
    return { status: res.status, correlationId, text, headers: res.headers };
  }

  private async perform<K extends OperationId>(
    route: ContractRoute,
    operationId: K,
    options: CallOptions<K>,
  ): Promise<{ res: Response; correlationId: string }> {
    const mutation = isMutation(route);
    if (mutation && route.runtime_owner === "investor-api") {
      if (!options.idempotencyKey) {
        throw new IdempotencyKeyRequiredError(operationId);
      }
      if (route.method === "PATCH" && !options.ifMatch) {
        throw new IfMatchRequiredError(operationId);
      }
    }

    let bodyText: string | undefined;
    if (route.request_schema) {
      if (!hasSchema(route.request_schema)) {
        throw new Error(
          `contract.json names unknown request schema ${route.request_schema}`,
        );
      }
      assertMatches(route.request_schema, options.body, "request");
      bodyText = JSON.stringify(options.body);
    } else if (options.body !== undefined) {
      throw new Error(`${operationId} takes no request body`);
    }

    // `PathParams<K>` collapses to `never` while K is generic, which is why the
    // lint rule sees the left side as always-undefined; at call sites it is a
    // concrete record.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const pathParams: Record<string, string> = options.path ?? {};
    const queryParams: Record<string, string | number | undefined> =
      options.query ?? {};
    const url = new URL(expandPath(route.path, pathParams), this.baseUrl);
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const correlationId = this.opts.correlationId();
    const started = this.opts.now();
    const maxAttempts = mutation ? 1 : MAX_READ_RETRIES + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const headers = new Headers({
        Accept:
          route.response_schema === "AccountEventStream"
            ? "text/event-stream"
            : "application/json",
        "X-Correlation-Id": correlationId,
        Authorization: `Bearer ${await this.opts.getBearer()}`,
      });
      if (route.runtime_owner === "investor-api") {
        // Fresh assertion per ATTEMPT, never reused across retries.
        headers.set(
          "X-Refinity-User-Assertion",
          await this.opts.mintAssertion(),
        );
      }
      if (bodyText !== undefined)
        headers.set("Content-Type", "application/json");
      if (options.idempotencyKey)
        headers.set("Idempotency-Key", options.idempotencyKey);
      if (options.ifMatch) headers.set("If-Match", options.ifMatch);
      if (options.lastEventId)
        headers.set("Last-Event-ID", options.lastEventId);

      let res: Response;
      try {
        res = await this.opts.fetch(url, {
          method: route.method,
          headers,
          body: bodyText,
          signal: options.signal,
          redirect: "error",
        });
      } catch (cause) {
        lastError = cause;
        if (mutation || !(await this.canRetry(attempt, maxAttempts, started))) {
          throw new InvestorApiTransportError(
            `${operationId}: transport failure after ${String(attempt)} attempt(s)`,
            attempt,
            cause,
          );
        }
        continue;
      }

      if (res.ok) return { res, correlationId };

      if (
        !mutation &&
        RETRYABLE_STATUSES.has(res.status) &&
        (await this.canRetry(attempt, maxAttempts, started))
      ) {
        lastError = await errorFromResponse(res, correlationId);
        continue;
      }
      throw await errorFromResponse(res, correlationId);
    }

    throw new InvestorApiTransportError(
      `${operationId}: read retry budget exhausted`,
      maxAttempts,
      lastError,
    );
  }

  /** Decide whether another READ attempt fits the budget; sleeps the jitter if so. */
  private async canRetry(
    attempt: number,
    maxAttempts: number,
    started: number,
  ): Promise<boolean> {
    if (attempt >= maxAttempts) return false;
    const elapsed = this.opts.now() - started;
    const jitterMs = Math.floor(100 * attempt + this.opts.random() * 200);
    if (elapsed + jitterMs >= READ_BUDGET_MS) return false;
    await this.opts.sleep(jitterMs);
    return true;
  }
}

export function createInvestorApiClient(
  options: InvestorApiClientOptions,
): InvestorApiClient {
  return new InvestorApiClient(options);
}

/** Convenience for tests and tooling: the operation ids the contract declares. */
export const CONTRACT_OPERATION_IDS: readonly OperationId[] =
  CONTRACT_ROUTES.map((r) => r.operation_id as OperationId);
