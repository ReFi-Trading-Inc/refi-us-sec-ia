// Tests for the frontend-only compatibility layer. These pin the *shape* of
// types and string-union shims so a downstream OpenAPI realignment (or an
// accidental shim deletion) surfaces here before it breaks UI builds.

import { describe, expect, expectTypeOf, test } from "vitest";
import { isKycTerminal } from "../hooks/kyc";
import type {
  AccountActivationStatus,
  AdvisoryProfile,
  AuthSession,
  KycStatusValue,
  OrderPreviewResult,
} from "../compat";

describe("AuthSession shape", () => {
  test("includes the OpenAPI-defined required fields and the expires_in_seconds extension", () => {
    const s: AuthSession = {
      status: "authenticated",
      expires_in_seconds: 3600,
    };
    expectTypeOf(s.status).toEqualTypeOf<"authenticated" | "unauthenticated">();
    expectTypeOf(s.expires_in_seconds).toEqualTypeOf<number | undefined>();
    expect(s.status).toBe("authenticated");
  });

  test("status must be one of the two backend enum values", () => {
    const ok: AuthSession["status"] = "unauthenticated";
    expect(ok).toBe("unauthenticated");
    // @ts-expect-error — "pending" is not a valid AuthSession.status
    const bad: AuthSession["status"] = "pending";
    void bad;
  });
});

describe("KycStatusValue", () => {
  const all: KycStatusValue[] = [
    "not_started",
    "pending",
    "incomplete",
    "under_review",
    "approved",
    "denied",
  ];

  test("includes the frontend-only not_started sentinel", () => {
    expect(all).toContain("not_started");
  });

  test("isKycTerminal recognizes approved, denied, under_review as terminal", () => {
    expect(isKycTerminal("approved")).toBe(true);
    expect(isKycTerminal("denied")).toBe(true);
    expect(isKycTerminal("under_review")).toBe(true);
  });

  test("isKycTerminal returns false for non-terminal and for not_started", () => {
    expect(isKycTerminal("not_started")).toBe(false);
    expect(isKycTerminal("pending")).toBe(false);
    expect(isKycTerminal("incomplete")).toBe(false);
  });
});

describe("AccountActivationStatus", () => {
  test("has exactly the six boolean gating flags", () => {
    const v: AccountActivationStatus = {
      eligibility: false,
      wallet: false,
      kyc: false,
      profile: false,
      broker: false,
      disclosures: false,
    };
    const keys = Object.keys(v).sort();
    expect(keys).toEqual(
      [
        "broker",
        "disclosures",
        "eligibility",
        "kyc",
        "profile",
        "wallet",
      ].sort(),
    );
    expectTypeOf(v.eligibility).toEqualTypeOf<boolean>();
  });
});

describe("OrderPreviewResult", () => {
  test("includes the latency_ms shim extension", () => {
    const r: OrderPreviewResult = {
      status: "ALLOW",
      reasons: [],
      source: "fresh",
      latency_ms: 42,
    };
    expectTypeOf(r.latency_ms).toEqualTypeOf<number | undefined>();
    expect(r.latency_ms).toBe(42);
  });

  // Binary by construction — a REVIEW status would re-introduce the
  // REVIEW/DENY partition Daniel's contract forbids, and would imply a
  // frontend escalation that can clear a backend hard stop.
  test("status is exactly ALLOW | DENY", () => {
    const allow: OrderPreviewResult["status"] = "ALLOW";
    const deny: OrderPreviewResult["status"] = "DENY";
    expectTypeOf<OrderPreviewResult["status"]>().toEqualTypeOf<
      "ALLOW" | "DENY"
    >();
    expect([allow, deny]).toEqual(["ALLOW", "DENY"]);
  });
});

describe("AdvisoryProfile shape", () => {
  test("has exactly the seven camelCase string fields the onboarding form binds to", () => {
    const p: AdvisoryProfile = {
      goal: "growth",
      timeHorizon: "5-10y",
      incomeBand: "100-250k",
      liquidNetWorth: "250-500k",
      riskTolerance: "moderate",
      investmentExperience: "some",
      accountPurpose: "retirement",
    };
    const keys = Object.keys(p).sort();
    expect(keys).toEqual(
      [
        "accountPurpose",
        "goal",
        "incomeBand",
        "investmentExperience",
        "liquidNetWorth",
        "riskTolerance",
        "timeHorizon",
      ].sort(),
    );
    expectTypeOf(p.goal).toEqualTypeOf<string>();
  });
});
