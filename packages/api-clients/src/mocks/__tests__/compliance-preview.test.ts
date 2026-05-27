// Compliance preview scenario matrix (MIG-P2.5-22 + MIG-P2.5-03).
//
// Iterates the 10 compliance-specific scenarios in VERDICT_FIXTURES and
// asserts the /orders/preview handler returns the matching verdict shape.
// This is the single most important regression test in the repo — it
// guarantees that the fail-closed gate sees the correct codes.

import { describe, it, expect } from "vitest";
import { ordersHandlers } from "../handlers";
import {
  COMPLIANCE_SCENARIO_IDS,
  VERDICT_FIXTURES,
} from "../fixtures/compliance/verdicts";

async function previewWithScenario(scenarioId: string) {
  const handler = ordersHandlers[0]!;
  const url = `https://api.example/orders/preview?scenario=${encodeURIComponent(scenarioId)}`;
  const request = new Request(url, {
    method: "POST",
    headers: { "x-csrf-token": "tok" },
    body: JSON.stringify({
      symbol: "AAPL",
      qty: 1,
      side: "buy",
      type: "market",
    }),
  });
  const anyHandler = handler as unknown as {
    resolver: (ctx: {
      request: Request;
      params: Record<string, string>;
      cookies: Record<string, string>;
    }) => Promise<Response>;
  };
  return anyHandler.resolver({ request, params: {}, cookies: {} });
}

describe("compliance verdict matrix", () => {
  for (const id of COMPLIANCE_SCENARIO_IDS) {
    const fixture = VERDICT_FIXTURES[id];
    it(`scenario ${id} returns status=${fixture.verdict.status}`, async () => {
      const res = await previewWithScenario(id);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe(fixture.verdict.status);
      expect(body.source).toBe(fixture.source);
      expect(body.latency_ms).toBe(fixture.latency_ms);
      expect(typeof body.expiry_at).toBe("string");
      expect(typeof body.policy_version).toBe("string");
    });
  }

  it("default (no scenario) returns ALLOW for in-range qty", async () => {
    const handler = ordersHandlers[0]!;
    const request = new Request("https://api.example/orders/preview", {
      method: "POST",
      headers: { "x-csrf-token": "tok" },
      body: JSON.stringify({
        symbol: "AAPL",
        qty: 1,
        side: "buy",
        type: "market",
      }),
    });
    const anyHandler = handler as unknown as {
      resolver: (ctx: {
        request: Request;
        params: Record<string, string>;
        cookies: Record<string, string>;
      }) => Promise<Response>;
    };
    const res = await anyHandler.resolver({ request, params: {}, cookies: {} });
    const body = await res.json();
    expect(body.status).toBe("ALLOW");
  });

  it("default falls back to DENY POSITION_SIZE_LIMIT when qty > 1000", async () => {
    const handler = ordersHandlers[0]!;
    const request = new Request("https://api.example/orders/preview", {
      method: "POST",
      headers: { "x-csrf-token": "tok" },
      body: JSON.stringify({
        symbol: "AAPL",
        qty: 1500,
        side: "buy",
        type: "market",
      }),
    });
    const anyHandler = handler as unknown as {
      resolver: (ctx: {
        request: Request;
        params: Record<string, string>;
        cookies: Record<string, string>;
      }) => Promise<Response>;
    };
    const res = await anyHandler.resolver({ request, params: {}, cookies: {} });
    const body = await res.json();
    expect(body.status).toBe("DENY");
    expect(body.reasons[0]?.code).toBe("POSITION_SIZE_LIMIT");
  });
});
