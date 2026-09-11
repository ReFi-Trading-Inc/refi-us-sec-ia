/**
 * Socure Evaluation API client seam (server-only).
 *
 * `SocureClientLike` is the narrow transport ReFi depends on; the real client
 * is built ONLY when `REFI_KYC_PROVIDER=socure` with complete configuration
 * and is never reached by tests (`setSocureClientForTests`). The API key is
 * read from the server env at call time and never returned, logged or
 * included in an error. Request bodies (PII) are never included in errors.
 *
 * Pending Socure account verification, no code path performs a genuine
 * request: the contract assertions run only the fake client.
 */
import { getServerEnv } from "../../config/env";
import { classifySocureHttpStatus, SocureProviderError } from "./errors";
import type { FakeSocureScript } from "./fixtures";
import type { SocureEvaluationRequest } from "./schemas";

export interface SocureRawResponse {
  status: number;
  /** Parsed JSON body (unknown until validated by `schemas.ts`). */
  body: unknown;
  retryAfterSeconds: number | null;
}

export interface SocureClientLike {
  evaluate(
    request: SocureEvaluationRequest,
    opts: { correlationId: string },
  ): Promise<SocureRawResponse>;
}

export class SocureUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Socure KYC is unavailable: ${reason}. No fallback provider is used.`,
    );
    this.name = "SocureUnavailableError";
  }
}

let testClient: SocureClientLike | null = null;
let cachedClient: SocureClientLike | null = null;

/** Test seam: the fake client; production never builds the HTTP client when set. */
export function setSocureClientForTests(client: SocureClientLike | null): void {
  testClient = client;
  cachedClient = null;
}

export const SOCURE_EVALUATION_PATH = "/api/evaluation" as const;
export const SOCURE_REQUEST_TIMEOUT_MS = 15_000;

export function getSocureClient(): SocureClientLike {
  if (testClient) return testClient;
  if (cachedClient) return cachedClient;
  const env = getServerEnv();
  if (env.REFI_KYC_PROVIDER !== "socure") {
    throw new SocureUnavailableError("REFI_KYC_PROVIDER is not socure");
  }
  if (
    !env.SOCURE_API_BASE_URL ||
    !env.SOCURE_API_KEY ||
    !env.SOCURE_WORKFLOW_NAME
  ) {
    throw new SocureUnavailableError(
      "SOCURE_API_BASE_URL / SOCURE_API_KEY / SOCURE_WORKFLOW_NAME are not configured",
    );
  }
  const baseUrl = env.SOCURE_API_BASE_URL.replace(/\/+$/, "");
  cachedClient = {
    async evaluate(request, opts) {
      // Genuine provider traffic. Reached only with a complete, founder-
      // activated configuration; never from tests or from any tier without
      // REFI_KYC_PROVIDER=socure.
      const apiKey = getServerEnv().SOCURE_API_KEY ?? "";
      if (apiKey.length === 0) {
        throw new SocureUnavailableError("SOCURE_API_KEY is not configured");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, SOCURE_REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`${baseUrl}${SOCURE_EVALUATION_PATH}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Correlation-Id": opts.correlationId,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
          cache: "no-store",
        });
        const retryAfter = res.headers.get("retry-after");
        const retryAfterSeconds =
          retryAfter !== null && /^\d+$/.test(retryAfter)
            ? Number(retryAfter)
            : null;
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        return { status: res.status, body, retryAfterSeconds };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new SocureProviderError("timeout", null);
        }
        throw new SocureProviderError(
          "provider_unavailable",
          null,
          null,
          "network",
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
  return cachedClient;
}

/** Deterministic fake driven by a fixture script. Records requests for assertions (PII stays in-test). */
export class FakeSocureClient implements SocureClientLike {
  readonly requests: Array<{
    request: SocureEvaluationRequest;
    correlationId: string;
  }> = [];
  private queue: FakeSocureScript[] = [];
  constructor(...scripts: FakeSocureScript[]) {
    this.queue = scripts;
  }
  script(...scripts: FakeSocureScript[]): void {
    this.queue.push(...scripts);
  }
  evaluate(
    request: SocureEvaluationRequest,
    opts: { correlationId: string },
  ): Promise<SocureRawResponse> {
    this.requests.push({ request, correlationId: opts.correlationId });
    const next = this.queue.shift();
    if (!next) {
      return Promise.reject(new Error("FakeSocureClient: no script queued"));
    }
    switch (next.kind) {
      case "json":
        return Promise.resolve({
          status: next.status,
          body: next.body,
          retryAfterSeconds: null,
        });
      case "http":
        return Promise.resolve({
          status: next.status,
          body: null,
          retryAfterSeconds: next.retryAfterSeconds ?? null,
        });
      case "timeout":
        return Promise.reject(new SocureProviderError("timeout", null));
      case "network":
        return Promise.reject(
          new SocureProviderError(
            "provider_unavailable",
            null,
            null,
            "network",
          ),
        );
    }
  }
}

/** Translate a raw transport answer into either a body to validate or a classified error. */
export function rawToBodyOrThrow(raw: SocureRawResponse): unknown {
  if (raw.status >= 200 && raw.status < 300) return raw.body;
  throw classifySocureHttpStatus(raw.status, raw.retryAfterSeconds);
}
