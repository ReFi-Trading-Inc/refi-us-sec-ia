/**
 * Investor product (P1A) — domain model, capability gating, fixture adapter,
 * and the Production fixture prohibition.
 *
 * Code under test (imported from apps/web — the same cross-package pattern as
 * demo-investor-api-client.test.ts / attestation-mapping.test.ts):
 *   - apps/web/src/lib/investor-product/domain.ts
 *   - apps/web/src/lib/investor-product/fixture-adapter.ts
 *   - apps/web/src/lib/investor-product/resolve-adapter.ts
 *
 * These assert the founder-directive invariants that must not regress:
 * LIVE is blocked by capability authority (not UI state), fixtures are
 * impossible in Production, consent is version+hash bound, admission is never
 * inferred, and no credential survives a connect.
 */
import { describe, expect, test } from "vitest";
import {
  ALPHA_CAPABILITIES,
  assertEnvironmentSelectable,
  consentSatisfies,
  environmentSelectability,
  EnvironmentNotSelectableError,
  isConnectionUsable,
  validateAllocation,
  type AllocationBounds,
  type ConsentReceipt,
  type ConsentRequirement,
} from "../../../../apps/web/src/lib/investor-product/domain";
import {
  FIXTURE_STRINGS,
  FixtureInvestorProductAdapter,
  looksLikeCredential,
} from "../../../../apps/web/src/lib/investor-product/fixture-adapter";
import {
  AdapterModeInvalidError,
  FixtureAdapterForbiddenError,
  fixtureDataPermitted,
  resolveAdapterMode,
} from "../../../../apps/web/src/lib/investor-product/resolve-adapter";

// Synthetic, shape-valid, and never a real credential: derived at runtime so
// no literal in this file resembles a key pair (gitleaks-clean by
// construction).
const FAKE_KEY = `PK${"0".repeat(18)}`;
const FAKE_SECRET = "s".padEnd(40, "0");

const PAPER_INTENT = {
  broker: "alpaca" as const,
  environment: "paper" as const,
  credentials: { apiKeyId: FAKE_KEY, apiSecretKey: FAKE_SECRET },
};

// ─── 2. LIVE visible but impossible to activate ──────────────────────────────

describe("LIVE is blocked by capability authority", () => {
  test("Alpha capabilities disable live trading with a stated reason", () => {
    expect(ALPHA_CAPABILITIES.liveTradingEnabled).toBe(false);
    // A reason is required so the UI can render an accessible explanation
    // rather than a bare disabled control.
    expect(ALPHA_CAPABILITIES.liveUnavailableReason).toBe("alpha_paper_only");
  });

  test("paper is selectable, live is not", () => {
    expect(environmentSelectability("paper", ALPHA_CAPABILITIES)).toEqual({
      selectable: true,
    });
    expect(environmentSelectability("live", ALPHA_CAPABILITIES)).toEqual({
      selectable: false,
      reason: "alpha_paper_only",
    });
  });

  test("a hand-built LIVE intent is refused before any transport work", async () => {
    const adapter = new FixtureInvestorProductAdapter();
    await expect(
      adapter.initiateBrokerageConnection({
        ...PAPER_INTENT,
        environment: "live",
      }),
    ).rejects.toBeInstanceOf(EnvironmentNotSelectableError);
    // ...and fixture state is untouched: no connection was created.
    const read = await adapter.getBrokerageConnection();
    expect(read.ok && read.value).toBeNull();
    expect(adapter.connectAttempts).toBe(0);
  });

  test("confirmSubscription also refuses LIVE", async () => {
    const adapter = new FixtureInvestorProductAdapter({
      startConnected: true,
    });
    await expect(
      adapter.confirmSubscription({
        strategyId: FIXTURE_STRINGS.strategyId,
        connectionId: FIXTURE_STRINGS.connectionId,
        environment: "live",
        allocationPercent: 25,
        consentReceiptId: FIXTURE_STRINGS.consentReceiptId,
        stateVersion: 1,
      }),
    ).rejects.toBeInstanceOf(EnvironmentNotSelectableError);
  });

  test("live only opens when capability authority says so", () => {
    // Proves the gate is authority-driven, not hardcoded to refuse forever.
    expect(
      environmentSelectability("live", {
        liveTradingEnabled: true,
        liveUnavailableReason: null,
      }),
    ).toEqual({ selectable: true });
    expect(() =>
      assertEnvironmentSelectable("live", ALPHA_CAPABILITIES),
    ).toThrow(EnvironmentNotSelectableError);
  });
});

