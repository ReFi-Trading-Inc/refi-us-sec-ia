/**
 * Admin-portal-proxy transport client (S4).
 *
 * Every proxied call to Daniel's Admin Portal goes through this module.
 * Higher layers (acl.ts, per-route endpoint files, cache.ts) compose on
 * top of it — none of them touch fetch directly.
 *
 * Deny-by-default construction (S4d):
 *   - Base URL is pinned at boot from ADMIN_PORTAL_BASE_URL. There is no
 *     request-derived host construction, ever. Path is a validated
 *     literal from the caller (per-route endpoint module).
 *   - Path is joined via URL constructor so caller-supplied strings
 *     cannot escape the pinned origin.
 *   - Any 4xx/5xx returns a structured ProxyResponse without exposing
 *     upstream body text through untyped paths.
 *
 * Reliability:
 *   - Timeout via AbortSignal.timeout (default 10s, per-call override).
 *   - Retry with jittered exponential backoff on 5xx and network errors
 *     (default 3 attempts). 4xx never retries — they're semantic.
 *   - Circuit breaker keyed by (path template, method). After N failures
 *     inside a window, the breaker opens and short-circuits calls until
 *     a cooldown elapses; a single "probe" call re-opens the circuit.
 *
 * Observability:
 *   - x-correlation-id is forwarded from the BFF request. Callers pass
 *     the correlation id explicitly so no ambient state is required.
 *   - x-investor-account-id is forwarded so upstream ACL enforcement
 *     works even if a bug in the BFF ACL layer leaks through.
 *   - A W3C traceparent is generated per call and returned in the
 *     response so callers can attach it to their own logs.
 */
import { getServerEnv } from "../config/env";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProxyMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface ProxyRequest {
  /** Path relative to ADMIN_PORTAL_BASE_URL, must start with "/". */
  path: string;
  method?: ProxyMethod;
  /** Investor account id, forwarded as x-investor-account-id. */
  accountId: string;
  /** Correlation id from the enclosing BFF request. */
  correlationId: string;
  /** Optional query params. Values are URI-encoded. */
  query?: Readonly<Record<string, string | number | boolean>>;
  /** JSON body for POST/PATCH/PUT. Ignored for GET/DELETE. */
  body?: unknown;
  /** Per-call timeout override, milliseconds. Default 10_000. */
  timeoutMs?: number;
  /** Per-call retry override. Default 3 attempts total. */
  maxAttempts?: number;
  /** Optional Idempotency-Key header value. Never derived from body. */
  idempotencyKey?: string;
}

export interface ProxyResponse {
  ok: boolean;
  status: number;
  /** Response body parsed as JSON. Null if body was empty. */
  json: unknown;
  /** W3C traceparent generated for this call. */
  traceparent: string;
  /** Response headers echoed for auditability. */
  headers: Record<string, string>;
}

export class ProxyError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProxyError";
  }
}

// ─── Circuit breaker ─────────────────────────────────────────────────────────

interface BreakerState {
  failures: number;
  openedAt: number | null;
}

const BREAKER_THRESHOLD = 5; // consecutive failures before opening
const BREAKER_COOLDOWN_MS = 30_000;
const breakers = new Map<string, BreakerState>();

function breakerKey(path: string, method: ProxyMethod): string {
  return `${method} ${path}`;
}

function breakerFor(key: string): BreakerState {
  let s = breakers.get(key);
  if (!s) {
    s = { failures: 0, openedAt: null };
    breakers.set(key, s);
  }
  return s;
}

function breakerIsOpen(state: BreakerState): boolean {
  if (state.openedAt === null) return false;
  const elapsed = Date.now() - state.openedAt;
  if (elapsed >= BREAKER_COOLDOWN_MS) {
    // half-open: allow one probe call to test recovery
    state.openedAt = null;
    return false;
  }
  return true;
}

function breakerRecordSuccess(state: BreakerState): void {
  state.failures = 0;
  state.openedAt = null;
}

function breakerRecordFailure(state: BreakerState): void {
  state.failures += 1;
  if (state.failures >= BREAKER_THRESHOLD) {
    state.openedAt = Date.now();
  }
}

