// Recommendations handlers — 🔴 UI-INVENTED domain.
// Spec: refi-build-docs/spec-current/07-daniel-blueprint-alignment.md §2.7
//       MIG-P2.5-19 RecommendationDetail deep contract.
//
// PATCH lifecycle (MIG-P2.5-12) uses an in-memory status override map keyed
// by `${personaId}:${recId}`. Lost on reload, which matches "server restart
// wipes the demo cache" semantics. Real backend will persist transitions.

import { http } from "msw";
import type { Recommendation } from "../generated/api";
import { getActivePersona } from "./fixtures/personas";
import { csrfGuard, jsonOk, jsonStatus, url } from "./_shared";

const recStatusOverrides = new Map<string, Recommendation["status"]>();

function overrideKey(personaId: string, recId: string): string {
  return `${personaId}:${recId}`;
}

function setRecOverride(
  personaId: string,
  recId: string,
  status: Recommendation["status"],
): void {
  recStatusOverrides.set(overrideKey(personaId, recId), status);
}

function withOverride(personaId: string, rec: Recommendation): Recommendation {
  const o = recStatusOverrides.get(overrideKey(personaId, rec.id));
  return o ? { ...rec, status: o } : rec;
}

function transitionFor(
  action: "accept" | "reject" | "request_review" | undefined,
): Recommendation["status"] | null {
  switch (action) {
    case "accept":
      return "accepted";
    case "reject":
      return "rejected";
    case "request_review":
      return "review";
    default:
      return null;
  }
}

export const recommendationsHandlers = [
  http.get(url("/v1/recommendations"), ({ request }) => {
    const persona = getActivePersona(request);
    return jsonOk(
      request,
      persona.recommendations.map((r) => withOverride(persona.id, r)),
    );
  }),
  http.get(url("/v1/recommendations/:id"), ({ request, params }) => {
    const id = String(params["id"]);
    const persona = getActivePersona(request);
    const found = persona.recommendations.find((r) => r.id === id);
    if (!found) return jsonStatus(request, 404, { message: "not found" });
    return jsonOk(request, withOverride(persona.id, found));
  }),
  /**
   * BACKEND_DEPENDENCY:
   * Owner: Daniel backend — Recommendation API (not yet specified)
   * Real endpoint: GET /v1/recommendations/{id}/detail
   * Required before: investor-grade recommendation detail page
   * Current behavior: returns RecommendationDetail when persona has one;
   *   404 otherwise (UI falls back to shallow recommendation).
   * Replacement: Recommendation API publishes RecommendationDetail with
   *   server-computed advisory_context, model_factors, guardrails,
   *   automation_eligibility (mirrors Compliance Adapter verdict envelope).
   * Schema gap: UI-authored — needs Daniel ratification per MIG-P2.5-19.
   */
  http.get(url("/v1/recommendations/:id/detail"), ({ request, params }) => {
    const id = String(params["id"]);
    const persona = getActivePersona(request);
    const detail = persona.recommendationDetails[id];
    if (!detail) return jsonStatus(request, 404, { message: "no detail" });
    return jsonOk(request, detail);
  }),
  /**
   * BACKEND_DEPENDENCY:
   * Owner: Daniel backend — Recommendation API (not yet specified)
   * Real endpoint: PATCH /v1/recommendations/{id}
   * Required before: investor-driven reject / request-review actions
   * Current behavior: in-memory status override keyed by persona+id; lost on reload.
   * Replacement: server records status transition + writes audit event.
   * Fail-closed rule: Approve still flows through /orders/preview gate;
   *   PATCH here only handles Reject and Request review.
   */
  http.patch(url("/v1/recommendations/:id"), async ({ request, params }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    const id = String(params["id"]);
    const persona = getActivePersona(request);
    const rec = persona.recommendations.find((r) => r.id === id);
    if (!rec) return jsonStatus(request, 404, { message: "not found" });

    const body = (await request.json().catch(() => ({}))) as {
      action?: "accept" | "reject" | "request_review";
    };
    const nextStatus = transitionFor(body.action);
    if (!nextStatus) {
      return jsonStatus(request, 422, {
        code: "INVALID_ACTION",
        message: "Unknown lifecycle action.",
      });
    }
    setRecOverride(persona.id, id, nextStatus);
    return jsonOk(request, { ...rec, status: nextStatus });
  }),
];

/** Exported for tests to reset override state between cases. */
export function __resetRecOverrides(): void {
  recStatusOverrides.clear();
}
