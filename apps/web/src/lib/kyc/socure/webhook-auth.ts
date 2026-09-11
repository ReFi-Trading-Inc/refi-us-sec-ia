/**
 * Socure webhook authenticity (help center "Webhook configuration
 * reference", 2026-09-10): RiskOS™ authenticates deliveries with the endpoint
 * credential configured in the dashboard — Basic (username/password),
 * Bearer (UUID token) or OAuth 2.0 — and documents sender IP allowlists per
 * environment. There is NO HMAC signature scheme; nothing here invents one.
 *
 * ReFi's configuration (founder decision 2026-09-10): Bearer only —
 * `SOCURE_WEBHOOK_BEARER_TOKEN` holds the credential configured on the
 * endpoint in the RiskOS™ dashboard. This is credential comparison, not
 * payload signing. Unset token → every delivery is refused (fail closed);
 * the route is dark (404) unless the Socure adapter is selected.
 */
import { timingSafeEqual } from "node:crypto";

/** Documented sender IPs (CIDR /32 unless stated). Sandbox and production are separate. */
export const SOCURE_WEBHOOK_SENDER_IPS = {
  sandbox: ["35.230.191.253", "3.218.138.162", "13.217.134.98", "54.85.52.249"],
  production: [
    "35.199.32.202",
    "3.138.161.243",
    "54.209.34.129",
    "100.24.247.109",
    "44.195.229.53",
  ],
} as const;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Compare against self to keep timing flat, then refuse.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export type WebhookAuthResult =
  | { ok: true; scheme: "bearer" }
  | {
      ok: false;
      reason: "token_unconfigured" | "missing" | "scheme" | "mismatch";
    };

/**
 * Validate the delivery's `Authorization: Bearer <token>` header against the
 * configured endpoint credential (founder decision 2026-09-10: Bearer only).
 * Constant-time comparison; neither value is ever logged.
 */
export function verifySocureWebhookAuthorization(
  authorizationHeader: string | null,
  configuredToken: string | undefined,
): WebhookAuthResult {
  if (!configuredToken || configuredToken.length < 16) {
    return { ok: false, reason: "token_unconfigured" };
  }
  if (!authorizationHeader) return { ok: false, reason: "missing" };
  const m = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  const presented = m?.[1];
  if (!presented) return { ok: false, reason: "scheme" };
  return safeEqual(presented, configuredToken)
    ? { ok: true, scheme: "bearer" }
    : { ok: false, reason: "mismatch" };
}

/** True when `ip` is one of the documented sender addresses for the environment (defense in depth only). */
export function isDocumentedSocureSender(
  ip: string,
  environment: "sandbox" | "production",
): boolean {
  return (SOCURE_WEBHOOK_SENDER_IPS[environment] as readonly string[]).includes(
    ip.trim(),
  );
}
