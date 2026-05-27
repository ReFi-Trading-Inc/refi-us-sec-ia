// Eligibility — dead shadow handler.
// Spec: refi-build-docs/spec-current/07-daniel-blueprint-alignment.md §10
//
// The real eligibility flow runs in the Next route handler at
// apps/web/app/api/us/eligibility/route.ts (HMAC-hashed IP/UA, signed JWT
// cookie, real rule engine). This MSW handler exists only so something
// doesn't 404 if it ever hits the /v1/us/eligibility path directly.

import { http } from "msw";
import type { EligibilityDecision } from "../generated/api";
import { jsonOk, url } from "./_shared";

export const eligibilityHandlers = [
  http.post(url("/v1/us/eligibility"), ({ request }) => {
    const decision: EligibilityDecision = {
      result: "eligible",
      state: "CA",
      ruleId: "default-eligible",
    };
    return jsonOk(request, decision);
  }),
];
