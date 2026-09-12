/**
 * Socure Digital Intelligence — typed browser adapter around
 * `@socure-inc/device-risk-sdk` (pinned). The only module that touches the
 * SDK API; React components use the neutral seam in `./di-session.ts`.
 *
 * Rules (Socure DI Web SDK guide): initialise ONCE per page lifetime (never on
 * React state changes); call `getSessionToken()` immediately before the
 * identity data is submitted; the SDK key is the PUBLIC SDK key from the
 * RiskOS™ dashboard (`NEXT_PUBLIC_SOCURE_SDK_KEY`) — the server API key never
 * exists in the browser. Collection is scoped to the onboarding/KYC funnel:
 * nothing initialises until the identity form mounts.
 *
 * The SDK module is loaded lazily and only when a key is configured, so no
 * provider script or network contact happens on any page without it.
 * Tests inject a fake SDK through `setSocureDiSdkForTests`.
 */
export interface SocureDiSdkLike {
  initialize(config: {
    sdkKey: string;
    disableNavigationContextTracking?: boolean;
  }): void;
  getSessionToken(): Promise<string>;
}

type Loader = () => Promise<SocureDiSdkLike>;

let testSdk: SocureDiSdkLike | null = null;
let initialized: { sdkKey: string } | null = null;
/** Last failure inside this wrapper: error name + message only (never PII). */
let lastFailure: string | null = null;
export function socureDiLastFailure(): string | null {
  return lastFailure;
}
function noteFailure(stage: string, e: unknown): void {
  const err = e as { name?: unknown; message?: unknown } | null;
  const name = typeof err?.name === "string" ? err.name : typeof e;
  const message = typeof err?.message === "string" ? err.message : "";
  lastFailure = `${stage}:${name}:${message}`.slice(0, 200);
}
let sdkPromise: Promise<SocureDiSdkLike> | null = null;
let initCount = 0;

/**
 * The pinned SDK ships a UMD bundle whose `module.exports` IS the
 * `SigmaDeviceManager` class (its `.d.ts` declares a named export that does
 * not exist at runtime — observed in the Sandbox on 2026-09-12). Bundler
 * CJS interop may hand back the class, or a (frozen) namespace object whose
 * `initialize` / `getSessionToken` getters return the statics unbound. The
 * statics only use `this.instance`, so both are called against one stable
 * host object: the class itself when we have it, otherwise a private holder.
 * Calling them on the namespace would throw on `this.instance = …` AFTER the
 * SDK session had already started (observed: DI traffic, no token).
 */
export function resolveSigmaDeviceManager(mod: unknown): SocureDiSdkLike {
  const candidates: unknown[] = [];
  if (typeof mod === "object" && mod !== null) {
    const m = mod as { SigmaDeviceManager?: unknown; default?: unknown };
    candidates.push(m.SigmaDeviceManager, m.default);
  }
  candidates.push(mod);
  for (const c of candidates) {
    if (
      (typeof c === "function" || (typeof c === "object" && c !== null)) &&
      typeof (c as { initialize?: unknown }).initialize === "function" &&
      typeof (c as { getSessionToken?: unknown }).getSessionToken === "function"
    ) {
      const statics = c as {
        initialize: (cfg: Parameters<SocureDiSdkLike["initialize"]>[0]) => void;
        getSessionToken: () => Promise<string>;
      };
      const host: object = typeof c === "function" ? c : {};
      return {
        initialize: (cfg) => {
          statics.initialize.call(host, cfg);
        },
        getSessionToken: () => statics.getSessionToken.call(host),
      };
    }
  }
  throw new Error("device-risk-sdk: SigmaDeviceManager not found in module");
}

const realLoader: Loader = async () => {
  const mod: unknown = await import("@socure-inc/device-risk-sdk");
  return resolveSigmaDeviceManager(mod);
};

/** Test seam: inject a fake SDK and reset the once-only state. */
export function setSocureDiSdkForTests(sdk: SocureDiSdkLike | null): void {
  testSdk = sdk;
  initialized = null;
  sdkPromise = null;
  initCount = 0;
}

/** Test/diagnostic: how many times `initialize` ran in this page lifetime. */
export function socureDiInitCount(): number {
  return initCount;
}

async function sdk(): Promise<SocureDiSdkLike> {
  if (testSdk) return testSdk;
  sdkPromise ??= realLoader();
  return sdkPromise;
}

/**
 * Initialise the SDK once for the given public key. Repeated calls with the
 * same key are no-ops; a different key in the same page lifetime is refused.
 */
export async function ensureSocureDiInitialized(
  sdkKey: string | undefined,
): Promise<
  "initialized" | "already" | "no_key" | "key_mismatch" | "sdk_error"
> {
  if (!sdkKey) return "no_key";
  if (initialized)
    return initialized.sdkKey === sdkKey ? "already" : "key_mismatch";
  try {
    const s = await sdk();
    s.initialize({ sdkKey, disableNavigationContextTracking: true });
    initialized = { sdkKey };
    initCount += 1;
    return "initialized";
  } catch (e) {
    noteFailure("initialize", e);
    return "sdk_error";
  }
}

/** The DI session token for the CURRENT transaction; requires prior initialisation. */
export async function socureDiSessionToken(): Promise<string | null> {
  if (!initialized) return null;
  try {
    const token = await (await sdk()).getSessionToken();
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch (e) {
    noteFailure("getSessionToken", e);
    return null;
  }
}
