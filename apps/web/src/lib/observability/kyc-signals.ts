/**
 * Typed, values-free operational signals for the KYC surface.
 *
 * The KYC paths are forbidden from free-form logging (contract assertion
 * "kyc logging hygiene"). This module is the ONE permitted emitter and it can
 * only emit a closed enum of signal names plus a closed set of low-cardinality
 * labels — never an id, a decision payload, a body, a header, or a secret.
 * Cloud Logging log-based metrics key on `refi_signal`.
 */
export const KYC_SIGNALS = [
  "kyc.webhook.conflict_flagged",
  "kyc.webhook.envelope_rejected",
  "kyc.webhook.unknown_evaluation",
  "kyc.webhook.evaluation_mismatch",
  "kyc.webhook.auth_denied",
  "kyc.provider.error",
] as const;
export type KycSignal = (typeof KYC_SIGNALS)[number];

const PROVIDER_ERROR_KINDS = new Set([
  "auth_config",
  "rate_limited",
  "invalid_request",
  "provider_unavailable",
  "timeout",
  "malformed_response",
  "unknown",
]);

export interface KycSignalLabels {
  /** Provider error classification only (closed set; anything else → "unknown"). */
  kind?: string;
}

/** Emits one structured line; the only fields are the signal name and a closed-set kind. */
export function emitKycSignal(
  signal: KycSignal,
  labels: KycSignalLabels = {},
): void {
  if (!(KYC_SIGNALS as readonly string[]).includes(signal)) return;
  const kind =
    labels.kind !== undefined && PROVIDER_ERROR_KINDS.has(labels.kind)
      ? labels.kind
      : labels.kind !== undefined
        ? "unknown"
        : undefined;
  const line: Record<string, string> = {
    refi_signal: signal,
    severity: "WARNING",
  };
  if (kind) line["kind"] = kind;
  // Structured JSON on stdout → Cloud Logging jsonPayload; nothing else is ever attached.
  process.stdout.write(JSON.stringify(line) + "\n");
}
