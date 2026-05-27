// Advisory profile, strategy, activation handlers — 🔴 UI-INVENTED domain.
// Spec: refi-build-docs/spec-current/07-daniel-blueprint-alignment.md §5
//
// Activation `disclosures` boolean comes from persona fixture; the UI also
// overrides it client-side with the document-acks tracker until the real
// Document Registry ships (see apps/web/app/us/_lib/document-acks.ts).

import { http } from "msw";
import { getActivePersona } from "./fixtures/personas";
import { csrfGuard, jsonOk, jsonStatus, url } from "./_shared";

export const accountHandlers = [
  http.get(url("/v1/profile"), ({ request }) => {
    const persona = getActivePersona(request);
    if (!persona.profile) {
      return jsonStatus(request, 404, { message: "profile not set" });
    }
    return jsonOk(request, persona.profile);
  }),
  http.post(url("/v1/profile"), async ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    const persona = getActivePersona(request);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return jsonOk(request, {
      account_id: persona.session.account_id ?? "acct_unknown",
      ...body,
      updated_at: new Date().toISOString(),
    });
  }),
  http.get(url("/v1/strategies/current"), ({ request }) => {
    const persona = getActivePersona(request);
    if (!persona.strategy) {
      return jsonStatus(request, 404, { message: "no strategy assigned" });
    }
    return jsonOk(request, persona.strategy);
  }),
  /**
   * BACKEND_DEPENDENCY:
   * Owner: Daniel backend — Account Service
   * Real endpoint: GET /v1/account/activation, POST /v1/account/activate
   * Required before: Managed Execution Activation
   * Current behavior: hardcoded { disclosures: false } per persona — design
   *   freeze until SEC registration + counsel sign-off
   * Replacement: Account Service computes booleans server-side from real
   *   per-doc ack records, KYC, broker, profile, eligibility
   * Fail-closed rule: backend MUST re-validate every precondition; the
   *   client gate is a UX nicety, not a security boundary
   * Schema gap: NOT in refi-api.yaml (MIG-P2.5-04).
   */
  http.get(url("/v1/account/activation"), ({ request }) =>
    jsonOk(request, getActivePersona(request).activation),
  ),
  http.post(url("/v1/account/activate"), ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    return jsonOk(request, {
      ok: true,
      activated_at: new Date().toISOString(),
    });
  }),
];
