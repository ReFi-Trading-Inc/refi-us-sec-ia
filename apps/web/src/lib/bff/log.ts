/**
 * Structured request logging (Sprint 6 observability).
 *
 * One JSON line per BFF request. Cloud Run captures stdout into Cloud
 * Logging; the same shape flows into Sentry when structured logging
 * lands there. The line is the primary artifact the IR runbook cross-
 * account leak procedure grep's on.
 *
 * Zero request-body content. The point of logging is to reconstruct
 * *which* record was touched by which principal in which correlation
 * chain, never to replay the payload from logs.
 *
 * Field set (stable — dashboards and IR queries depend on it):
 *   event          "bff.request"
 *   ts             ISO-8601 timestamp of log emission
 *   correlation_id extracted or minted per correlationIdFrom()
 *   method         HTTP method
 *   path           request path (query stripped so log volume is
 *                    predictable and PII in query params does not leak)
 *   status         HTTP status
 *   duration_ms    request wall time (start of handler to response)
 *   auth_id        AuthContext.authId or null
 *   account_id     AuthContext.accountId or null
 *   route_class    "read" | "mutate" | "stream" | "auth" | "public"
 *   outcome        "ok" | "rejected" | "blocked" | "unauthorized"
 *                    | "rate_limited" | "error"
 *   reason_code    optional; matches ActionReceipt.reasonCode when set
 *   error          optional; short error message (no stack)
 */

export interface BffLogFields {
  correlationId: string;
  /** Inbound W3C traceparent, if any. Null when absent or malformed. */
  traceparent?: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  authId?: string | null;
  accountId?: string | null;
  routeClass: "read" | "mutate" | "stream" | "auth" | "public";
  outcome:
    | "ok"
    | "rejected"
    | "blocked"
    | "unauthorized"
    | "rate_limited"
    | "error";
  reasonCode?: string;
  error?: string;
}

/**
 * Emit one JSON line to stdout. Called once per BFF request from the
 * `bffRead`/`bffMutate` wrappers. Never throws — logging must not
 * change response semantics.
 */
export function logRequest(fields: BffLogFields): void {
  try {
    const line = JSON.stringify({
      event: "bff.request",
      ts: new Date().toISOString(),
      correlation_id: fields.correlationId,
      ...(fields.traceparent ? { traceparent: fields.traceparent } : {}),
      method: fields.method,
      path: fields.path,
      status: fields.status,
      duration_ms: fields.durationMs,
      auth_id: fields.authId ?? null,
      account_id: fields.accountId ?? null,
      route_class: fields.routeClass,
      outcome: fields.outcome,
      ...(fields.reasonCode ? { reason_code: fields.reasonCode } : {}),
      ...(fields.error ? { error: fields.error } : {}),
    });
    // Route through console.log so Next.js's dev logger picks it up
    // consistently across runtimes. Cloud Run treats stdout as the
    // canonical log stream.
    console.log(line);
  } catch {
    /* logging must never throw */
  }
}

/**
 * Extract the path portion of a URL for logging. Query is stripped
 * because query params can carry the same kind of caller-supplied
 * content the request body carries — we do not want that in logs.
 */
export function pathForLog(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "unknown";
  }
}
