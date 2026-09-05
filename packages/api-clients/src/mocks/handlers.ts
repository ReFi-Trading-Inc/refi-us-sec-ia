// MSW handlers for the @refi/api-clients package. Default persona is Maya.
// Only the mock-mode SIWE linking flow and the public eligibility mock remain;
// every account read/write goes through the same-origin BFF.
import { http, HttpResponse } from "msw";
import type { EligibilityDecision } from "../compat";

declare const process: { env: Record<string, string | undefined> } | undefined;

const BASE =
  (typeof process !== "undefined" && process.env["NEXT_PUBLIC_API_BASE_URL"]) ||
  "*";

function url(path: string): string {
  if (BASE === "*") return `*${path}`;
  return `${BASE.replace(/\/$/, "")}${path}`;
}

const SESSION_COOKIE =
  "us_session_v1=mock-session-token; Path=/us; HttpOnly; SameSite=Lax";

export const handlers = [
  http.get(url("/siwe/nonce"), () =>
    HttpResponse.json({ nonce: "mock-nonce-1234567890" }),
  ),
  http.post(url("/siwe/nonce"), () =>
    HttpResponse.json({ nonce: "mock-nonce-1234567890" }),
  ),
  http.post(url("/siwe/verify"), () =>
    HttpResponse.json(
      { ok: true },
      { headers: { "Set-Cookie": SESSION_COOKIE } },
    ),
  ),

  http.post(url("/v1/us/eligibility"), () => {
    const decision: EligibilityDecision = {
      result: "eligible",
      state: "CA",
      ruleId: "default-eligible",
    };
    return HttpResponse.json(decision);
  }),
];