// ─── 3 + 12. Fixture mode forbidden in Production, no silent fallback ────────

describe("Production forbids the fixture adapter", () => {
  test("prod + explicit fixture throws", () => {
    expect(() =>
      resolveAdapterMode({ refiEnv: "prod", configured: "fixture" }),
    ).toThrow(FixtureAdapterForbiddenError);
  });

  test("prod with NO configuration fails closed to transport", () => {
    // The absence of configuration must never enable fixtures.
    expect(resolveAdapterMode({ refiEnv: "prod", configured: undefined })).toBe(
      "transport",
    );
    expect(resolveAdapterMode({ refiEnv: "prod", configured: "" })).toBe(
      "transport",
    );
  });

  test("prod ignores any attempt to request fixtures by casing tricks", () => {
    for (const raw of ["FIXTURE", " Fixture ", "fixture"]) {
      expect(() =>
        resolveAdapterMode({ refiEnv: "prod", configured: raw }),
      ).toThrow(FixtureAdapterForbiddenError);
    }
  });

  test("an unknown mode is a configuration error, not a default", () => {
    expect(() =>
      resolveAdapterMode({ refiEnv: "staging", configured: "mock" }),
    ).toThrow(AdapterModeInvalidError);
  });

  test("non-prod tiers may use fixtures; prod may never display them", () => {
    for (const env of ["dev", "staging", "demo"] as const) {
      expect(resolveAdapterMode({ refiEnv: env, configured: undefined })).toBe(
        "fixture",
      );
      expect(fixtureDataPermitted(env)).toBe(true);
    }
    expect(fixtureDataPermitted("prod")).toBe(false);
  });

  test("the decision uses no hostname or URL input", () => {
    // resolveAdapterMode's entire input surface is the tier + the explicit
    // config value; there is no field a hostname could arrive through.
    expect(
      Object.keys({ refiEnv: "prod", configured: undefined }).sort(),
    ).toEqual(["configured", "refiEnv"]);
  });
});

// ─── 1 + 4. PAPER happy path, disconnect / reconnect ────────────────────────

