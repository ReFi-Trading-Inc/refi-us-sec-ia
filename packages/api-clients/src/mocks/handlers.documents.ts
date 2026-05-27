// Documents handlers — 🔴 UI-INVENTED domain.
// Spec: refi-build-docs/spec-current/07-daniel-blueprint-alignment.md §6
//       MIG-P2.5-06 disclosure model upgrade.
//
// Client-side ack tracking lives in apps/web/app/us/_lib/document-acks.ts.
// This POST is fire-and-forget; the server will eventually record per-user,
// per-version acknowledgments via the Document Registry.

import { http } from "msw";
import { csrfGuard, jsonOk, url } from "./_shared";

export const documentsHandlers = [
  /**
   * BACKEND_DEPENDENCY:
   * Owner: Daniel backend — Document Registry
   * Real endpoint: POST /v1/documents/acknowledge
   * Required before: activation gate can flip `disclosures: true`
   * Current behavior: fire-and-forget; activation status does NOT advance
   * Replacement: registry records per-user/per-version acknowledgment;
   *   activation gate reads ack count == required count at current version
   * Fail-closed rule: backend must re-validate before activating
   * Schema gap: NO Documents resource in refi-api.yaml at all
   *   (MIG-P2.5-04, MIG-P2.5-06).
   */
  http.post(url("/v1/documents/acknowledge"), ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    return jsonOk(request, { ok: true });
  }),
];
