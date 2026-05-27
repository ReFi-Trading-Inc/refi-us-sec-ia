// Exception Review queue handler (P2.5R-18 stub).
// Reads `pendingExceptions` from the active persona. Real BFF will project
// from RiskSnapshots (decision='rejected' + reasons in the policy-exception
// taxonomy) joined with AccountIntents — see
// `09-daniel-answers-and-product-reframe.md §1 Q5` for the canonical model.

import { http } from "msw";
import { getActivePersona } from "./fixtures/personas";
import { jsonOk, url } from "./_shared";

export const exceptionsHandlers = [
  http.get(url("/v1/exceptions"), ({ request }) =>
    jsonOk(request, getActivePersona(request).pendingExceptions),
  ),
];
