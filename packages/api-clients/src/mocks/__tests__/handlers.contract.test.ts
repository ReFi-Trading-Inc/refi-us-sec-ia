// Cross-handler contract tests (MIG-P2.5-22).
//
// Asserts the per-handler invariants that mirror Daniel's middleware
// contracts and our own fail-closed posture:
//   1. Every response echoes `x-correlation-id`
//   2. Every state-changing handler returns 403 without `x-csrf-token`
//      (SIWE verify is exempted by design — the signed nonce is the
//      anti-forgery proof)
//   3. Typed responses (no bare `{ ok: true }` outside OkResult endpoints)
//   4. Per-persona / per-scenario routing flows through to the handler
//
// Tests use MSW handlers directly via the `resolver` indirection — no
// `setupServer` needed since we control the request shape.

import { describe, it, expect, beforeEach } from "vitest";
import {
  authHandlers,
  ccidHandlers,
  brokerHandlers,
  ordersHandlers,
  recommendationsHandlers,
  documentsHandlers,
  supportHandlers,
  accountHandlers,
  __resetRecOverrides,
} from "../handlers";

// Helper to invoke an MSW handler with a synthetic request.
async function invoke(
  handler: (typeof authHandlers)[number],
  init: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<Response | undefined> {
  const request = new Request(init.url, {
    method: init.method ?? "GET",
    headers: init.headers,
    body:
      init.body === undefined
        ? undefined
        : typeof init.body === "string"
          ? init.body
          : JSON.stringify(init.body),
  });
  // MSW handler shape: { info: {method, path}, resolver: ({request, params, cookies}) => Response }
  // We bypass MSW's matcher and call resolver directly to keep the test stable.
  const anyHandler = handler as unknown as {
    info?: { method?: string; path?: string };
    resolver?: (ctx: {
      request: Request;
      params: Record<string, string>;
      cookies: Record<string, string>;
    }) => Promise<Response> | Response;
  };
  if (!anyHandler.resolver) return undefined;
  return anyHandler.resolver({
    request,
    params: extractParams(anyHandler.info?.path, init.url),
    cookies: {},
  });
}

function extractParams(
  pattern: string | undefined,
  reqUrl: string,
): Record<string, string> {
  if (!pattern) return {};
  // Pattern may look like "*/v1/recommendations/:id"; reqUrl absolute.
  const url = new URL(reqUrl);
  const reqParts = url.pathname.split("/").filter(Boolean);
  const patParts = pattern.replace(/^\*/, "").split("/").filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < patParts.length; i++) {
    const p = patParts[i]!;
    if (p.startsWith(":")) params[p.slice(1)] = reqParts[i] ?? "";
  }
  return params;
}

