// Activity feed handlers.
// Spec: refi-build-docs/spec-current/07-daniel-blueprint-alignment.md §2.8
//
// Outstanding drift: Daniel's audit.evt envelope is richer than our shallow
// ActivityEvent (kind, ref_id, correlationId, digest, redactions). Will be
// reconciled when Daniel's projection endpoint ships.

import { http } from "msw";
import { getActivePersona } from "./fixtures/personas";
import { jsonOk, url } from "./_shared";

export const activityHandlers = [
  http.get(url("/v1/activity"), ({ request }) =>
    jsonOk(request, getActivePersona(request).activity),
  ),
];
