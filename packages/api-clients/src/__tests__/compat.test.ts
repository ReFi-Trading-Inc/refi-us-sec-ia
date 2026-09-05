// Tests for the frontend-only compatibility layer. These pin the *shape* of
// types and string-union shims so a downstream OpenAPI realignment (or an
// accidental shim deletion) surfaces here before it breaks UI builds.

import { describe, expect, expectTypeOf, test } from "vitest";
import type {
  AccountActivationStatus,
  AuthSession,
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