const BASE = "https://api.example/";
function u(path: string): string {
  return new URL(path.replace(/^\//, ""), BASE).toString();
}

beforeEach(() => {
  __resetRecOverrides();
});

// ─── 1. x-correlation-id echo ──────────────────────────────────────────────

describe("x-correlation-id echo", () => {
  // One representative GET per domain — covers the read path for every
  // handler bundle exported from handlers.ts.
  const reads: Array<{
    name: string;
    handler: () => (typeof authHandlers)[number];
    url: string;
  }> = [
    {
      name: "auth.session",
      handler: () => authHandlers[0]!,
      url: u("/auth/session"),
    },
    {
      name: "ccid.status",
      handler: () => ccidHandlers[0]!,
      url: u("/ccid/status"),
    },
    {
      name: "brokers.connection",
      handler: () => brokerHandlers[1]!,
      url: u("/v1/brokers/connection"),
    },
    {
      name: "orders.list",
      handler: () => ordersHandlers[1]!,
      url: u("/orders"),
    },
    {
      name: "recommendations.list",
      handler: () => recommendationsHandlers[0]!,
      url: u("/v1/recommendations"),
    },
    {
      name: "account.activation",
      handler: () => accountHandlers[3]!,
      url: u("/v1/account/activation"),
    },
  ];

  for (const { name, handler, url: reqUrl } of reads) {
    it(`${name} echoes x-correlation-id`, async () => {
      const corrId = "test-corr-" + Math.random().toString(36).slice(2);
      const res = await invoke(handler(), {
        url: reqUrl,
        headers: { "x-correlation-id": corrId },
      });
      expect(res).toBeDefined();
      expect(res!.headers.get("x-correlation-id")).toBe(corrId);
    });
  }

  it("generates a correlation-id when caller omits one", async () => {
    const res = await invoke(authHandlers[0]!, { url: u("/auth/session") });
    expect(res!.headers.get("x-correlation-id")).toBeTruthy();
  });
});

// ─── 2. CSRF guard on writes ───────────────────────────────────────────────

describe("CSRF guard on writes", () => {
  // (handler index, route, method) — verifies write endpoints reject
  // requests without `x-csrf-token`. SIWE verify intentionally exempt.
  const writes: Array<{
    name: string;
    handler: (typeof authHandlers)[number];
    url: string;
    method: string;
    body?: unknown;
  }> = [
    {
      name: "auth.refresh",
      handler: authHandlers[3]!,
      url: u("/auth/refresh"),
      method: "POST",
    },
    {
      name: "auth.logout",
      handler: authHandlers[4]!,
      url: u("/auth/logout"),
      method: "POST",
    },
    {
      name: "ccid.start",
      handler: ccidHandlers[1]!,
      url: u("/ccid/start"),
      method: "POST",
    },
    {
      name: "compliance.invalidate",
      handler: ccidHandlers[3]!,
      url: u("/compliance/acct_x/invalidate"),
      method: "POST",
    },
    {
      name: "broker.connect.start",
      handler: brokerHandlers[2]!,
      url: u("/v1/brokers/connect/start"),
      method: "POST",
    },
    {
      name: "broker.connect.keys",
      handler: brokerHandlers[3]!,
      url: u("/v1/brokers/connect/keys"),
      method: "POST",
      body: {},
    },
    {
      name: "broker.disconnect",
      handler: brokerHandlers[4]!,
      url: u("/v1/brokers/disconnect"),
      method: "POST",
    },
    {
      name: "orders.preview",
      handler: ordersHandlers[0]!,
      url: u("/orders/preview"),
      method: "POST",
      body: {},
    },
    {
      name: "orders.create",
      handler: ordersHandlers[2]!,
      url: u("/orders"),
      method: "POST",
      body: {},
    },
    {
      name: "orders.cancel",
      handler: ordersHandlers[3]!,
      url: u("/orders/ord_1"),
      method: "DELETE",
    },
    {
      name: "documents.acknowledge",
      handler: documentsHandlers[0]!,
      url: u("/v1/documents/acknowledge"),
      method: "POST",
      body: {},
    },
    {
      name: "support.ticket",
      handler: supportHandlers[0]!,
      url: u("/v1/support/ticket"),
      method: "POST",
      body: {},
    },
    {
      name: "profile.save",
      handler: accountHandlers[1]!,
      url: u("/v1/profile"),
      method: "POST",
      body: {},
    },
    {
      name: "account.activate",
      handler: accountHandlers[4]!,
      url: u("/v1/account/activate"),
      method: "POST",
    },
  ];

  for (const w of writes) {
    it(`${w.name} returns 403 without x-csrf-token`, async () => {
      const res = await invoke(w.handler, {
        url: w.url,
        method: w.method,
        body: w.body,
      });
      expect(res!.status).toBe(403);
      const body = await res!.json();
      expect(body.code).toBe("CSRF_TOKEN_MISSING");
    });

    it(`${w.name} passes with x-csrf-token`, async () => {
      const res = await invoke(w.handler, {
        url: w.url,
        method: w.method,
        headers: { "x-csrf-token": "tok-test" },
        body: w.body,
      });
      // Anything other than 403 CSRF_MISSING means the guard let it through.
      // The handler may still return 4xx for other reasons (e.g., 422 for
      // blocked support categories) but the CSRF gate itself passed.
      if (res!.status === 403) {
        const body = await res!.json().catch(() => ({}));
        expect(body.code).not.toBe("CSRF_TOKEN_MISSING");
      }
    });
  }

  it("siwe.verify is exempt from CSRF (signed nonce is the proof)", async () => {
    const res = await invoke(authHandlers[2]!, {
      url: u("/siwe/verify"),
      method: "POST",
      body: { message: "m", signature: "s" },
    });
    expect(res!.status).toBe(200);
  });

  it("ccid.webhook.provider is exempt from CSRF (provider-to-server)", async () => {
    const res = await invoke(ccidHandlers[2]!, {
      url: u("/ccid/webhook/provider"),
      method: "POST",
    });
    expect(res!.status).toBe(200);
  });
});

// ─── 3. Typed responses (no bare {ok:true} on resource-y endpoints) ────────

describe("typed responses", () => {
  it("GET /v1/recommendations returns an array", async () => {
    const res = await invoke(recommendationsHandlers[0]!, {
      url: u("/v1/recommendations"),
    });
    const body = await res!.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /v1/activity returns an array", async () => {
    // activityHandlers[0] — only one handler in the bundle
    const handler = (await import("../handlers")).activityHandlers[0]!;
    const res = await invoke(handler, { url: u("/v1/activity") });
    const body = await res!.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /v1/account/activation returns expected booleans", async () => {
    const res = await invoke(accountHandlers[3]!, {
      url: u("/v1/account/activation"),
    });
    const body = await res!.json();
    for (const key of [
      "eligibility",
      "wallet",
      "kyc",
      "profile",
      "broker",
      "disclosures",
    ]) {
      expect(typeof body[key]).toBe("boolean");
    }
  });

  it("POST /orders/preview always includes expiry_at + policy_version", async () => {
    const res = await invoke(ordersHandlers[0]!, {
      url: u("/orders/preview"),
      method: "POST",
      headers: { "x-csrf-token": "tok" },
      body: { symbol: "AAPL", qty: 1, side: "buy", type: "market" },
    });
    const body = await res!.json();
    expect(typeof body.expiry_at).toBe("string");
    expect(typeof body.policy_version).toBe("string");
    expect(["ALLOW", "REVIEW", "DENY"]).toContain(body.status);
  });
});

// ─── 4. Persona routing ────────────────────────────────────────────────────

describe("persona routing via cookie", () => {
  it("default persona is Maya", async () => {
    const res = await invoke(authHandlers[0]!, { url: u("/auth/session") });
    const body = await res!.json();
    expect(body.account_id).toBe("acct_maya_001");
  });

  it("refi_persona_v1=david flips session to David", async () => {
    const res = await invoke(authHandlers[0]!, {
      url: u("/auth/session"),
      headers: { cookie: "refi_persona_v1=david" },
    });
    const body = await res!.json();
    expect(body.account_id).toBe("acct_david_002");
  });

  it("refi_persona_v1=sarah flips session to Sarah", async () => {
    const res = await invoke(authHandlers[0]!, {
      url: u("/auth/session"),
      headers: { cookie: "refi_persona_v1=sarah" },
    });
    const body = await res!.json();
    expect(body.account_id).toBe("acct_sarah_003");
  });

  it("David returns 404 on broker connection", async () => {
    const res = await invoke(brokerHandlers[1]!, {
      url: u("/v1/brokers/connection"),
      headers: { cookie: "refi_persona_v1=david" },
    });
    expect(res!.status).toBe(404);
  });

  it("Sarah's broker connection carries data_stale: true", async () => {
    const res = await invoke(brokerHandlers[1]!, {
      url: u("/v1/brokers/connection"),
      headers: { cookie: "refi_persona_v1=sarah" },
    });
    const body = await res!.json();
    expect(body.data_stale).toBe(true);
  });
});
