// Support handlers — 🔴 UI-INVENTED domain.
// Spec: refi-build-docs/spec-current/07-daniel-blueprint-alignment.md §8
//       MIG-P2.5-23 support boundary classifier (Rule 203A-2(e)(3)).
//
// Server-side re-validation mirrors apps/web/app/api/us/support/route.ts so
// dev exercises the same fail-closed path the real backend will. Scenarios
// (SUPPORT_RATE_LIMIT / SUPPORT_BLOCKED_BY_POLICY) take precedence for
// deterministic snapshot testing.

import { http } from "msw";
import { getActiveScenario } from "./scenarios";
import { csrfGuard, jsonOk, jsonStatus, url } from "./_shared";

export const supportHandlers = [
  /**
   * BACKEND_DEPENDENCY:
   * Owner: Daniel backend — Support Service
   * Real endpoint: POST /v1/support/ticket
   * Required before: live support intake
   * Current behavior: returns synthetic tkt_${Date.now()} id
   * Replacement: Support Service ingests + categorizes; rate-limits and
   *   blocked-by-policy returns are required (429, 422).
   * Fail-closed rule: blocked-prompt patterns disable Submit client-side;
   *   server also enforces via support-boundary classifier.
   * Schema gap: NOT in refi-api.yaml.
   */
  http.post(url("/v1/support/ticket"), async ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    const scenario = getActiveScenario(request);
    if (scenario?.id === "SUPPORT_RATE_LIMIT") {
      return jsonStatus(
        request,
        429,
        {
          code: "RATE_LIMITED",
          message: "Too many support tickets submitted. Try again later.",
        },
        { "Retry-After": "120" },
      );
    }
    if (scenario?.id === "SUPPORT_BLOCKED_BY_POLICY") {
      return jsonStatus(request, 422, {
        code: "BLOCKED_BY_POLICY",
        message:
          "Ticket category was rejected by the server-side support boundary classifier.",
      });
    }
    // Server-side re-validation of the support boundary (MIG-P2.5-23).
    const body = (await request.json().catch(() => ({}))) as {
      blocked?: boolean;
      category?: string;
      boundary_rule_id?: string | null;
    };
    if (body.blocked === true || body.category?.startsWith("blocked_")) {
      return jsonStatus(request, 422, {
        code: "BLOCKED_BY_POLICY",
        message:
          "Ticket category was rejected by the server-side support boundary classifier.",
        boundary_rule_id: body.boundary_rule_id ?? null,
      });
    }
    return jsonOk(request, { ok: true, ticket_id: `tkt_${Date.now()}` });
  }),
];
