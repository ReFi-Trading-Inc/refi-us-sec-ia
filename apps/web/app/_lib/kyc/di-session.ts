/**
 * Device-intelligence session token seam (browser, provider-neutral).
 *
 * The identity form calls `prepareDiSession()` once when it mounts (scoping
 * device-intelligence collection to the onboarding/KYC funnel) and
 * `getDiSessionToken()` immediately before submitting identity data to the
 * same-origin BFF, which forwards the token server-side as
 * `di_session_token`. The browser never calls the provider's evaluation API
 * and never holds the server API key.
 *
 * Provider specifics live in `./socure-di.ts`. Without a configured public
 * SDK key this seam reports `unavailable` — no fake token, no fallback.
 */
import { ensureSocureDiInitialized, socureDiSessionToken } from "./socure-di";

export type DiSessionTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: "sdk_unavailable" | "sdk_error" };

function publicSdkKey(): string | undefined {
  return process.env["NEXT_PUBLIC_SOCURE_SDK_KEY"] || undefined;
}

/** Initialise device intelligence for this funnel (idempotent). */
export async function prepareDiSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const r = await ensureSocureDiInitialized(publicSdkKey());
  return r === "initialized" || r === "already";
}

export async function getDiSessionToken(): Promise<DiSessionTokenResult> {
  if (typeof window === "undefined")
    return { ok: false, reason: "sdk_unavailable" };
  const ready = await prepareDiSession();
  if (!ready) return { ok: false, reason: "sdk_unavailable" };
  const token = await socureDiSessionToken();
  return token ? { ok: true, token } : { ok: false, reason: "sdk_error" };
}
