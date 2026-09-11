/**
 * Device-intelligence session token seam (browser).
 *
 * The configured provider's browser SDK (installed and initialised with the
 * PUBLIC SDK key at activation time) exposes a session-token function; the
 * onboarding form calls `getDiSessionToken()` immediately before submitting
 * identity data to the same-origin BFF, which forwards it server-side. The
 * browser never calls the provider's evaluation API and never holds the
 * server API key.
 *
 * Until the SDK package is installed and the public key configured, this
 * seam reports `unavailable` and the form cannot submit — there is no
 * fallback token and no fake token.
 */
declare global {
  interface Window {
    SigmaDeviceManager?: { getSessionToken: () => Promise<string> };
  }
}

export type DiSessionTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: "sdk_unavailable" | "sdk_error" };

export async function getDiSessionToken(): Promise<DiSessionTokenResult> {
  if (typeof window === "undefined")
    return { ok: false, reason: "sdk_unavailable" };
  const manager = window.SigmaDeviceManager;
  if (!manager || typeof manager.getSessionToken !== "function") {
    return { ok: false, reason: "sdk_unavailable" };
  }
  try {
    const token = await manager.getSessionToken();
    if (typeof token !== "string" || token.length === 0) {
      return { ok: false, reason: "sdk_error" };
    }
    return { ok: true, token };
  } catch {
    return { ok: false, reason: "sdk_error" };
  }
}

/** Test seam: install a fake manager (never used in production builds). */
export function installFakeDiManagerForTests(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token === null) {
    delete window.SigmaDeviceManager;
    return;
  }
  window.SigmaDeviceManager = { getSessionToken: () => Promise.resolve(token) };
}
