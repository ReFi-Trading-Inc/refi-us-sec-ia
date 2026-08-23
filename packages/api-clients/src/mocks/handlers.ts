// MSW handlers for the @refi/api-clients package. Default persona is Maya.
// Handlers cover every endpoint surfaced by the hooks so that all /us/app/*
// screens render without MSW 404s in dev/test.
import { http, HttpResponse } from "msw";
import type { EligibilityDecision } from "../compat";
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
  (typeof process !== "undefined" && process.env["NEXT_PUBLIC_API_BASE_URL"]) ||
  "*";

function url(path: string): string {
  if (BASE === "*") return `*${path}`;
  return `${BASE.replace(/\/$/, "")}${path}`;
}

const SESSION_COOKIE =
  "us_session_v1=mock-session-token; Path=/us; HttpOnly; SameSite=Lax";
const CLEAR_SESSION_COOKIE =
  "us_session_v1=; Path=/us; Max-Age=0; HttpOnly; SameSite=Lax";

export const handlers = [
  http.get(url("/auth/session"), () => HttpResponse.json(mayaSession)),
  http.get(url("/siwe/nonce"), () =>
    HttpResponse.json({ nonce: "mock-nonce-1234567890" }),
  ),
  http.post(url("/siwe/nonce"), () =>
    HttpResponse.json({ nonce: "mock-nonce-1234567890" }),
  ),
  http.post(url("/siwe/verify"), () =>
    HttpResponse.json(
      { ok: true },
      { headers: { "Set-Cookie": SESSION_COOKIE } },
    ),
  ),
  http.post(url("/auth/refresh"), () =>
    HttpResponse.json(
      { ok: true },
      { headers: { "Set-Cookie": SESSION_COOKIE } },
    ),
  ),
  http.post(url("/auth/revoke-all"), () =>
    HttpResponse.json(
      { ok: true },
      { headers: { "Set-Cookie": CLEAR_SESSION_COOKIE } },
    ),
  ),

  http.get(url("/ccid/status"), () => HttpResponse.json(mayaKyc)),
  http.post(url("/ccid/start"), () =>
    HttpResponse.json({
      provider_url: "https://complycube.example/start/mock",
      provider_reference: "ccid_ref_mock_001",
    }),
  ),
  http.post(url("/ccid/webhook/provider"), () =>
    HttpResponse.json({ ok: true }),
  ),
  http.post(url("/compliance/invalidate-cache"), () =>
    HttpResponse.json({ ok: true }),
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
  http.post(url("/v1/brokers/connect/keys"), () =>
    HttpResponse.json({ ok: true, connection: mayaBrokerConnection }),
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

  // Read model only. The POST /orders (submission) and DELETE /orders/:id
  // (cancellation) mocks were removed 2026-08-22 with useOrderPreview and
  // CompliancePreview: no hook called them, and a mock that answers "accepted"
  // to an order submission describes a capability the Signal product must not
  // have.
  http.get(url("/orders"), () => HttpResponse.json(mayaOrders)),

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

  http.post(url("/v1/documents/acknowledge"), () =>
    HttpResponse.json({ ok: true }),
  ),

  http.post(url("/v1/us/eligibility"), () => {
    const decision: EligibilityDecision = {
      result: "eligible",
      state: "CA",
      ruleId: "default-eligible",
    };
    return HttpResponse.json(decision);
  }),

  // Onboarding: advisory profile, strategy, activation (MIG-P2-04)
  http.get(url("/v1/profile"), () =>
    HttpResponse.json({
      account_id: "acct_maya_001",
      goal: "Long-term growth",
      timeHorizon: "5–10 years",
      incomeBand: "$100,000–$250,000",
      liquidNetWorth: "$200,000–$500,000",
      riskTolerance: "Moderate",
      investmentExperience: "Some",
      accountPurpose: "Personal",
      updated_at: "2026-05-12T10:00:00Z",
    }),
  ),
  http.post(url("/v1/profile"), async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return HttpResponse.json({
      account_id: "acct_maya_001",
      ...body,
      updated_at: new Date().toISOString(),
    });
  }),
  http.get(url("/v1/strategies/current"), () =>
    HttpResponse.json({
      strategyName: "ReFi Signal — Balanced Growth",
      rationale:
        "Allocation tilts toward broad index exposure with a growth bias consistent with your stated horizon and risk tolerance.",
      targetAllocation:
        "60% equities (broad index + growth tilt), 30% fixed income, 10% cash",
      assetUniverse: "US-listed equities and ETFs only",
      riskGuardrails:
        "Per-position cap 8%; daily turnover cap 10%; sector concentration cap 30%",
      expectedTurnover: "Moderate — 15–25% annual",
      exclusions: "No leverage, options, crypto, or non-US securities",
      costsAndFees:
        "Advisory: 0.50% AUM annual. Broker execution fees pass-through.",
      modelVersion: "signal-1.4.0",
    }),
  ),
  http.get(url("/v1/account/activation"), () =>
    HttpResponse.json({
      eligibility: true,
      wallet: true,
      kyc: true,
      profile: true,
      broker: true,
      disclosures: false,
    }),
  ),
  http.post(url("/v1/account/activate"), () =>
    HttpResponse.json({ ok: true, activated_at: new Date().toISOString() }),
  ),
];
