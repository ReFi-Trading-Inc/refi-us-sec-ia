/**
 * Server-only Investor API client for the vendored v1.1.0-alpha.2 contract.
 *
 * ─── Boundary ──────────────────────────────────────────────────────────────
 * This module runs in the BFF only. It must never be imported by browser code
 * (`investor-api-boundary.test.ts` enforces it). The browser talks to the BFF;
 * the BFF talks to Daniel's services with the credentials each operation's
 * OpenAPI `security` declares (`auth-policy.ts`, verified against openapi.json):
 *
 *   Authorization: Bearer <google-oidc-id-token>     ← target.getBearer() (injected)
 *   X-Refinity-User-Assertion: <fresh ES256 JWT>      ← mintAssertion()   (injected)
 *   X-Correlation-Id: <opaque, generated per call>
 *
 * ─── Two runtime targets ───────────────────────────────────────────────────
 * The package is ONE OpenAPI document with TWO runtime owners, each with its
 * own service URL and its own Google OIDC target audience:
 *
 *   identity-ccid  → exchangeIdentity (Google bearer), getIdentityJwks (none)
 *   investor-api   → the other 39 operations (Google bearer + user assertion)
 *
 * Each target is injected separately (`identityCcid`, `investorApi`) and
 * resolved from `contract.json.routes[].runtime_owner`. The simulator points
 * both at one loopback URL; connected Dev will not. The `.invalid` OpenAPI
 * server entries and the package's connection document are never read as
 * configuration.
 * How a Google credential is obtained (metadata server vs external OIDC → WIF)
 * is decided outside this module — hence injection.
 *
 * ─── Contract rules encoded here (package README + contract.json) ──────────
 * - Investor API POST/PATCH/DELETE require `Idempotency-Key`; PATCH requires
 *   `If-Match`. Missing → thrown before any network call.
 * - Mutations are NEVER retried automatically.
 * - Ordinary reads have ONE absolute deadline (10 s) covering bearer
 *   acquisition, assertion mint, fetch, the COMPLETE response-body read, JSON
 *   parse/validation, retry delays and retries; a hanging fetch or a stalled
 *   body is aborted at the deadline; at most two retries on transport failure
 *   or 502/503/504, each with a new assertion, and only if time remains.
 * - Success is the EXACT `success_status`, the declared media type, the
 *   declared `X-Correlation-Id` header (1–128 chars) and the declared
 *   `Cache-Control` policy (`private, no-store` for all private responses; a
 *   bounded public policy for the public JWKS). Error responses must carry the
 *   same correlation header and the private no-store policy.
 * - Every JSON failure must be a valid `ErrorEnvelope` whose HTTP status and
 *   `error.code` are allowed by the route's `error_profile`; anything else is a
 *   contract mismatch, never an invented `UNKNOWN_ERROR`.
 * - Requests are validated against `schemas.json` before sending; responses
 *   and every SSE event after receiving. An SSE frame's `id:` must equal the
 *   validated event's `event_id`.
 * - Each target's `baseUrl` must be loopback unless that target sets
 *   `allowRemote` from a reviewed configuration path.
 * - Nothing here logs, traces, or returns a token, assertion, or credential.
 */
import type { components, operations } from "../generated/investor-api.gen";
import { authPolicyFor, type AuthPolicy } from "./auth-policy";
import {
  ContractVersionMismatchError,
  IdempotencyKeyRequiredError,
  IfMatchRequiredError,
  InvestorApiError,
  InvestorApiTransportError,
  RemoteBaseUrlNotAllowedError,
} from "./errors";
import {
  CONTRACT_DOCUMENT,
  type ContractRoute,
  type RuntimeOwner,
} from "./package";
import { expandPath, routeFor, type OperationId } from "./routes";
import { parseSseFrames, type SseFrame } from "./sse";
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

export type AccountEvent = components["schemas"]["AccountEvent"];

export interface CallOptions<K extends OperationId> {
  path?: PathParams<K>;
  query?: QueryParams<K>;
  body?: OperationRequestBody<K>;
  /** Required on every Investor API mutation. Reuse only with a byte-identical body. */
  idempotencyKey?: string;
  /** Required on PATCH; optional version binding on action/disconnect. */
  ifMatch?: string;
  /** SSE resume cursor (`streamAccountEvents`). Forwarded exactly. */
  lastEventId?: string;
  /** Caller cancellation. Composed with — never replacing — the internal deadline. */
  signal?: AbortSignal;
}

