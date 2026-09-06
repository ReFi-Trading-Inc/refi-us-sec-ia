// Tests for the frontend-only compatibility layer. These pin the *shape* of
// types and string-union shims so a downstream OpenAPI realignment (or an
// accidental shim deletion) surfaces here before it breaks UI builds.

import { describe, expect, expectTypeOf, test } from "vitest";
import type { OrderPreviewResult } from "../compat";

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
