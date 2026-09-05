/**
 * Demo Investor API client — the demo tier's in-process upstream.
 * Every response is validated against the v1.1.0-alpha.2 response schema
 * inside the client; these tests prove the world is contract-conformant,
 * persona-scoped, paginated correctly, and that the only mutation produces
 * new advice while preserving prior advice. Code under test:
 *   apps/web/src/lib/investor-api/demo-client.ts
 */
import { beforeEach, describe, expect, test } from "vitest";
import { InvestorApiError, CONTRACT_OPERATION_IDS } from "../investor-api";
import {
  createDemoInvestorApiClient,
  DemoUnsupportedOperationError,
  resetDemoWorldsForTests,
} from "../../../../apps/web/src/lib/investor-api/demo-client";

const ACCT = "acct_demo_admitted_01";
const admitted = () =>
  createDemoInvestorApiClient({ authId: "demo-admitted-01" });
const applicant = () =>
  createDemoInvestorApiClient({ authId: "demo-applicant-01" });

beforeEach(() => {
  resetDemoWorldsForTests();
});

const READ_OPS: Array<[string, unknown]> = [
  ["getOnboardingStatus", {}],
  ["getEligibility", {}],
  ["getKycStatus", {}],
  ["listEffectiveDisclosures", {}],
  ["listConsents", {}],
  ["listTemplates", {}],
  ["getTemplate", { path: { template_id: "template_us_sp500_following_v1" } }],
  ["listAccounts", {}],
  ["getAccount", { path: { account_id: ACCT } }],
  ["getAccountAuthorization", { path: { account_id: ACCT } }],
  ["listAdvisoryProfiles", {}],
  ["getCurrentAdvisoryProfile", {}],
  ["listComplianceProfileAttestations", { path: { account_id: ACCT } }],
  ["getCurrentComplianceProfileAttestation", { path: { account_id: ACCT } }],
  ["listBrokerageConnections", { path: { account_id: ACCT } }],
  [
    "getBrokerageConnection",
    { path: { account_id: ACCT, connection_id: "brokerconn_demo_0001" } },
  ],
  ["getAccountValuation", { path: { account_id: ACCT } }],
  [
    "listAccountValuations",
    { path: { account_id: ACCT }, query: { page_size: 100 } },
  ],
  [
    "listAccountPositions",
    { path: { account_id: ACCT }, query: { page_size: 100 } },
  ],
  ["listAccountMemberships", { path: { account_id: ACCT } }],
  ["getAccountPreferences", { path: { account_id: ACCT } }],
  ["listAccountPreferenceHistory", { path: { account_id: ACCT } }],
  ["listAccountRecommendations", { path: { account_id: ACCT } }],
  [
    "getAccountRecommendation",
    {
      path: { account_id: ACCT, recommendation_id: "recommendation_demo_0003" },
    },
  ],
  [
    "listAccountRecommendationLegs",
    {
      path: { account_id: ACCT, recommendation_id: "recommendation_demo_0003" },
      query: { page_size: 100 },
    },
  ],
  [
    "listAccountRecords",
    { path: { account_id: ACCT }, query: { page_size: 100 } },
  ],
];

describe("every implemented read is contract-valid for the admitted persona", () => {
  test.each(READ_OPS)("%s", async (op, opts) => {
    const r = await admitted().call(op as never, opts as never);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.correlationId).toMatch(/^corr_demo_/);
  });
});