export interface InvestorApiResult<K extends OperationId> {
  status: number;
  correlationId: string;
  data: OperationResponse<K>;
  headers: Headers;
}

/** One validated account event from the stream. */
export interface ValidatedAccountEvent {
  /** The event id — equal to both the SSE `id:` frame field and `event.event_id`. */
  eventId: string;
  /** SSE `event:` name (equal to `event.event_type` on the wire). */
  eventName: string | null;
  /** The decoded, schema-validated `AccountEvent`. */
  event: AccountEvent;
}

export interface InvestorApiEventStream {
  status: number;
  correlationId: string;
  headers: Headers;
  /** Validated events, surfaced incrementally; throws `ContractVersionMismatchError` on drift. */
  events: AsyncIterable<ValidatedAccountEvent>;
  /** Cancel the open stream (closes the body). */
  cancel(reason?: unknown): void;
}

/** One backend runtime: its service base URL and its Google OIDC credential. */
export interface RuntimeTarget {
  /** Service base URL for this runtime. Loopback unless `allowRemote`. */
  baseUrl: string;
  /**
   * Google OIDC ID token minted for THIS runtime's target audience. Injected;
   * never read from env or the package's connection document here.
   */
  getBearer: () => Promise<string>;
  /** Only a reviewed BFF configuration path may set this, per target. */
  allowRemote?: boolean;
}

export interface InvestorApiClientOptions {
  /** `identity-ccid`: identity exchange + public JWKS. */
  identityCcid: RuntimeTarget;
  /** `investor-api`: the 39 account/product operations. */
  investorApi: RuntimeTarget;
  /** Fresh single-use ES256 user assertion. Called once per Investor API attempt. */
  mintAssertion: () => Promise<string>;
  fetch?: typeof fetch;
  correlationId?: () => string;
  /** Absolute budget for an ordinary (non-stream) read, in ms. */
  readBudgetMs?: number;
  /** Bound on establishing an SSE connection (headers received), in ms. */
  streamConnectTimeoutMs?: number;
  /** Test seams. */
  now?: () => number;
  random?: () => number;
}

export const READ_BUDGET_MS = 10_000;
export const MAX_READ_RETRIES = 2;
export const STREAM_CONNECT_TIMEOUT_MS = 10_000;
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
]);
const JSON_MEDIA_TYPE = "application/json";
const SSE_MEDIA_TYPE = "text/event-stream";

/** `components.headers.PrivateNoStore` — every private response. */
export const PRIVATE_CACHE_CONTROL = "private, no-store";
/** `components.headers.PublicJwksCache` — the public identity JWKS. */
export const PUBLIC_JWKS_CACHE_CONTROL = "public, max-age=300, must-revalidate";
/** Upper bound we accept for a public JWKS `max-age` (the contract's value). */
const PUBLIC_JWKS_MAX_AGE_SECONDS = 300;

interface ErrorProfile {
  readonly codes: readonly string[];
  readonly statuses: readonly number[];
}

const ERROR_PROFILES: Readonly<Record<string, ErrorProfile>> =
  CONTRACT_DOCUMENT.error_profiles;

function defaultCorrelationId(): string {
  return `bff_${crypto.randomUUID().replace(/-/g, "")}`;
}

function isMutation(route: ContractRoute): boolean {
  return route.method !== "GET";
}