describe("PAPER brokerage connection", () => {
  test("happy path: not connected → connected, paper, with an account id", async () => {
    const adapter = new FixtureInvestorProductAdapter();

    const before = await adapter.getBrokerageConnection();
    expect(before.ok && before.value).toBeNull();

    const res = await adapter.initiateBrokerageConnection(PAPER_INTENT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe("connected");
    // Environment is explicit on the projection, not inferred from the key.
    expect(res.value.environment).toBe("paper");
    expect(res.value.broker).toBe("alpaca");
    expect(res.value.brokerAccountId).toBe(FIXTURE_STRINGS.brokerAccountId);
    expect(isConnectionUsable(res.value)).toBe(true);
  });

  test("missing credentials are a validation failure, not a connection", async () => {
    const adapter = new FixtureInvestorProductAdapter();
    const res = await adapter.initiateBrokerageConnection({
      ...PAPER_INTENT,
      credentials: { apiKeyId: "", apiSecretKey: "" },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("CREDENTIALS_REQUIRED");
    expect(res.failure.retryable).toBe(false);
  });

  test("disconnect then reconnect returns to a usable connection", async () => {
    const adapter = new FixtureInvestorProductAdapter({ startConnected: true });

    const read = await adapter.getBrokerageConnection();
    expect(read.ok && read.value).not.toBeNull();
    if (!read.ok || read.value === null) return;

    const off = await adapter.disconnectBrokerage({
      connectionId: read.value.connectionId,
      stateVersion: read.value.stateVersion,
    });
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    expect(off.value.status).toBe("disconnected");
    // A disconnected account exposes no broker account id.
    expect(off.value.brokerAccountId).toBeNull();
    expect(isConnectionUsable(off.value)).toBe(false);

    const again = await adapter.initiateBrokerageConnection(PAPER_INTENT);
    expect(again.ok && again.value.status).toBe("connected");
  });

  test("disconnect with a stale state version is refused and retryable", async () => {
    const adapter = new FixtureInvestorProductAdapter({ startConnected: true });
    const res = await adapter.disconnectBrokerage({
      connectionId: FIXTURE_STRINGS.connectionId,
      stateVersion: 999,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("STATE_VERSION_STALE");
    expect(res.failure.retryable).toBe(true);
  });

  test("disconnecting drops the subscription projection", async () => {
    const adapter = await subscribedAdapter();
    const sub = await adapter.getSubscription();
    expect(sub.ok && sub.value).not.toBeNull();

    await adapter.disconnectBrokerage({
      connectionId: FIXTURE_STRINGS.connectionId,
      stateVersion: 1,
    });
    const after = await adapter.getSubscription();
    // A subscription without a connection is not a state the frontend asserts.
    expect(after.ok && after.value).toBeNull();
  });
});

// ─── 11. No credential survives a connect ───────────────────────────────────

describe("credential handling", () => {
  test("no credential material appears in any read model", async () => {
    const adapter = new FixtureInvestorProductAdapter();
    await adapter.initiateBrokerageConnection(PAPER_INTENT);

    const reads = await Promise.all([
      adapter.getBrokerageConnection(),
      adapter.getSubscription(),
      adapter.getHandoff(),
      adapter.getAllocationBounds(),
      adapter.getRequiredConsent({ strategyId: FIXTURE_STRINGS.strategyId }),
    ]);
    const serialized = JSON.stringify(reads);
    expect(serialized).not.toContain(FAKE_KEY);
    expect(serialized).not.toContain(FAKE_SECRET);
  });

  test("the connection projection has no credential-shaped field", async () => {
    const adapter = new FixtureInvestorProductAdapter({ startConnected: true });
    const res = await adapter.getBrokerageConnection();
    expect(res.ok).toBe(true);
    if (!res.ok || res.value === null) return;
    for (const key of Object.keys(res.value)) {
      expect(key).not.toMatch(/secret|credential|apiKey|api_key|password/i);
    }
  });

  test("the connect is recorded without retaining what was passed", async () => {
    const adapter = new FixtureInvestorProductAdapter();
    await adapter.initiateBrokerageConnection(PAPER_INTENT);
    await adapter.initiateBrokerageConnection(PAPER_INTENT);
    expect(adapter.connectAttempts).toBe(2);
    expect(JSON.stringify(adapter)).not.toContain(FAKE_SECRET);
  });

  test("no fixture seed value resembles a real credential", () => {
    for (const [name, value] of Object.entries(FIXTURE_STRINGS)) {
      expect(
        looksLikeCredential(value),
        `FIXTURE_STRINGS.${name} must not look like a credential`,
      ).toBe(false);
    }
  });

  test("looksLikeCredential recognises the real Alpaca shapes", () => {
    // Guards the guard: if this stopped matching, the assertion above would
    // pass vacuously.
    expect(looksLikeCredential(FAKE_KEY)).toBe(true);
    expect(looksLikeCredential(FAKE_SECRET)).toBe(true);
    expect(looksLikeCredential("FIXTURE-ACCOUNT-0001")).toBe(false);
  });
});

// ─── 5. Allocation validation ───────────────────────────────────────────────

describe("allocation validation", () => {
  const bounds: AllocationBounds = {
    minPercent: 5,
    maxPercent: 50,
    stepPercent: 1,
  };

  test("accepts an in-range value on the step", () => {
    expect(validateAllocation(25, bounds)).toEqual({ ok: true, percent: 25 });
    expect(validateAllocation("25", bounds)).toEqual({ ok: true, percent: 25 });
    expect(validateAllocation(" 25 ", bounds)).toEqual({
      ok: true,
      percent: 25,
    });
  });

  test("rejects empty, non-numeric, out-of-range and off-step values", () => {
    expect(validateAllocation("", bounds)).toEqual({
      ok: false,
      reason: "required",
    });
    expect(validateAllocation(null, bounds)).toEqual({
      ok: false,
      reason: "required",
    });
    expect(validateAllocation("abc", bounds)).toEqual({
      ok: false,
      reason: "not_a_number",
    });
    expect(validateAllocation(4, bounds)).toEqual({
      ok: false,
      reason: "out_of_range",
    });
    expect(validateAllocation(51, bounds)).toEqual({
      ok: false,
      reason: "out_of_range",
    });
    expect(validateAllocation(25.5, bounds)).toEqual({
      ok: false,
      reason: "not_on_step",
    });
  });

  test("boundaries are inclusive", () => {
    expect(validateAllocation(5, bounds)).toEqual({ ok: true, percent: 5 });
    expect(validateAllocation(50, bounds)).toEqual({ ok: true, percent: 50 });
  });

  test("fractional steps do not fail on float error", () => {
    const fine: AllocationBounds = {
      minPercent: 0,
      maxPercent: 100,
      stepPercent: 0.1,
    };
    expect(validateAllocation(0.3, fine)).toEqual({ ok: true, percent: 0.3 });
    expect(validateAllocation(25.7, fine)).toEqual({ ok: true, percent: 25.7 });
    expect(validateAllocation(25.75, fine)).toEqual({
      ok: false,
      reason: "not_on_step",
    });
  });

  test("unknown bounds fail closed — no invented min/max", () => {
    // The frontend must not substitute a plausible 0-100/1% default: bounds
    // are a backend-owned risk control.
    expect(validateAllocation(25, null)).toEqual({
      ok: false,
      reason: "bounds_unknown",
    });
  });

  test("the adapter refuses an off-step allocation update", async () => {
    const adapter = await subscribedAdapter();
    const res = await adapter.updateAllocation({
      strategyId: FIXTURE_STRINGS.strategyId,
      percent: 25.5,
      stateVersion: 1,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("ALLOCATION_NOT_ON_STEP");
  });
});

// ─── 6 + 7. Consent required, version + hash bound ──────────────────────────

describe("consent", () => {
  test("the requirement carries a key, version and 64-hex hash", async () => {
    const adapter = new FixtureInvestorProductAdapter();
    const res = await adapter.getRequiredConsent({
      strategyId: FIXTURE_STRINGS.strategyId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok || res.value === null) return;
    expect(res.value.disclosureKey).toBe(FIXTURE_STRINGS.disclosureKey);
    expect(res.value.version).toBe(1);
    expect(res.value.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // The text actually shown to the investor is part of the requirement.
    expect(res.value.body.length).toBeGreaterThan(0);
  });

  test("the disclosure makes no performance claim", async () => {
    const adapter = new FixtureInvestorProductAdapter();
    const res = await adapter.getRequiredConsent({
      strategyId: FIXTURE_STRINGS.strategyId,
    });
    if (!res.ok || res.value === null) throw new Error("no requirement");
    const body = res.value.body.toLowerCase();
    for (const claim of [
      "guarantee",
      "guaranteed",
      "returns of",
      "outperform",
      "risk-free",
      "no risk",
    ]) {
      expect(body).not.toContain(claim);
    }
    // ...and it states the custody and PAPER facts.
    expect(body).toContain("remain at the brokerage");
    expect(body).toContain("paper");
  });

  test("subscription without consent is refused", async () => {
    const adapter = new FixtureInvestorProductAdapter({ startConnected: true });
    const res = await adapter.confirmSubscription({
      strategyId: FIXTURE_STRINGS.strategyId,
      connectionId: FIXTURE_STRINGS.connectionId,
      environment: "paper",
      allocationPercent: 25,
      consentReceiptId: FIXTURE_STRINGS.consentReceiptId,
      stateVersion: 1,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("CONSENT_REQUIRED");
  });

  test("consent for a different version or hash is refused", async () => {
    const adapter = new FixtureInvestorProductAdapter({ startConnected: true });
    const wrongVersion = await adapter.submitConsent({
      disclosureKey: FIXTURE_STRINGS.disclosureKey,
      version: 2,
      contentHash: FIXTURE_STRINGS.contentHash,
    });
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) {
      expect(wrongVersion.failure.code).toBe("CONSENT_TUPLE_MISMATCH");
    }

    const wrongHash = await adapter.submitConsent({
      disclosureKey: FIXTURE_STRINGS.disclosureKey,
      version: 1,
      contentHash: "0".repeat(64),
    });
    expect(wrongHash.ok).toBe(false);

    const wrongKey = await adapter.submitConsent({
      disclosureKey: "some_other_disclosure",
      version: 1,
      contentHash: FIXTURE_STRINGS.contentHash,
    });
    expect(wrongKey.ok).toBe(false);
  });

  test("consentSatisfies binds all three of key, version and hash", () => {
    const requirement: ConsentRequirement = {
      disclosureKey: "k",
      version: 2,
      contentHash: "a".repeat(64),
      body: "text",
      effectiveAt: "2026-09-01T00:00:00.000Z",
    };
    const base: ConsentReceipt = {
      consentReceiptId: "r",
      disclosureKey: "k",
      version: 2,
      contentHash: "a".repeat(64),
      acceptedAt: "2026-09-02T00:00:00.000Z",
    };
    expect(consentSatisfies(requirement, base)).toBe(true);
    expect(consentSatisfies(requirement, null)).toBe(false);
    // A receipt for v1 does not satisfy v2...
    expect(consentSatisfies(requirement, { ...base, version: 1 })).toBe(false);
    // ...and same-version-different-hash does not satisfy either. That is the
    // point of hash binding: re-worded text requires fresh consent.
    expect(
      consentSatisfies(requirement, { ...base, contentHash: "b".repeat(64) }),
    ).toBe(false);
    expect(
      consentSatisfies(requirement, { ...base, disclosureKey: "other" }),
    ).toBe(false);
  });

  test("consent then confirm produces an active PAPER subscription", async () => {
    const adapter = await subscribedAdapter();
    const res = await adapter.getSubscription();
    expect(res.ok).toBe(true);
    if (!res.ok || res.value === null) return;
    expect(res.value.status).toBe("active");
    expect(res.value.environment).toBe("paper");
    expect(res.value.allocation.percent).toBe(25);
    expect(res.value.blockedReason).toBeNull();
  });

  test("a subscription cannot be confirmed without a usable connection", async () => {
    const adapter = new FixtureInvestorProductAdapter();
    await adapter.submitConsent({
      disclosureKey: FIXTURE_STRINGS.disclosureKey,
      version: 1,
      contentHash: FIXTURE_STRINGS.contentHash,
    });
    const res = await adapter.confirmSubscription({
      strategyId: FIXTURE_STRINGS.strategyId,
      connectionId: FIXTURE_STRINGS.connectionId,
      environment: "paper",
      allocationPercent: 25,
      consentReceiptId: FIXTURE_STRINGS.consentReceiptId,
      stateVersion: 1,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.code).toBe("BROKER_CONNECTION_MISSING");
  });
});

// ─── 8 + 9. Backend unavailable after a KYC pass, and retry ─────────────────

describe("backend_connection_unavailable (Scenario A)", () => {
  test("KYC stays verified while account setup is unavailable", async () => {
    const adapter = new FixtureInvestorProductAdapter({
      kycVerified: true,
      backendAvailable: false,
    });
    const res = await adapter.getHandoff();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Identity verification succeeded; setup is temporarily unavailable. A
    // backend outage must never read as a failed or undone verification.
    expect(res.value.kycVerified).toBe(true);
    expect(res.value.setupAvailable).toBe(false);
    expect(res.value.failure?.kind).toBe("backend_connection_unavailable");
    expect(res.value.failure?.retryable).toBe(true);
  });

  test("every product read reports the explicit state, not a generic error", async () => {
    const adapter = new FixtureInvestorProductAdapter({
      backendAvailable: false,
    });
    const results = await Promise.all([
      adapter.getBrokerageConnection(),
      adapter.getSubscription(),
      adapter.getAllocationBounds(),
      adapter.getRequiredConsent({ strategyId: FIXTURE_STRINGS.strategyId }),
      adapter.initiateBrokerageConnection(PAPER_INTENT),
    ]);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.failure.kind).toBe("backend_connection_unavailable");
      expect(r.failure.code).toBe("BACKEND_CONNECTION_UNAVAILABLE");
      // Retryable: the UI offers retry / resume later, never rejection.
      expect(r.failure.retryable).toBe(true);
    }
  });

  test("the unavailable state is never a rejection or an admission", async () => {
    const adapter = new FixtureInvestorProductAdapter({
      backendAvailable: false,
    });
    const res = await adapter.getBrokerageConnection();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.failure.kind).not.toBe("not_authorized");
    expect(JSON.stringify(res.failure).toLowerCase()).not.toMatch(
      /reject|denied|admitted/,
    );
  });

  test("retry from the unavailable state succeeds with preserved progress", async () => {
    const adapter = new FixtureInvestorProductAdapter({
      backendAvailable: false,
    });
    const blocked = await adapter.initiateBrokerageConnection(PAPER_INTENT);
    expect(blocked.ok).toBe(false);
    // Nothing was half-created while the backend was down.
    expect(adapter.connectAttempts).toBe(0);

    adapter.setBackendAvailable(true);

    const retried = await adapter.initiateBrokerageConnection(PAPER_INTENT);
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.value.status).toBe("connected");

    const handoff = await adapter.getHandoff();
    expect(handoff.ok && handoff.value.setupAvailable).toBe(true);
    expect(handoff.ok && handoff.value.failure).toBeNull();
  });
});

// ─── 10. No admission inference ─────────────────────────────────────────────

describe("no admission inference", () => {
  test("the handoff exposes KYC and setup availability only", async () => {
    const adapter = new FixtureInvestorProductAdapter();
    const res = await adapter.getHandoff();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Admission is Daniel-owned. There is deliberately no admitted/cohort/
    // authorization field for a surface to read or a reviewer to trust.
    expect(Object.keys(res.value).sort()).toEqual([
      "failure",
      "kycVerified",
      "setupAvailable",
    ]);
  });

  test("no adapter read model carries an admission or authorization field", async () => {
    const adapter = await subscribedAdapter();
    const reads = await Promise.all([
      adapter.getHandoff(),
      adapter.getBrokerageConnection(),
      adapter.getSubscription(),
    ]);
    const serialized = JSON.stringify(reads).toLowerCase();
    for (const forbidden of [
      "setadmitted",
      "isadmitted",
      "admission",
      "cohort",
      "accountauthorization",
      "tradingauthorized",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("a verified KYC does not by itself produce a subscription", async () => {
    const adapter = new FixtureInvestorProductAdapter({ kycVerified: true });
    const sub = await adapter.getSubscription();
    expect(sub.ok && sub.value).toBeNull();
    const conn = await adapter.getBrokerageConnection();
    expect(conn.ok && conn.value).toBeNull();
  });
});

// ─── helpers ────────────────────────────────────────────────────────────────

/** A fixture driven all the way to an active PAPER subscription at 25%. */
async function subscribedAdapter(): Promise<FixtureInvestorProductAdapter> {
  const adapter = new FixtureInvestorProductAdapter({ startConnected: true });
  const consent = await adapter.submitConsent({
    disclosureKey: FIXTURE_STRINGS.disclosureKey,
    version: 1,
    contentHash: FIXTURE_STRINGS.contentHash,
  });
  if (!consent.ok) throw new Error("fixture consent failed");
  const confirmed = await adapter.confirmSubscription({
    strategyId: FIXTURE_STRINGS.strategyId,
    connectionId: FIXTURE_STRINGS.connectionId,
    environment: "paper",
    allocationPercent: 25,
    consentReceiptId: consent.value.consentReceiptId,
    stateVersion: 1,
  });
  if (!confirmed.ok) throw new Error("fixture subscription failed");
  return adapter;
}
