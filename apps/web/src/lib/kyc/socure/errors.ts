/**
 * Socure provider error classification (mandate §18).
 *
 * Operational provider failure is NEVER a KYC rejection: `REJECT` and
 * `REVIEW` are DECISIONS carried by a successful response and are mapped in
 * `mapping.ts`; everything here leaves the user's journey in a retryable,
 * incomplete state. Messages never contain request bodies, PII or keys.
 */
export const SOCURE_ERROR_KINDS = [
  "invalid_request",
  "auth_config",
  "rate_limited",
  "provider_unavailable",
  "malformed_response",
  "timeout",
  "webhook_validation_failed",
] as const;
export type SocureErrorKind = (typeof SOCURE_ERROR_KINDS)[number];

/** Kinds after which the SAME evaluation attempt may be retried by the user. */
export const RETRYABLE_SOCURE_ERROR_KINDS: ReadonlySet<SocureErrorKind> =
  new Set(["rate_limited", "provider_unavailable", "timeout"]);

export class SocureProviderError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly kind: SocureErrorKind,
    readonly httpStatus: number | null,
    readonly retryAfterSeconds: number | null = null,
    detail?: string,
  ) {
    super(
      `socure provider error: ${kind}${httpStatus !== null ? ` (http ${String(httpStatus)})` : ""}${detail ? ` — ${detail}` : ""}`,
    );
    this.name = "SocureProviderError";
    this.retryable = RETRYABLE_SOCURE_ERROR_KINDS.has(kind);
  }
}

/** Classify an HTTP status from the Evaluation API (body already discarded). */
export function classifySocureHttpStatus(
  status: number,
  retryAfterSeconds: number | null = null,
): SocureProviderError {
  if (status === 401 || status === 403) {
    return new SocureProviderError("auth_config", status);
  }
  if (status === 429) {
    return new SocureProviderError("rate_limited", status, retryAfterSeconds);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new SocureProviderError("invalid_request", status);
  }
  if (status >= 500) {
    return new SocureProviderError(
      "provider_unavailable",
      status,
      retryAfterSeconds,
    );
  }
  return new SocureProviderError(
    "malformed_response",
    status,
    null,
    `unexpected status`,
  );
}

export function isSocureProviderError(e: unknown): e is SocureProviderError {
  return e instanceof SocureProviderError;
}
