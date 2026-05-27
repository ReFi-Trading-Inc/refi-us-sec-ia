// BFF preview handlers (P2.5R-04).
//
// Three new endpoints at the canonical BFF surface (`/api/v1/*` per
// `refi-build-docs/spec-current/10-bff-architecture-decision.md`). They
// project from persona lineage fixtures and prove the new shapes work
// end-to-end before the full handler migration in subsequent passes.
//
// Legacy handlers under `/v1/*` (orders, recommendations, activity, etc.)
// remain in place during this transition — consumers keep working.

import { http } from "msw";
import type {
  DashboardComposite,
  DashboardManagedExecutionStatus,
  OrderLineage,
} from "../generated/api";
import { getActivePersona } from "./fixtures/personas";
import { jsonOk, jsonStatus, url } from "./_shared";

export const bffHandlers = [
  /**
   * BACKEND_DEPENDENCY:
   * Owner: BFF (frontend-owned)
   * Source: Spanner `RiskSnapshots WHERE account_intent_id=...`
   *   per `docs/IOs/risk-engine_IO_details.md:174-193`
   * Cutover gate: BFF_LIVE_DOMAINS=risk
   * Fail-closed rule: N/A (read-only)
   */
  http.get(
    url("/api/v1/risk-snapshots/:account_intent_id"),
    ({ request, params }) => {
      const id = String(params["account_intent_id"]);
      const persona = getActivePersona(request);
      const snap = persona.riskSnapshots.find((s) => s.intent_id === id);
      if (!snap) {
        return jsonStatus(request, 404, {
          code: "NOT_FOUND",
          message: "No risk snapshot for the given account_intent_id.",
        });
      }
      return jsonOk(request, snap);
    },
  ),

  /**
   * BACKEND_DEPENDENCY:
   * Owner: BFF (frontend-owned)
   * Source: 5-table join `Orders + OrderEvents + OrderIdMap + Fills +
   *   BrokerOrderAttempts + ExecutionSagas` keyed by `client_order_id`
   * Cutover gate: BFF_LIVE_DOMAINS=orders
   * Fail-closed rule: N/A (read-only)
   *
   * Powers the "Watch every broker interaction with the broker" surface
   * per `08-daniel-rescope-plan.md §12.4`.
   */
  http.get(
    url("/api/v1/orders/:client_order_id/lineage"),
    ({ request, params }) => {
      const coid = String(params["client_order_id"]);
      const persona = getActivePersona(request);
      const order = persona.orderRows.find((o) => o.client_order_id === coid);
      if (!order) {
        return jsonStatus(request, 404, {
          code: "NOT_FOUND",
          message: "No order for the given client_order_id.",
        });
      }
      const events = persona.orderEvents.filter(
        (e) => e.order_id === order.order_id,
      );
      const attempts = persona.brokerOrderAttempts.filter(
        (a) => a.order_id === order.order_id,
      );
      const fills = persona.fills.filter((f) => f.order_id === order.order_id);
      const sagas = persona.executionSagas.filter(
        (s) => s.plan_id === order.plan_id,
      );
      const lineage: OrderLineage = { order, events, attempts, fills, sagas };
      return jsonOk(request, lineage);
    },
  ),

  /**
   * BACKEND_DEPENDENCY:
   * Owner: BFF (frontend-owned)
   * Source: composite read across multiple Spanner tables; cache key
   *   `dashboard:{account_id}` TTL 60s (mirrors admin-portal
   *   `admin:kpis:latest` per `docs/as-built/v2/admin-portal_AS_BUILT.md:141-145`)
   * Cutover gate: BFF_LIVE_DOMAINS=dashboard
   * Fail-closed rule: N/A (read-only)
   *
   * Projects the 11-card home dashboard payload (P2.5R-07). Composed from
   * persona-level fixture state so the home page can switch from N hooks to
   * 1 single fetch in the upcoming dashboard rewrite.
   */
  http.get(url("/api/v1/dashboard"), ({ request }) => {
    const persona = getActivePersona(request);
    const onboarded = Boolean(
      persona.activation.eligibility &&
      persona.activation.kyc &&
      persona.activation.profile &&
      persona.activation.broker,
    );
    const active = onboarded && persona.executionPolicy?.status === "active";
    const state: "eligible" | "onboarded" | "active" = active
      ? "active"
      : onboarded
        ? "onboarded"
        : "eligible";

    let mxStatus: DashboardManagedExecutionStatus;
    if (active) mxStatus = "active";
    else if (persona.tier === "signal") mxStatus = "not_activated";
    else if (onboarded && !persona.activation.disclosures)
      mxStatus = "blocked_disclosures";
    else mxStatus = "blocked_onboarding";

    const latestRec = persona.recommendations[0];
    const latestRisk = persona.riskSnapshots[0];
    const latestPlan = persona.executionPlans[0];
    const latestIntent = persona.accountIntents[0];

    const composite: DashboardComposite = {
      tier: persona.tier,
      account_state: {
        state,
        eligible: Boolean(persona.activation.eligibility),
        onboarded,
        active,
      },
      managed_execution: {
        status: mxStatus,
        ...(persona.executionPolicy
          ? { execution_policy: persona.executionPolicy }
          : {}),
      },
      activation: persona.activation,
      ...(latestIntent
        ? {
            latest_portfolio_run: {
              action_id: latestIntent.action_id ?? undefined,
              ts: latestIntent.ts,
            },
          }
        : {}),
      ...(latestRec ? { latest_recommendation: latestRec } : {}),
      ...(latestRisk ? { latest_risk_decision: latestRisk } : {}),
      ...(latestPlan ? { latest_execution_plan: latestPlan } : {}),
      ...(persona.brokerConnection
        ? {
            broker_freshness: {
              connected: persona.brokerConnection.status === "connected",
              data_stale: persona.brokerConnection.data_stale ?? false,
              ...(persona.brokerConnection.last_synced_at
                ? { last_synced_at: persona.brokerConnection.last_synced_at }
                : {}),
            },
          }
        : {}),
      open_exceptions_count: persona.pendingExceptions.filter(
        (e) => e.status === "pending",
      ).length,
      records_complete: persona.executionPlans.some(
        (p) => p.status === "reconciled",
      ),
      data_freshness: {
        as_of_ts: new Date().toISOString(),
        sources: ["broker", "compliance", "signals"],
      },
      control_state: persona.controlState,
    };
    return jsonOk(request, composite);
  }),
];
