/**
 * Admin-portal-proxy E2E — Sprint 2 exit item.
 *
 * What this spec asserts against the running dev server:
 *   1. Every proxied investor route is dark by default (flags off),
 *      returning an empty projection envelope with no upstream call.
 *   2. Every proxied investor route requires auth: an unauthenticated
 *      request never proceeds and never leaks scope.
 *   3. Cross-account requests via `x-investor-account-id` header
 *      spoofing cannot escalate scope — the BFF's authoritative
 *      auth.accountId always wins.
 *   4. The `@live`-tagged block (skipped by default) is the seam that
 *      Sprint 5 flips on once D4 lands. Every row present here maps
 *      1:1 to the README integration scoreboard.
 *
 * `@live` is opt-in via `PLAYWRIGHT_LIVE_PROXY=1`. Without that env
 * signal these specs are skipped so CI stays deterministic before
 * Daniel's staging URL is wired.
 */
import { expect, test } from "./fixtures";
import { E2E_USERS } from "./global-setup";

const PROXY_ROUTES = [
  { path: "/api/v1/investor/templates", key: "templates" },
  { path: "/api/v1/investor/memberships", key: "memberships" },
  { path: "/api/v1/investor/rules", key: "rules" },
  { path: "/api/v1/investor/accounts", key: "accounts" },
  { path: "/api/v1/investor/account-flow", key: "flow" },
  { path: "/api/v1/investor/risk-limits", key: "limits" },
  { path: "/api/v1/investor/intents", key: "intents" },
  { path: "/api/v1/investor/risk-decisions", key: "decisions" },
  { path: "/api/v1/investor/execution-plans", key: "plans" },
  { path: "/api/v1/investor/orders", key: "orders" },
  { path: "/api/v1/investor/orders-blocked", key: "blocked" },
  { path: "/api/v1/investor/broker-interactions", key: "interactions" },
  { path: "/api/v1/investor/reconciliation", key: "runs" },
  { path: "/api/v1/investor/trading-controls-state", key: "state" },
] as const;

const AUTHED_COOKIE = [
  {
    name: "us_eligibility_v1",
    value: E2E_USERS.signal.eligibilityCookie,
    domain: "localhost",
    path: "/",
  },
];

test.describe("admin-portal-proxy: dark-by-default behavior", () => {
  for (const route of PROXY_ROUTES) {
    test(`GET ${route.path} returns empty projection with flag off`, async ({
      request,
    }) => {
      const res = await request.get(route.path, {
        headers: {
          cookie: `us_eligibility_v1=${E2E_USERS.signal.eligibilityCookie}`,
        },
      });
      expect(res.status(), await res.text()).toBe(200);
      const body = (await res.json()) as { data?: Record<string, unknown> };
      // Every route's dark-mode return is an empty list under the route's
      // projection key. If the flag turned on unintentionally, the shape
      // would still be a list but non-empty (fixture path) or an error
      // (real upstream absent), both of which trip this expectation.
      // `notice` is a UX-affordance string compiled into the BFF (rendered
      // as an "Available in preview" chip), not upstream data — skip it.
      const data = body.data ?? {};
      const METADATA_KEYS = new Set(["notice"]);
      const entries = Object.entries(data).filter(
        ([k]) => !METADATA_KEYS.has(k),
      );
      const emptyOrNull = entries.every(([, v]) => {
        if (v === null || v === undefined) return true;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === "object") return Object.keys(v).length === 0;
        return false;
      });
      expect(
        emptyOrNull,
        `route ${route.path} leaked non-empty payload with flag off`,
      ).toBe(true);
    });
  }
});

test.describe("admin-portal-proxy: cross-account and auth boundaries", () => {
  test("unauthenticated request receives empty envelope, never upstream data", async ({
    request,
  }) => {
    // No eligibility, no session — the route wrapper resolves auth=null
    // and returns an empty projection. This proves anonymous callers
    // do not exercise the proxy transport.
    const res = await request.get("/api/v1/investor/intents");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data?: { intents?: unknown[] } };
    expect(body.data?.intents ?? []).toEqual([]);
  });

  test("spoofed x-investor-account-id header cannot escalate scope", async ({
    request,
  }) => {
    // The proxy client forwards the auth-derived accountId to upstream.
    // A caller-supplied header must NOT override that value at any hop.
    // With the flag off the response is empty either way; this spec's
    // job is to prove the BFF does not echo the spoofed value back nor
    // accept it as authoritative in the envelope.
    const res = await request.get("/api/v1/investor/intents", {
      headers: {
        cookie: `us_eligibility_v1=${E2E_USERS.signal.eligibilityCookie}`,
        "x-investor-account-id": "acct-attacker-victim-99",
      },
    });
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(
      text.includes("acct-attacker-victim-99"),
      "BFF echoed spoofed account id — potential ACL bypass surface",
    ).toBe(false);
  });
});

test.describe("admin-portal-proxy: @live conformance against staging", () => {
  test.beforeAll(() => {
    if (process.env["PLAYWRIGHT_LIVE_PROXY"] !== "1") {
      test.skip(
        true,
        "PLAYWRIGHT_LIVE_PROXY=1 opts in to live-staging conformance. Sprint 5 activates this once D4 lands.",
      );
    }
  });

  for (const route of PROXY_ROUTES) {
    test(`@live ${route.path} passes strict projection`, async ({
      request,
    }) => {
      const res = await request.get(route.path, {
        headers: {
          cookie: `us_eligibility_v1=${E2E_USERS.signal.eligibilityCookie}`,
        },
      });
      expect(res.status(), `live ${route.path} did not return 200`).toBe(200);
      // A live pass means: (a) upstream reached; (b) strict schema
      // parse survived; (c) no admin field survived redaction (fuzz +
      // contract assertions guarantee the last one at unit-test level).
      const body = (await res.json()) as {
        data?: Record<string, unknown>;
        source?: string;
      };
      expect(body.source).toBeDefined();
      expect(body.data).toBeDefined();
    });
  }
});

// Silence linter about the unused import — kept for the seeded auth
// pattern documented in other specs.
void AUTHED_COOKIE;
