/**
 * Document-capture SDK seam (browser). Loads the provider's Web SDK bundle
 * only when the PUBLIC SDK key is configured, and launches capture for the
 * transaction token the BFF issued to THIS user. Callbacks report progress
 * and capture completion — they are never the verification decision; the
 * page tells the BFF "captured" and then waits for the provider's
 * asynchronous result to arrive server-side.
 *
 * Nothing here holds or sends a server credential; the SDK key is public by
 * design. The bundle origin is admitted by CSP only when the key is set.
 */
export const DOCV_SDK_BUNDLE_URL = "https://websdk.socure.com/bundle.js";

declare global {
  interface Window {
    SocureDocVSDK?: {
      launch: (
        sdkKey: string,
        transactionToken: string,
        containerSelector: string,
        config: Record<string, unknown> & {
          onProgress?: (e: unknown) => void;
          onSuccess?: (e: unknown) => void;
          onError?: (e: unknown) => void;
        },
      ) => void;
    };
  }
}

export type DocvLaunchResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "sdk_key_unconfigured"
        | "invalid_token"
        | "sdk_load_failed"
        | "sdk_error"
        | "duplicate_launch";
    };

/**
 * Classified capture errors (never a KYC decision). `terminal_capable`
 * outcomes may let the provider resume and finalize the evaluation, so the
 * caller reconciles with the BFF after them.
 */
export type DocvErrorKind =
  | "launch_config"
  | "upload"
  | "interrupted"
  | "consent_declined"
  | "transient"
  | "unknown";
export interface DocvErrorEvent {
  kind: DocvErrorKind;
  terminalCapable: boolean;
}
export type DocvProgressStage =
  "handoff_pending" | "capture" | "uploading" | "processing" | "unknown";

type SdkLike = NonNullable<Window["SocureDocVSDK"]>;
let loading: Promise<boolean> | null = null;
let testSdk: SdkLike | null = null;
let activeLaunch: string | null = null;

/** Test seam: inject a fake SDK; the real bundle is never loaded when set. */
export function setDocvSdkForTests(sdk: SdkLike | null): void {
  testSdk = sdk;
  loading = null;
  activeLaunch = null;
}

function loadBundle(): Promise<boolean> {
  if (testSdk) return Promise.resolve(true);
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.SocureDocVSDK) return Promise.resolve(true);
  loading ??= new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = DOCV_SDK_BUNDLE_URL;
    s.async = true;
    s.onload = () => {
      resolve(Boolean(window.SocureDocVSDK));
    };
    s.onerror = () => {
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return loading;
}

function classifyError(e: unknown): DocvErrorEvent {
  const text = JSON.stringify(e ?? "").toLowerCase();
  if (/consent|declin/.test(text))
    return { kind: "consent_declined", terminalCapable: true };
  if (/upload/.test(text)) return { kind: "upload", terminalCapable: true };
  if (/cancel|abort|closed|interrupt|expired|timeout/.test(text))
    return { kind: "interrupted", terminalCapable: true };
  if (/network|offline|fetch|connection/.test(text))
    return { kind: "transient", terminalCapable: false };
  if (/config|key|token|invalid|unauthori/.test(text))
    return { kind: "launch_config", terminalCapable: false };
  return { kind: "unknown", terminalCapable: true };
}

function classifyProgress(e: unknown): DocvProgressStage {
  const text = JSON.stringify(e ?? "").toLowerCase();
  if (/qr|mobile|handoff|sms/.test(text)) return "handoff_pending";
  if (/upload/.test(text)) return "uploading";
  if (/process|submit/.test(text)) return "processing";
  if (/capture|front|back|selfie|document/.test(text)) return "capture";
  return "unknown";
}

/**
 * Launches the provider's capture flow. Callbacks are UX and control-flow
 * signals only: `onCaptured` (SDK onSuccess) means capture/upload finished,
 * NOT accepted/verified; `onError` is classified and NEVER a rejection; the
 * caller reconciles with the BFF afterwards. Exactly one active launch per
 * token — a second call while one is open is refused.
 */
export async function launchDocumentCapture(args: {
  sdkKey: string | undefined;
  transactionToken: string;
  containerSelector: string;
  onProgress?: (stage: DocvProgressStage) => void;
  onCaptured: () => void;
  onError: (e: DocvErrorEvent) => void;
}): Promise<DocvLaunchResult> {
  if (!args.sdkKey) return { ok: false, reason: "sdk_key_unconfigured" };
  if (
    typeof args.transactionToken !== "string" ||
    args.transactionToken.trim().length === 0
  )
    return { ok: false, reason: "invalid_token" };
  if (activeLaunch === args.transactionToken)
    return { ok: false, reason: "duplicate_launch" };
  const loaded = await loadBundle();
  const sdk =
    testSdk ??
    (typeof window !== "undefined" ? window.SocureDocVSDK : undefined);
  if (!loaded || !sdk) return { ok: false, reason: "sdk_load_failed" };
  activeLaunch = args.transactionToken;
  const finish = () => {
    activeLaunch = null;
  };
  try {
    sdk.launch(args.sdkKey, args.transactionToken, args.containerSelector, {
      qrCodeNeeded: true,
      closeCaptureWindowOnComplete: true,
      onProgress: (e: unknown) => {
        args.onProgress?.(classifyProgress(e));
      },
      onSuccess: () => {
        finish();
        args.onCaptured();
      },
      onError: (e: unknown) => {
        finish();
        args.onError(classifyError(e));
      },
    });
    return { ok: true };
  } catch {
    finish();
    return { ok: false, reason: "sdk_error" };
  }
}