describe("the admitted world is rich enough to demo", () => {
  test("24 positions, 91 valuations, 3 recommendations across CURRENT/SUPERSEDED/BLOCKED, 24 legs, records across all 16 variants", async () => {
    const c = admitted();
    const pos = await c.call("listAccountPositions", {
      path: { account_id: ACCT },
      query: { page_size: 100 },
    });
    expect(pos.data.data.items).toHaveLength(24);
    const vals = await c.call("listAccountValuations", {
      path: { account_id: ACCT },
      query: { page_size: 100 },
    });
    expect(vals.data.data.items).toHaveLength(91);
    const recs = await c.call("listAccountRecommendations", {
      path: { account_id: ACCT },
    });
    expect(recs.data.data.items.map((r) => r.status).sort()).toEqual([
      "BLOCKED",
      "CURRENT",
      "SUPERSEDED",
    ]);
    const legs = await c.call("listAccountRecommendationLegs", {
      path: { account_id: ACCT, recommendation_id: "recommendation_demo_0003" },
      query: { page_size: 100 },
    });
    expect(legs.data.data.items).toHaveLength(24);
    const cur = recs.data.data.items.find((r) => r.status === "CURRENT");
    expect(cur?.leg_count).toBe(24);
    const records = await c.call("listAccountRecords", {
      path: { account_id: ACCT },
      query: { page_size: 100 },
    });
    const types = new Set(records.data.data.items.map((r) => r.record_type));
    expect(types.size).toBe(16);
    const denied = records.data.data.items.find(
      (r) => r.record_type === "risk_decision" && r.details.status === "DENIED",
    );
    expect(denied?.details.reason_codes).toContain("RECONCILIATION_HOLD");
    const fills = records.data.data.items.filter(
      (r) => r.record_type === "fill",
    );
    expect(fills.length).toBeGreaterThan(3);
  });

  test("legs reconcile: delta = target − current and notional_delta = delta × reference_price", async () => {
    const legs = await admitted().call("listAccountRecommendationLegs", {
      path: { account_id: ACCT, recommendation_id: "recommendation_demo_0003" },
      query: { page_size: 100 },
    });
    for (const l of legs.data.data.items) {
      expect(
        Math.abs(
          Number(l.target_quantity) -
            Number(l.current_quantity) -
            Number(l.delta_quantity),
        ),
      ).toBeLessThan(0.001);
      expect(
        Math.abs(
          Number(l.delta_quantity) * Number(l.reference_price) -
            Number(l.notional_delta),
        ),
      ).toBeLessThan(0.05);
      if (l.reason_codes.includes("WITHIN_DRIFT_THRESHOLD"))
        expect(l.executable).toBe(false);
    }
  });
});

describe("personas are worlds, not authorities", () => {
  test("the applicant has no accounts and is WAITLISTED pending internal review", async () => {
    const c = applicant();
    const accounts = await c.call("listAccounts", {});
    expect(accounts.data.data.items).toEqual([]);
    const onboarding = await c.call("getOnboardingStatus", {});
    expect(onboarding.data.data.state).toBe("WAITLISTED");
    expect(onboarding.data.data.required_steps).toContain("INTERNAL_REVIEW");
    await expect(
      c.call("getAccountValuation", { path: { account_id: ACCT } }),
    ).rejects.toMatchObject({ status: 404, code: "RESOURCE_NOT_FOUND" });
  });

  test("an unknown subject is treated as an applicant, never upgraded", async () => {
    const c = createDemoInvestorApiClient({ authId: "someone-else" });
    expect((await c.call("listAccounts", {})).data.data.items).toEqual([]);
  });

  test("the admitted persona's admission is a backend projection: READY + AUTHORIZED", async () => {
    const c = admitted();
    expect((await c.call("getOnboardingStatus", {})).data.data.state).toBe(
      "READY",
    );
    expect(
      (await c.call("getAccountAuthorization", { path: { account_id: ACCT } }))
        .data.data.status,
    ).toBe("AUTHORIZED");
  });

  test("a foreign account id is 404 even for the admitted persona", async () => {
    await expect(
      admitted().call("listAccountPositions", {
        path: { account_id: "acct_alpha_other_02" },
      }),
    ).rejects.toBeInstanceOf(InvestorApiError);
  });
});

describe("pagination honours page_size and opaque cursors", () => {
  test("positions page through 24 items in pages of 10", async () => {
    const c = admitted();
    const p1 = await c.call("listAccountPositions", {
      path: { account_id: ACCT },
      query: { page_size: 10 },
    });
    expect(p1.data.data.items).toHaveLength(10);
    expect(p1.data.data.page.has_more).toBe(true);
    const p2 = await c.call("listAccountPositions", {
      path: { account_id: ACCT },
      query: {
        page_size: 10,
        cursor: p1.data.data.page.next_cursor ?? undefined,
      },
    });
    const p3 = await c.call("listAccountPositions", {
      path: { account_id: ACCT },
      query: {
        page_size: 10,
        cursor: p2.data.data.page.next_cursor ?? undefined,
      },
    });
    expect(p3.data.data.items).toHaveLength(4);
    expect(p3.data.data.page).toEqual({ has_more: false, next_cursor: null });
  });
  test("a malformed cursor is a 422 VALIDATION_ERROR", async () => {
    await expect(
      admitted().call("listAccountRecords", {
        path: { account_id: ACCT },
        query: { cursor: "bogus" },
      }),
    ).rejects.toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
  });
});

