// MSW handlers for the @refi/api-clients package. Default persona is Maya.
// Handlers cover every endpoint surfaced by the hooks so that all /us/app/*
// screens render without MSW 404s in dev/test.
import { http, HttpResponse } from "msw";
import type {
  EligibilityDecision,
  Order,
  OrderPreviewResult,
  OrderRequest,
} from "../generated/api";
import {
  mayaActivity,
  mayaBrokerAccount,
  mayaBrokerConnection,
  mayaKyc,
  mayaOrders,
  mayaPositions,
  mayaRecommendations,
  mayaSession,
  supportedBrokers,
} from "./fixtures/maya";

declare const process: { env: Record<string, string | undefined> } | undefined;

const BASE =
  (typeof process !== "undefined" &&
    process?.env?.["NEXT_PUBLIC_API_BASE_URL"]) ||
  "*";

function url(path: string): string {
  if (BASE === "*") return `*${path}`;
  return `${BASE.replace(/\/$/, "")}${path}`;
}

export const handlers = [
  http.get(url("/auth/session"), () => HttpResponse.json(mayaSession)),
  http.post(url("/siwe/nonce"), () =>
    HttpResponse.json({ nonce: "mock-nonce-1234567890" }),
  ),
  http.post(url("/siwe/verify"), () => HttpResponse.json({ ok: true })),
  http.post(url("/auth/refresh"), () => HttpResponse.json({ ok: true })),
  http.post(url("/auth/revoke-all"), () => HttpResponse.json({ ok: true })),

  http.get(url("/ccid/status"), () => HttpResponse.json(mayaKyc)),
  http.post(url("/ccid/start"), () =>
    HttpResponse.json({
      provider_url: "https://complycube.example/start/mock",
    }),
  ),

  http.get(url("/v1/brokers/supported"), () =>
    HttpResponse.json(supportedBrokers),
  ),
  http.get(url("/v1/brokers/connection"), () =>
    HttpResponse.json(mayaBrokerConnection),
  ),
  http.post(url("/v1/brokers/connect/start"), () =>
    HttpResponse.json({ oauth_url: "https://broker.example/oauth/mock" }),
  ),
  http.post(url("/v1/brokers/disconnect"), () =>
    HttpResponse.json({ ok: true }),
  ),
  http.get(url("/v1/brokers/account"), () =>
    HttpResponse.json(mayaBrokerAccount),
  ),
  http.get(url("/v1/brokers/positions"), () =>
    HttpResponse.json(mayaPositions),
  ),
  http.get(url("/v1/brokers/orders"), () => HttpResponse.json(mayaOrders)),

  http.post(url("/orders/preview"), async ({ request }) => {
    const body = (await request
      .json()
      .catch(() => ({}))) as Partial<OrderRequest>;
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
      };
      return HttpResponse.json(result);
    }
    const result: OrderPreviewResult = {
      status: "ALLOW",
      reasons: [],
      source: "fresh",
    };
    return HttpResponse.json(result);
  }),

  http.get(url("/orders"), () => HttpResponse.json(mayaOrders)),
  http.post(url("/orders"), async ({ request }) => {
    const body = (await request
      .json()
      .catch(() => ({}))) as Partial<OrderRequest>;
    const order: Order = {
      id: `ord_${Date.now()}`,
      symbol: body.symbol ?? "AAPL",
      qty: body.qty ?? 1,
      side: body.side ?? "buy",
      type: body.type ?? "market",
      status: "accepted",
      limit_price: body.limit_price,
      created_at: new Date().toISOString(),
    };
    return HttpResponse.json(order);
  }),
  http.delete(url("/orders/:id"), () => HttpResponse.json({ ok: true })),

  http.get(url("/v1/recommendations"), () =>
    HttpResponse.json(mayaRecommendations),
  ),
  http.get(url("/v1/recommendations/:id"), ({ params }) => {
    const id = String(params["id"]);
    const found = mayaRecommendations.find((r) => r.id === id);
    if (!found)
      return HttpResponse.json({ message: "not found" }, { status: 404 });
    return HttpResponse.json(found);
  }),

  http.get(url("/v1/activity"), () => HttpResponse.json(mayaActivity)),

  http.post(url("/v1/us/eligibility"), () => {
    const decision: EligibilityDecision = {
      result: "eligible",
      state: "CA",
      ruleId: "default-eligible",
    };
    return HttpResponse.json(decision);
  }),
];
