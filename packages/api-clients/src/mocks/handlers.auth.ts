// Auth / SIWE handlers — best-aligned-to-Daniel domain.
// Spec: refi-build-docs/spec-current/07-daniel-blueprint-alignment.md §6
//       Wallet Sign-In (SIWE).pdf (Daniel)
//
// Daniel-aligned via pre-Wave-2 fixes:
//   - GET /siwe/nonce with {domain, origin, uri, chainId} query bindings
//   - POST /auth/logout (was /auth/revoke-all)
//   - Error envelope {code, message, retryable, correlationId, details}
//     codes: NONCE_INVALID, SIGNATURE_INVALID, POLICY_VIOLATION,
//            CHAIN_DENIED, ACCOUNT_BLOCKED, REFRESH_REVOKED

import { http } from "msw";
import { getActivePersona } from "./fixtures/personas";
import {
  CLEAR_SESSION_COOKIE,
  SESSION_COOKIE,
  csrfGuard,
  jsonOk,
  url,
} from "./_shared";

export const authHandlers = [
  http.get(url("/auth/session"), ({ request }) =>
    jsonOk(request, getActivePersona(request).session),
  ),
  // Daniel's SIWE spec is GET /siwe/nonce with {domain, origin, uri, chainId}
  // as query params (SIWE.pdf:p4, p8). Query is not validated in the mock —
  // the real server stores nonce-against-bindings to reject replay.
  http.get(url("/siwe/nonce"), ({ request }) =>
    jsonOk(request, { nonce: "mock-nonce-1234567890" }),
  ),
  http.post(url("/siwe/verify"), ({ request }) => {
    // SIWE verify intentionally does not require CSRF — the signed nonce is
    // the anti-forgery proof, and the cookie won't exist yet on first sign-in.
    return jsonOk(request, { ok: true }, { "Set-Cookie": SESSION_COOKIE });
  }),
  http.post(url("/auth/refresh"), ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    return jsonOk(request, { ok: true }, { "Set-Cookie": SESSION_COOKIE });
  }),
  // Daniel's spec name (SIWE.pdf:p8); replaces our earlier /auth/revoke-all.
  http.post(url("/auth/logout"), ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    return jsonOk(
      request,
      { ok: true },
      { "Set-Cookie": CLEAR_SESSION_COOKIE },
    );
  }),
];