// ─── Traceparent ─────────────────────────────────────────────────────────────

function hex(bytes: number): string {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  let s = "";
  for (const b of out) s += b.toString(16).padStart(2, "0");
  return s;
}

function newTraceparent(): string {
  // version-format: 00-<32-hex trace-id>-<16-hex span-id>-01
  return `00-${hex(16)}-${hex(8)}-01`;
}

// ─── URL construction ────────────────────────────────────────────────────────

function buildUrl(
  baseUrl: string,
  path: string,
  query: Readonly<Record<string, string | number | boolean>> | undefined,
): URL {
  if (!path.startsWith("/")) {
    throw new ProxyError(
      `proxy path must start with "/" (got ${JSON.stringify(path)})`,
    );
  }
  // URL constructor with a pinned base defends against a caller who
  // sneaks in a full URL as `path` — the base's origin wins.
  const url = new URL(path, baseUrl);
  if (url.origin !== new URL(baseUrl).origin) {
    throw new ProxyError(
      `proxy path resolved outside pinned origin (path=${path})`,
    );
  }
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url;
}

// ─── Retry with jittered backoff ─────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => {
    setTimeout(r, ms);
  });
}

function backoffMs(attempt: number): number {
  // 100ms, 200ms, 400ms base ± up to 50% jitter.
  const base = 100 * Math.pow(2, attempt - 1);
  const jitter = base * (Math.random() - 0.5);
  return Math.max(50, Math.floor(base + jitter));
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export async function proxyRequest(req: ProxyRequest): Promise<ProxyResponse> {
  const env = getServerEnv();
  const method: ProxyMethod = req.method ?? "GET";
  const key = breakerKey(req.path, method);
  const breaker = breakerFor(key);

  if (breakerIsOpen(breaker)) {
    throw new ProxyError(
      `circuit open for ${key}; cooldown in progress`,
      undefined,
      503,
    );
  }

  const url = buildUrl(env.ADMIN_PORTAL_BASE_URL, req.path, req.query);
  const traceparent = newTraceparent();
  const timeoutMs = req.timeoutMs ?? 10_000;
  const maxAttempts = req.maxAttempts ?? 3;

  const headers: Record<string, string> = {
    "x-correlation-id": req.correlationId,
    "x-investor-account-id": req.accountId,
    traceparent,
    authorization: `Bearer ${env.ADMIN_PORTAL_SERVICE_TOKEN}`,
    accept: "application/json",
  };
  if (req.idempotencyKey) headers["idempotency-key"] = req.idempotencyKey;

  let init: RequestInit = { method, headers };
  if (
    req.body !== undefined &&
    (method === "POST" || method === "PATCH" || method === "PUT")
  ) {
    headers["content-type"] = "application/json";
    init = { ...init, body: JSON.stringify(req.body) };
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      // 5xx is retriable; 4xx is semantic and never retried.
      if (res.status >= 500 && attempt < maxAttempts) {
        breakerRecordFailure(breaker);
        await sleep(backoffMs(attempt));
        continue;
      }

      const text = await res.text();
      const json: unknown =
        text.length === 0 ? null : (JSON.parse(text) as unknown);
      const outHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        outHeaders[k] = v;
      });

      if (res.ok) {
        breakerRecordSuccess(breaker);
      } else if (res.status >= 500) {
        breakerRecordFailure(breaker);
      }

      return {
        ok: res.ok,
        status: res.status,
        json,
        traceparent,
        headers: outHeaders,
      };
    } catch (err) {
      lastErr = err;
      breakerRecordFailure(breaker);
      if (attempt < maxAttempts) {
        await sleep(backoffMs(attempt));
        continue;
      }
    }
  }

  throw new ProxyError(
    `proxy call failed after ${String(maxAttempts)} attempts: ${key}`,
    lastErr,
  );
}

// ─── Test hooks (module-internal) ────────────────────────────────────────────

/** Reset per-key breaker state. Do NOT export from the barrel. */
export function __resetBreakersForTests(): void {
  breakers.clear();
}
