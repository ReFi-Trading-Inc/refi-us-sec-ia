// Broker handlers — 🔴 UI-INVENTED domain.
// Spec: refi-build-docs/spec-current/07-daniel-blueprint-alignment.md §8
//       (Daniel has no investor-facing broker REST API documented.)
//
// Scenario coupling:
//   - DENY_STALE_BROKER_DATA flips connection-level `data_stale: true`
//     so the home/portfolio banner appears alongside the compliance DENY.
//   - BROKER_BAD_KEYS / BROKER_NO_PERMS / BROKER_UNSUPPORTED_ENV return
//     401 / 422 / 403 to exercise the UI error-mapping at
//     apps/web/app/us/onboarding/broker/page.tsx:131-144.

import { http } from "msw";
import type { BrokerInfo } from "../generated/api";
import { getActivePersona } from "./fixtures/personas";
import { getActiveScenario } from "./scenarios";
import { csrfGuard, jsonOk, jsonStatus, url } from "./_shared";

const supportedBrokers: BrokerInfo[] = [
  { id: "alpaca", name: "Alpaca", supported: true, regions: ["US"] },
  { id: "ibkr", name: "Interactive Brokers", supported: true, regions: ["US"] },
];

export const brokerHandlers = [
  http.get(url("/v1/brokers/supported"), ({ request }) =>
    jsonOk(request, supportedBrokers),
  ),
  http.get(url("/v1/brokers/connection"), ({ request }) => {
    const persona = getActivePersona(request);
    if (!persona.brokerConnection) {
      return jsonStatus(request, 404, { message: "no broker connected" });
    }
    const scenario = getActiveScenario(request);
    if (scenario?.id === "DENY_STALE_BROKER_DATA") {
      return jsonOk(request, {
        ...persona.brokerConnection,
        data_stale: true,
        last_synced_at: new Date(Date.now() - 17 * 60_000).toISOString(),
      });
    }
    return jsonOk(request, persona.brokerConnection);
  }),
  http.post(url("/v1/brokers/connect/start"), ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    return jsonOk(request, { oauth_url: "https://broker.example/oauth/mock" });
  }),
  /**
   * BACKEND_DEPENDENCY:
   * Owner: Daniel backend — Broker Adapter (Alpaca at launch)
   * Real endpoint: POST /v1/brokers/connect/keys
   * Required before: live broker key submission
   * Current behavior: scenarios drive 401 / 422 / 403; default is ok.
   * Replacement: adapter validates keys against Alpaca; returns the same
   *   error codes the UI error map at broker/page.tsx:131-144 expects.
   * Fail-closed rule: N/A (connection is not a Submit gate)
   * Schema gap: NOT in refi-api.yaml — add in MIG-P2.5-04.
   */
  http.post(url("/v1/brokers/connect/keys"), ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    const scenario = getActiveScenario(request);
    if (scenario?.id === "BROKER_BAD_KEYS") {
      return jsonStatus(request, 401, {
        code: "INVALID_CREDENTIALS",
        message: "Broker rejected the submitted API keys.",
      });
    }
    if (scenario?.id === "BROKER_NO_PERMS") {
      return jsonStatus(request, 422, {
        code: "INSUFFICIENT_PERMISSIONS",
        message: "API keys lack required scopes (trading or account-read).",
      });
    }
    if (scenario?.id === "BROKER_UNSUPPORTED_ENV") {
      return jsonStatus(request, 403, {
        code: "UNSUPPORTED_ENVIRONMENT",
        message:
          "Live keys submitted to paper-only environment (or vice versa).",
      });
    }
    const persona = getActivePersona(request);
    return jsonOk(request, {
      ok: true,
      connection: persona.brokerConnection ?? {
        broker_id: "alpaca",
        broker_name: "Alpaca",
        status: "connected",
        connected_at: new Date().toISOString(),
      },
    });
  }),
  http.post(url("/v1/brokers/disconnect"), ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    return jsonOk(request, { ok: true });
  }),
  http.get(url("/v1/brokers/account"), ({ request }) => {
    const persona = getActivePersona(request);
    if (!persona.brokerAccount) {
      return jsonStatus(request, 404, { message: "no broker account" });
    }
    return jsonOk(request, persona.brokerAccount);
  }),
  http.get(url("/v1/brokers/positions"), ({ request }) =>
    jsonOk(request, getActivePersona(request).positions),
  ),
  http.get(url("/v1/brokers/orders"), ({ request }) =>
    jsonOk(request, getActivePersona(request).orders),
  ),
];