describe("the only mutation: preferences → new advice, prior advice preserved", () => {
  test("PATCH bumps the version, supersedes the CURRENT recommendation, drops excluded legs, appends records", async () => {
    const c = admitted();
    const before = await c.call("listAccountRecommendations", {
      path: { account_id: ACCT },
    });
    const beforeCurrent = before.data.data.items.find(
      (r) => r.status === "CURRENT",
    );
    if (!beforeCurrent)
      throw new Error("no CURRENT recommendation in the base world");
    const recordsBefore = (
      await c.call("listAccountRecords", {
        path: { account_id: ACCT },
        query: { page_size: 100 },
      })
    ).data.data.items.length;
    const receipt = await c.call("updateAccountPreferences", {
      path: { account_id: ACCT },
      body: {
        drift_threshold: "0.05",
        excluded_assets: [
          "security_us_mo",
          "security_us_pm",
          "security_us_tsla",
        ],
      },
      ifMatch: "1",
      idempotencyKey: "k-1",
    });
    expect(receipt.status).toBe(202);
    expect(receipt.data.data.status).toBe("ACCEPTED");
    expect(receipt.data.data.aggregate_version).toBe(2);
    const prefs = await c.call("getAccountPreferences", {
      path: { account_id: ACCT },
    });
    expect(prefs.data.data.version).toBe(2);
    expect(prefs.data.data.drift_threshold).toBe("0.05");
    const after = await c.call("listAccountRecommendations", {
      path: { account_id: ACCT },
    });
    expect(after.data.data.items).toHaveLength(4);
    expect(
      after.data.data.items.filter((r) => r.status === "CURRENT"),
    ).toHaveLength(1);
    expect(
      after.data.data.items.find(
        (r) => r.recommendation_id === beforeCurrent.recommendation_id,
      )?.status,
    ).toBe("SUPERSEDED");
    const newCurrent = after.data.data.items.find(
      (r) => r.status === "CURRENT",
    );
    if (!newCurrent)
      throw new Error("no CURRENT recommendation after the patch");
    const legs = await c.call("listAccountRecommendationLegs", {
      path: {
        account_id: ACCT,
        recommendation_id: newCurrent.recommendation_id,
      },
      query: { page_size: 100 },
    });
    expect(
      legs.data.data.items.some((l) => l.security_id === "security_us_tsla"),
    ).toBe(false);
    expect(newCurrent.leg_count).toBe(legs.data.data.items.length);
    const recordsAfter = (
      await c.call("listAccountRecords", {
        path: { account_id: ACCT },
        query: { page_size: 100 },
      })
    ).data.data.items;
    expect(recordsAfter.length).toBeGreaterThan(recordsBefore);
    expect(recordsAfter[0]?.record_type).toBe("reconciliation"); // newest first
    expect(
      recordsAfter.some(
        (r) =>
          r.record_type === "preference" &&
          r.details.entity_id === "preferences_demo_v2",
      ),
    ).toBe(true);
    const receiptRead = await c.call("getAccountActionReceipt", {
      path: {
        account_id: ACCT,
        action_receipt_id: receipt.data.data.action_receipt_id,
      },
    });
    expect(receiptRead.data.data.action_receipt_id).toBe(
      receipt.data.data.action_receipt_id,
    );
  });

  test("a stale If-Match is a 409", async () => {
    await expect(
      admitted().call("updateAccountPreferences", {
        path: { account_id: ACCT },
        body: { min_order: "50" },
        ifMatch: "7",
        idempotencyKey: "k-2",
      }),
    ).rejects.toMatchObject({ status: 409, code: "STALE_VERSION" });
  });
});

describe("the demo never fabricates a write it does not own", () => {
  test.each([
    "createBrokerageConnection",
    "rotateBrokerageCredentials",
    "syncBrokerageConnection",
    "disconnectBrokerageConnection",
    "createAllocationPreview",
    "createAccountAction",
    "createComplianceProfileAttestation",
    "joinWaitlist",
    "exchangeIdentity",
    "getIdentityJwks",
  ])("%s throws DemoUnsupportedOperationError", async (op) => {
    await expect(
      admitted().call(op as never, { path: { account_id: ACCT } } as never),
    ).rejects.toBeInstanceOf(DemoUnsupportedOperationError);
  });
  test("streamAccountEvents is not part of the read client at all", () => {
    expect(CONTRACT_OPERATION_IDS).toContain("streamAccountEvents");
    expect(Object.keys(admitted())).not.toContain("stream");
  });
});
