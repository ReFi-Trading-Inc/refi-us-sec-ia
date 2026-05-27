// CCID / KYC handlers + compliance cache admin.
// Spec: refi-build-docs/spec-current/07-daniel-blueprint-alignment.md §7
//       CCID KYC (Onboarding Attestation).pdf (Daniel)
//
// Daniel-aligned via pre-Wave-2 fixes:
//   - /compliance/{account_id}/invalidate (REST path style)
//   - Polling cadence is 5s in dev; production switches to webhook+SSE
//   - `under_review` is NOT terminal per CCID.pdf:p5

import { http } from "msw";
import { getActivePersona } from "./fixtures/personas";
import { csrfGuard, jsonOk, url } from "./_shared";

export const ccidHandlers = [
  http.get(url("/ccid/status"), ({ request }) =>
    jsonOk(request, getActivePersona(request).kyc),
  ),
  http.post(url("/ccid/start"), ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    return jsonOk(request, {
      provider_url: "https://complycube.example/start/mock",
      provider_reference: "ccid_ref_mock_001",
    });
  }),
  http.post(url("/ccid/webhook/provider"), ({ request }) => {
    // Provider webhook — not a UI write. CSRF doesn't apply; the dev-only
    // simulate hook calls this to advance KYC state.
    return jsonOk(request, { ok: true });
  }),
  // Daniel's path style is /compliance/{account_id}/invalidate
  // (Compliance Adapter.pdf:p8); replaces our earlier
  // /compliance/invalidate-cache?account_id=...
  http.post(url("/compliance/:account_id/invalidate"), ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    return jsonOk(request, { ok: true });
  }),
];
