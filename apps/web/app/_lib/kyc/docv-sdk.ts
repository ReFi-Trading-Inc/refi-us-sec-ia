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
      reason: "sdk_key_unconfigured" | "sdk_load_failed" | "sdk_error";
    };

let loading: Promise<boolean> | null = null;

function loadBundle(): Promise<boolean> {
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

export async function launchDocumentCapture(args: {
  sdkKey: string | undefined;
  transactionToken: string;
  containerSelector: string;
  onCaptured: () => void;
  onError: () => void;
}): Promise<DocvLaunchResult> {
  if (!args.sdkKey) return { ok: false, reason: "sdk_key_unconfigured" };
  const loaded = await loadBundle();
  if (!loaded || !window.SocureDocVSDK)
    return { ok: false, reason: "sdk_load_failed" };
  try {
    window.SocureDocVSDK.launch(
      args.sdkKey,
      args.transactionToken,
      args.containerSelector,
      {
        qrCodeNeeded: true,
        closeCaptureWindowOnComplete: true,
        onSuccess: () => {
          args.onCaptured();
        },
        onError: () => {
          args.onError();
        },
      },
    );
    return { ok: true };
  } catch {
    return { ok: false, reason: "sdk_error" };
  }
}
