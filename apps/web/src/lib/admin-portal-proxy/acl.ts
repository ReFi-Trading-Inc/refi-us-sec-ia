/**
 * Admin-portal-proxy ACL enforcement (S4).
 *
 * Every proxied call sits between the BFF's own auth and the upstream's
 * account-scoped resources. Before we hand a request to client.ts we
 * assert that the account the caller is asking about matches the account
 * they're authenticated for. Anything else is a cross-account access
 * attempt and must be rejected with 403 + a structured audit log entry.
 *
 * Rationale: this is deliberately belt-and-braces. The upstream Admin
 * Portal is also expected to enforce account scoping via
 * x-investor-account-id (client.ts forwards it), and the BFF's own auth
 * layer resolves an authoritative account from AuthSessionLink. Enforcing
 * again here means neither of those two layers has to be perfect for
 * cross-account access to be blocked — one has to fail *and* this one has
 * to fail before a leak reaches upstream.
 *
 * The structured log line (severity=high) is what the Sprint 4 IR
 * runbook keys off; the shape is deliberately stable across the file so
 * a query like `event="admin_portal_proxy.acl_violation"` stays valid.
 */

export interface AclContext {
  /** auth_id from the BFF auth context. */
  authId: string;
  /** Authoritative account bound to this session via AuthSessionLink. */
  authAccountId: string;
  /** Account id the caller is asking about (route param, query, or body). */
  requestedAccountId: string;
  /** Upstream path being proxied. Used for the audit log entry only. */
  upstreamPath: string;
  /** Correlation id from the enclosing BFF request. */
  correlationId: string;
}

export class AclViolationError extends Error {
  readonly reasonCode = "acl_violation" as const;
  constructor(message = "account scope mismatch") {
    super(message);
    this.name = "AclViolationError";
  }
}

/**
 * Assert that the caller's authenticated account matches the account
 * they're requesting. Throws AclViolationError on mismatch, after
 * emitting a structured audit line. Callers translate the throw into a
 * 403 BffErrors.forbidden response.
 */
export function enforceAccountScope(ctx: AclContext): void {
  if (ctx.authAccountId === ctx.requestedAccountId) return;

  // Structured audit line. Cloud Run captures stdout/stderr into Cloud
  // Logging; the same shape flows through Sentry when structured
  // logging lands in Sprint 6.
  console.error(
    JSON.stringify({
      event: "admin_portal_proxy.acl_violation",
      severity: "high",
      auth_id: ctx.authId,
      auth_account_id: ctx.authAccountId,
      requested_account_id: ctx.requestedAccountId,
      upstream_path: ctx.upstreamPath,
      correlation_id: ctx.correlationId,
      ts: new Date().toISOString(),
    }),
  );

  throw new AclViolationError();
}

/**
 * True when the given error is an ACL violation. Callers use this to
 * convert `try { proxyCall() } catch (err) { if (isAclViolation(err)) ...`
 * into a shaped 403 without importing the class type.
 */
export function isAclViolation(err: unknown): err is AclViolationError {
  return err instanceof AclViolationError;
}
