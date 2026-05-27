// Lightweight typed fetch client. Injects x-correlation-id on every request and
// rotates it from response headers if the server emits a fresh one. On HTTP 401,
// dispatches a browser-side `auth:unauthorized` event so AuthProvider can react.

let currentCorrelationId: string | null = null;

function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getCorrelationId(): string {
  if (!currentCorrelationId) currentCorrelationId = generateCorrelationId();
  return currentCorrelationId;
}

export function setCorrelationId(id: string): void {
  currentCorrelationId = id;
}

function getBaseUrl(): string {
  // Bracket access is required by the workspace tsconfig
  // (noPropertyAccessFromIndexSignature). Turbopack and Webpack both inline
  // `process.env["NEXT_PUBLIC_*"]` when accessed this way on a non-shadowed
  // global `process`.
  const url = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "";
  if (!url) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined");
  }
  return url.replace(/\/$/, "");
}

export type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const CSRF_COOKIE_NAME = "csrf_v1";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

export async function apiFetch<T>(
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${getBaseUrl()}${path}`;
  const headers = new Headers(init.headers);
  headers.set("x-correlation-id", getCorrelationId());
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const method = (init.method ?? "GET").toUpperCase();
  if (WRITE_METHODS.has(method) && !headers.has("x-csrf-token")) {
    const csrf = readCsrfCookie();
    if (csrf) headers.set("x-csrf-token", csrf);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : JSON.stringify(init.body),
  });

  const echoed = response.headers.get("x-correlation-id");
  if (echoed) setCorrelationId(echoed);

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: unknown }).message)
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}
