// Orders + Compliance Adapter preview handlers.
// Spec: refi-build-docs/spec-current/07-daniel-blueprint-alignment.md §§2, 5
//       Compliance Adapter.pdf (Daniel)
//
// The preview endpoint is THE fail-closed gate. Submit-button enablement at
// CompliancePreview.tsx:99 binds to `verdict.kind === "ALLOW"` only.
// Scenarios populate the 10-code verdict matrix (see VERDICT_FIXTURES).

import { http } from "msw";
import type { Order, OrderPreviewResult, OrderRequest } from "../generated/api";
import { getActivePersona } from "./fixtures/personas";
import { getActiveScenario } from "./scenarios";
import { csrfGuard, jsonOk, jsonStatus, url } from "./_shared";

export const ordersHandlers = [
  /**
   * BACKEND_DEPENDENCY:
   * Owner: Daniel backend — Compliance Adapter
   * Real endpoint: POST /orders/preview (UI-facing path; Daniel's documented
   *   surface is GET /compliance/{account_id} and internal POST /internal/verdict)
   * Required before: live managed execution
   * Current behavior: scenarios drive verdict; otherwise qty>1000 → DENY.
   * Replacement: remove this handler from browser dev once Compliance Adapter
   *   staging endpoint is reachable from web. Add `expiry_at`+`policy_version`
   *   per Daniel envelope (already populated here).
   * Fail-closed rule: yes — Submit button only enables on ALLOW
   *   (CompliancePreview.tsx:99). Network errors / 5xx must be treated as
   *   DENY COMPLIANCE_UNAVAILABLE by the UI.
   */
  http.post(url("/orders/preview"), async ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    const body = (await request
      .json()
      .catch(() => ({}))) as Partial<OrderRequest>;
    const expiry_at = new Date(Date.now() + 60_000).toISOString();
    const policy_version = "pol-2026.05.1";
    const scenario = getActiveScenario(request);
    if (scenario) {
      const result: OrderPreviewResult = {
        ...scenario.verdict,
        source: scenario.source,
        expiry_at,
        policy_version,
        latency_ms: scenario.latency_ms,
      };
      return jsonOk(request, result);
    }
    if (typeof body.qty === "number" && body.qty > 1000) {
      const result: OrderPreviewResult = {
        status: "DENY",
        reasons: [
          {
            code: "POSITION_SIZE_LIMIT",
            message: "Order exceeds maximum allowed quantity per submission.",
          },
        ],
        source: "fresh",
        expiry_at,
        policy_version,
        latency_ms: 41,
      };
      return jsonOk(request, result);
    }
    const result: OrderPreviewResult = {
      status: "ALLOW",
      reasons: [],
      source: "fresh",
      expiry_at,
      policy_version,
      latency_ms: 38,
    };
    return jsonOk(request, result);
  }),

  http.get(url("/orders"), ({ request }) =>
    jsonOk(request, getActivePersona(request).orders),
  ),
  http.post(url("/orders"), async ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    const body = (await request
      .json()
      .catch(() => ({}))) as Partial<OrderRequest>;
    const scenario = getActiveScenario(request);
    if (scenario?.id === "ORDER_REJECTED") {
      return jsonStatus(request, 422, {
        code: "ORDER_REJECTED",
        message: "Broker rejected the order (invalid symbol or parameters).",
      });
    }
    if (scenario?.id === "ORDER_INSUFFICIENT_BP") {
      return jsonStatus(request, 422, {
        code: "INSUFFICIENT_BUYING_POWER",
        message: "Account buying power is below order notional.",
      });
    }
    if (scenario?.id === "ORDER_BROKER_UNAVAILABLE") {
      return jsonStatus(request, 503, {
        code: "BROKER_UNAVAILABLE",
        message: "Broker adapter is temporarily unavailable.",
      });
    }
    const order: Order = {
      id: `ord_${Date.now()}`,
      symbol: body.symbol ?? "AAPL",
      qty: body.qty ?? 1,
      side: body.side ?? "buy",
      type: body.type ?? "market",
      // Per Daniel's orders.evt initial state (API Contracts.pdf:p7).
      status: "submitted",
      limit_price: body.limit_price,
      created_at: new Date().toISOString(),
      client_order_id: body.client_order_id,
    };
    return jsonOk(request, order);
  }),
  http.delete(url("/orders/:id"), ({ request }) => {
    const blocked = csrfGuard(request);
    if (blocked) return blocked;
    return jsonOk(request, { ok: true });
  }),
];