function resolveBaseUrl(target: RuntimeTarget, owner: RuntimeOwner): URL {
  const url = new URL(target.baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${owner} base URL must be http(s), got ${url.protocol}`);
  }
  if (!(target.allowRemote ?? false) && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new RemoteBaseUrlNotAllowedError(url.hostname);
  }
  return url;
}

/** `application/json; charset=utf-8` → `application/json`. */
function mediaTypeOf(headers: Headers): string {
  const raw = headers.get("Content-Type");
  if (raw === null) return "";
  const semicolon = raw.indexOf(";");
  return (semicolon === -1 ? raw : raw.slice(0, semicolon))
    .trim()
    .toLowerCase();
}

/** Parse `Cache-Control` into lowercase directives → values. */
function cacheDirectives(headers: Headers): Map<string, string | null> | null {
  const raw = headers.get("Cache-Control");
  if (raw === null) return null;
  const out = new Map<string, string | null>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed === "") continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) out.set(trimmed, null);
    else out.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return out;
}

/**
 * The contract's cache policy for a success response.
 *
 * - Private responses (40 operations): exactly `private, no-store`.
 * - Public JWKS: the contract constant `public, max-age=300, must-revalidate`.
 *   A STRICTER policy (`no-store`, or a shorter `max-age`) is also accepted,
 *   because it never introduces caching the contract forbids — Daniel's own
 *   simulator answers the JWKS route with `private, no-store` (a deviation
 *   from his `PublicJwksCache` header, flagged to him). Absent, unbounded, or
 *   longer-lived caching is a mismatch.
 */
function cacheControlProblems(headers: Headers, policy: AuthPolicy): string[] {
  const directives = cacheDirectives(headers);
  const received = headers.get("Cache-Control") ?? "";
  if (directives === null) return ["Cache-Control header is absent"];
  if (policy !== "none") {
    const ok =
      directives.size === 2 &&
      directives.has("private") &&
      directives.has("no-store");
    return ok
      ? []
      : [
          `Cache-Control "${received}" received, contract requires "${PRIVATE_CACHE_CONTROL}"`,
        ];
  }
  if (directives.has("no-store")) return [];
  const maxAge = directives.get("max-age");
  const maxAgeSeconds =
    maxAge === null || maxAge === undefined ? Number.NaN : Number(maxAge);
  if (
    directives.has("public") &&
    Number.isFinite(maxAgeSeconds) &&
    maxAgeSeconds >= 0 &&
    maxAgeSeconds <= PUBLIC_JWKS_MAX_AGE_SECONDS &&
    !directives.has("immutable")
  ) {
    return [];
  }
  return [
    `Cache-Control "${received}" received, contract requires "${PUBLIC_JWKS_CACHE_CONTROL}" (or stricter)`,
  ];
}

/** `components.headers.CorrelationId`: present, 1–128 characters. */
const CORRELATION_ID_MAX_LENGTH = 128;

/**
 * Shared response-header validation for success AND error responses: the
 * declared `X-Correlation-Id` must be present and 1–128 characters. No
 * equality with the request id or the envelope's `correlation_id` is
 * required — the package does not require it — and the caller-generated
 * request id stays the logical call identifier.
 */
function correlationHeaderProblems(headers: Headers): string[] {
  const raw = headers.get("X-Correlation-Id");
  if (raw === null) return ["X-Correlation-Id response header is absent"];
  const value = raw.trim();
  if (value.length === 0 || value.length > CORRELATION_ID_MAX_LENGTH) {
    return [
      `X-Correlation-Id response header length ${String(value.length)} is outside 1–${String(CORRELATION_ID_MAX_LENGTH)}`,
    ];
  }
  return [];
}

function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get("Retry-After");
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function profileFor(route: ContractRoute): ErrorProfile {
  const profile = ERROR_PROFILES[route.error_profile];
  if (profile === undefined) {
    throw new Error(
      `contract.json names unknown error profile ${route.error_profile} for ${route.operation_id}`,
    );
  }
  return profile;
}

/**
 * Turn a non-success response into the failure it represents.
 *
 * Fails CLOSED on drift: the body must be JSON (per the declared media type),
 * must parse, must validate as `ErrorEnvelope`, and its status and `error.code`
 * must be allowed by the route's error profile. Each of those failing is a
 * `ContractVersionMismatchError`; only a fully conformant envelope becomes an
 * `InvestorApiError`. JSON-parse failures and schema failures are handled
 * separately so a validation error is never swallowed by a parse catch.
 */
async function failureFromResponse(
  res: Response,
  route: ContractRoute,
  signal: AbortSignal,
): Promise<InvestorApiError> {
  const mediaType = mediaTypeOf(res.headers);
  if (mediaType !== JSON_MEDIA_TYPE) {
    throw new ContractVersionMismatchError("ErrorEnvelope", "response", [
      `HTTP ${String(res.status)} error body is "${mediaType || "(none)"}", contract requires application/json`,
    ]);
  }
  // Daniel's reusable error responses declare the same private no-store
  // policy and correlation header as private successes; the public JWKS
  // caching exception never applies to an error response.
  const headerProblems = [
    ...correlationHeaderProblems(res.headers),
    ...cacheControlProblems(res.headers, "google+assertion"),
  ];
  if (headerProblems.length > 0) {
    throw new ContractVersionMismatchError(
      "ErrorEnvelope",
      "response",
      headerProblems,
    );
  }
  const text = await readTextUnderSignal(res, signal, route.operation_id);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ContractVersionMismatchError("ErrorEnvelope", "response", [
      `HTTP ${String(res.status)} error body is not valid JSON`,
    ]);
  }
  // Schema validation is outside the parse try/catch on purpose.
  assertMatches("ErrorEnvelope", parsed, "response");
  const envelope = parsed as components["schemas"]["ErrorEnvelope"];

  const profile = profileFor(route);
  const problems: string[] = [];
  if (!profile.statuses.includes(res.status)) {
    problems.push(
      `HTTP ${String(res.status)} is not in error profile "${route.error_profile}"`,
    );
  }
  if (!profile.codes.includes(envelope.error.code)) {
    problems.push(
      `error.code "${envelope.error.code}" is not in error profile "${route.error_profile}"`,
    );
  }
  if (problems.length > 0) {
    throw new ContractVersionMismatchError(
      "ErrorEnvelope",
      "response",
      problems,
    );
  }
  return new InvestorApiError({
    status: res.status,
    code: envelope.error.code,
    message: envelope.error.message,
    correlationId: envelope.error.correlation_id,
    retryAfterSeconds: parseRetryAfter(res.headers),
  });
}

function assertSuccessShape(
  res: Response,
  route: ContractRoute,
  expectedMediaType: string,
  policy: AuthPolicy,
): void {
  const problems: string[] = [];
  if (res.status !== route.success_status) {
    problems.push(
      `HTTP ${String(res.status)} received, contract success_status is ${String(route.success_status)}`,
    );
  }
  const mediaType = mediaTypeOf(res.headers);
  if (mediaType !== expectedMediaType) {
    problems.push(
      `Content-Type "${mediaType || "(none)"}" received, contract requires ${expectedMediaType}`,
    );
  }
  problems.push(...correlationHeaderProblems(res.headers));
  problems.push(...cacheControlProblems(res.headers, policy));
  if (problems.length > 0) {
    throw new ContractVersionMismatchError(
      route.response_schema,
      "response",
      problems,
    );
  }
}

function composeSignals(
  a: AbortSignal | undefined,
  b: AbortSignal,
): AbortSignal {
  return a === undefined ? b : AbortSignal.any([a, b]);
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error
    ? reason
    : new DOMException("The operation was aborted.", "AbortError");
}

/** Resolve `promise`, or reject as soon as `signal` aborts. */
function underSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(abortReason(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Read the whole body under the SAME signal the request was sent with. The
 * fetch signal aborts an in-flight body read, and `underSignal` guarantees the
 * promise settles at the deadline even if a fetch implementation does not.
 */
async function readTextUnderSignal(
  res: Response,
  signal: AbortSignal,
  operationId: string,
): Promise<string> {
  try {
    return await underSignal(res.text(), signal);
  } catch (cause) {
    throw new InvestorApiTransportError(
      signal.aborted
        ? `${operationId}: response body aborted`
        : `${operationId}: response body read failed`,
      1,
      signal.aborted ? abortReason(signal) : cause,
    );
  }
}

function sleepUnderSignal(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class DeadlineExceededError extends Error {
  constructor(budgetMs: number) {
    super(`Investor API read budget of ${String(budgetMs)} ms exceeded`);
    this.name = "DeadlineExceededError";
  }
}

/** One logical call's time scope: composed signal + absolute deadline. */
interface CallScope {
  signal: AbortSignal;
  /** Absolute deadline (ms, per `now()`), or +∞ when no deadline applies. */
  deadlineAt: number;
  dispose(): void;
}

type Resolved = Required<
  Pick<
    InvestorApiClientOptions,
    | "fetch"
    | "correlationId"
    | "now"
    | "random"
    | "readBudgetMs"
    | "streamConnectTimeoutMs"
  >
> &
  Pick<InvestorApiClientOptions, "mintAssertion">;

interface ResolvedTarget {
  baseUrl: URL;
  getBearer: () => Promise<string>;
}

export class InvestorApiClient {
  private readonly targets: Readonly<Record<RuntimeOwner, ResolvedTarget>>;
  private readonly opts: Resolved;

  constructor(options: InvestorApiClientOptions) {
    this.targets = {
      "identity-ccid": {
        baseUrl: resolveBaseUrl(options.identityCcid, "identity-ccid"),
        getBearer: options.identityCcid.getBearer,
      },
      "investor-api": {
        baseUrl: resolveBaseUrl(options.investorApi, "investor-api"),
        getBearer: options.investorApi.getBearer,
      },
    };
    this.opts = {
      mintAssertion: options.mintAssertion,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      correlationId: options.correlationId ?? defaultCorrelationId,
      now: options.now ?? (() => Date.now()),
      random: options.random ?? Math.random,
      readBudgetMs: options.readBudgetMs ?? READ_BUDGET_MS,
      streamConnectTimeoutMs:
        options.streamConnectTimeoutMs ?? STREAM_CONNECT_TIMEOUT_MS,
    };
  }

  /** The runtime target a route is served by (per `contract.json`). */
  private targetFor(route: ContractRoute): ResolvedTarget {
    return this.targets[route.runtime_owner];
  }

  /** Typed call for any of the 41 contract operations except the SSE stream. */
  async call<K extends Exclude<OperationId, "streamAccountEvents">>(
    operationId: K,
    options: CallOptions<K> = {},
  ): Promise<InvestorApiResult<K>> {
    const route = routeFor(operationId);
    const policy = authPolicyFor(operationId);
    // ONE absolute deadline for an ordinary read: bearer, mint, fetch, the
    // complete body read, parse/validation, retry sleeps and retries all draw
    // from it. Mutations are not retried and are bounded only by the caller's
    // signal (an aborted mutation is recovered through the idempotent-replay
    // path, a decision the caller owns).
    const scope = this.openScope(options.signal, !isMutation(route));
    try {
      const { res, correlationId } = await this.perform(
        route,
        operationId,
        options,
        scope,
        JSON_MEDIA_TYPE,
      );
      assertSuccessShape(res, route, JSON_MEDIA_TYPE, policy);
      const text = await readTextUnderSignal(res, scope.signal, operationId);
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ContractVersionMismatchError(
          route.response_schema,
          "response",
          [`HTTP ${String(res.status)} success body is not valid JSON`],
        );
      }
      const schema = route.response_schema;
      if (!hasSchema(schema)) {
        throw new Error(
          `contract.json names unknown response schema ${schema}`,
        );
      }
      assertMatches(schema, payload, "response");
      return {
        status: res.status,
        correlationId,
        data: payload as OperationResponse<K>,
        headers: res.headers,
      };
    } finally {
      scope.dispose();
    }
  }

  /**
   * Open the account event stream. Connection establishment is bounded by
   * `streamConnectTimeoutMs`; once a valid `200 text/event-stream` is
   * established the ordinary read deadline does NOT apply — the caller's
   * signal / `cancel()` governs the live stream. Every event is validated
   * against `AccountEvent`, and its SSE `id:` must equal `event_id`, before
   * it is yielded.
   */
  async stream(
    options: CallOptions<"streamAccountEvents"> = {},
  ): Promise<InvestorApiEventStream> {
    const route = routeFor("streamAccountEvents");
    const policy = authPolicyFor("streamAccountEvents");
    const life = new AbortController(); // governs the live stream
    if (options.signal !== undefined) {
      const callerSignal = options.signal;
      if (callerSignal.aborted) life.abort(abortReason(callerSignal));
      else
        callerSignal.addEventListener(
          "abort",
          () => {
            life.abort(abortReason(callerSignal));
          },
          { once: true },
        );
    }
    // Connection establishment only: composed with the life signal, disposed
    // once headers are validated.
    const connect = new AbortController();
    const connectTimer = setTimeout(() => {
      connect.abort(
        new DeadlineExceededError(this.opts.streamConnectTimeoutMs),
      );
    }, this.opts.streamConnectTimeoutMs);
    const connectScope: CallScope = {
      signal: AbortSignal.any([life.signal, connect.signal]),
      deadlineAt: Number.POSITIVE_INFINITY,
      dispose: () => {
        clearTimeout(connectTimer);
      },
    };

    let res: Response;
    let correlationId: string;
    try {
      ({ res, correlationId } = await this.perform(
        route,
        "streamAccountEvents",
        { ...options, signal: undefined },
        connectScope,
        SSE_MEDIA_TYPE,
      ));
      assertSuccessShape(res, route, SSE_MEDIA_TYPE, policy);
    } finally {
      connectScope.dispose();
    }
    const body = res.body;
    if (body === null) {
      throw new ContractVersionMismatchError(
        route.response_schema,
        "response",
        ["event stream response has no body"],
      );
    }

    const events = (async function* (): AsyncGenerator<
      ValidatedAccountEvent,
      void,
      undefined
    > {
      for await (const frame of parseSseFrames(body, {
        signal: life.signal,
      })) {
        yield validateFrame(frame);
      }
    })();

    return {
      status: res.status,
      correlationId,
      headers: res.headers,
      events,
      cancel: (reason?: unknown) => {
        life.abort(reason);
      },
    };
  }

  private openScope(
    callerSignal: AbortSignal | undefined,
    withDeadline: boolean,
  ): CallScope {
    if (!withDeadline) {
      return {
        signal: callerSignal ?? new AbortController().signal,
        deadlineAt: Number.POSITIVE_INFINITY,
        dispose: () => undefined,
      };
    }
    const controller = new AbortController();
    const budget = this.opts.readBudgetMs;
    const timer = setTimeout(() => {
      controller.abort(new DeadlineExceededError(budget));
    }, budget);
    return {
      signal: composeSignals(callerSignal, controller.signal),
      deadlineAt: this.opts.now() + budget,
      dispose: () => {
        clearTimeout(timer);
      },
    };
  }

  private async perform<K extends OperationId>(
    route: ContractRoute,
    operationId: K,
    options: CallOptions<K>,
    scope: CallScope,
    accept: string,
  ): Promise<{ res: Response; correlationId: string }> {
    const mutation = isMutation(route);
    const policy = authPolicyFor(operationId);
    const target = this.targetFor(route);
    if (mutation && route.runtime_owner === "investor-api") {
      if (
        options.idempotencyKey === undefined ||
        options.idempotencyKey === ""
      ) {
        throw new IdempotencyKeyRequiredError(operationId);
      }
      if (
        route.method === "PATCH" &&
        (options.ifMatch === undefined || options.ifMatch === "")
      ) {
        throw new IfMatchRequiredError(operationId);
      }
    }

    let bodyText: string | undefined;
    if (route.request_schema !== null) {
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
    const url = new URL(expandPath(route.path, pathParams), target.baseUrl);
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const correlationId = this.opts.correlationId();
    const { signal } = scope;
    const maxAttempts = mutation ? 1 : MAX_READ_RETRIES + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const headers = new Headers({
        Accept: accept,
        "X-Correlation-Id": correlationId,
      });
      // Credential acquisition draws from the same deadline as the fetch, and
      // uses THIS runtime's Google credential (its own target audience).
      try {
        if (policy !== "none") {
          const bearer = await underSignal(target.getBearer(), signal);
          headers.set("Authorization", `Bearer ${bearer}`);
        }
        if (policy === "google+assertion") {
          // Fresh assertion per ATTEMPT, never reused across retries.
          const assertion = await underSignal(
            this.opts.mintAssertion(),
            signal,
          );
          headers.set("X-Refinity-User-Assertion", assertion);
        }
      } catch (cause) {
        throw new InvestorApiTransportError(
          `${operationId}: credential acquisition failed on attempt ${String(attempt)}`,
          attempt,
          cause,
        );
      }
      if (bodyText !== undefined) headers.set("Content-Type", JSON_MEDIA_TYPE);
      if (options.idempotencyKey !== undefined) {
        headers.set("Idempotency-Key", options.idempotencyKey);
      }
      if (options.ifMatch !== undefined) {
        headers.set("If-Match", options.ifMatch);
      }
      if (options.lastEventId !== undefined) {
        headers.set("Last-Event-ID", options.lastEventId);
      }

      let res: Response;
      try {
        res = await this.opts.fetch(url, {
          method: route.method,
          headers,
          body: bodyText,
          signal,
          redirect: "error",
          // Private responses must never be served from or stored in any
          // fetch-level cache; the request says so explicitly rather than
          // relying on framework defaults. The public JWKS keeps the default.
          ...(policy === "none" ? {} : { cache: "no-store" as RequestCache }),
        });
      } catch (cause) {
        lastError = cause;
        if (signal.aborted) {
          throw new InvestorApiTransportError(
            `${operationId}: aborted after ${String(attempt)} attempt(s)`,
            attempt,
            abortReason(signal),
          );
        }
        if (mutation || !(await this.retryDelay(attempt, maxAttempts, scope))) {
          throw new InvestorApiTransportError(
            `${operationId}: transport failure after ${String(attempt)} attempt(s)`,
            attempt,
            cause,
          );
        }
        continue;
      }

      if (res.ok) return { res, correlationId };

      if (!mutation && RETRYABLE_STATUSES.has(res.status)) {
        if (await this.retryDelay(attempt, maxAttempts, scope)) {
          lastError = new InvestorApiTransportError(
            `${operationId}: HTTP ${String(res.status)}`,
            attempt,
          );
          continue;
        }
        // Out of retries. 503 is a contract-declared failure and must be a
        // conformant envelope; 502/504 are infrastructure statuses the
        // contract never declares, so they surface as transport failures.
        if (profileFor(route).statuses.includes(res.status)) {
          throw await failureFromResponse(res, route, signal);
        }
        throw new InvestorApiTransportError(
          `${operationId}: HTTP ${String(res.status)} after ${String(attempt)} attempt(s)`,
          attempt,
        );
      }
      throw await failureFromResponse(res, route, signal);
    }

    throw new InvestorApiTransportError(
      `${operationId}: read retry budget exhausted`,
      maxAttempts,
      lastError,
    );
  }

  /**
   * Decide whether another READ attempt fits the absolute deadline; if so,
   * sleep the jitter (abortable) and return true. A retry only begins when
   * time remains after the delay.
   */
  private async retryDelay(
    attempt: number,
    maxAttempts: number,
    scope: CallScope,
  ): Promise<boolean> {
    if (attempt >= maxAttempts) return false;
    const remaining = scope.deadlineAt - this.opts.now();
    const jitterMs = Math.floor(100 * attempt + this.opts.random() * 200);
    if (jitterMs >= remaining) return false;
    await sleepUnderSignal(jitterMs, scope.signal);
    return true;
  }
}

function validateFrame(frame: SseFrame): ValidatedAccountEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    throw new ContractVersionMismatchError("AccountEvent", "response", [
      `SSE data for event id ${frame.id ?? "(none)"} is not valid JSON`,
    ]);
  }
  assertMatches("AccountEvent", payload, "response");
  const event = payload as AccountEvent;
  const problems: string[] = [];
  if (frame.id === null) {
    problems.push(
      `SSE frame for event ${event.event_id} carries no id: field — no resume cursor`,
    );
  } else if (frame.id !== event.event_id) {
    problems.push(
      `SSE id "${frame.id}" differs from payload event_id "${event.event_id}"`,
    );
  }
  if (frame.event !== null && frame.event !== event.event_type) {
    problems.push(
      `SSE event name "${frame.event}" differs from payload event_type "${event.event_type}"`,
    );
  }
  if (problems.length > 0) {
    throw new ContractVersionMismatchError(
      "AccountEvent",
      "response",
      problems,
    );
  }
  return { eventId: event.event_id, eventName: frame.event, event };
}

export function createInvestorApiClient(
  options: InvestorApiClientOptions,
): InvestorApiClient {
  return new InvestorApiClient(options);
}

/** Convenience for tests and tooling: the operation ids the contract declares. */
export const CONTRACT_OPERATION_IDS: readonly OperationId[] =
  CONTRACT_DOCUMENT.routes.map((r) => r.operation_id as OperationId);
