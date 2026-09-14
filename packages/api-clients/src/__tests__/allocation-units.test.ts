/**
 * Allocation unit conversion (founder F-H2 follow-up, 2026-09-14).
 *
 * Decision: the investor-facing control stays a PERCENTAGE, and the canonical
 * value sent to the backend is a decimal FRACTION string in (0, 1]. That makes
 * the points↔fraction crossing permanent, so it must be exact base-10 string
 * arithmetic — never `/100`, never `toFixed`, never a binary double.
 *
 * The hazard these tests exist for: `12.5` points → `"0.125"` is a LEGAL
 * fraction, so a mis-rounding conversion inside the contract's valid window
 * would be accepted as a real allocation. The request-boundary pattern catches
 * gross unit errors; only exactness catches arithmetic ones.
 */
import { describe, expect, it } from "vitest";
import {
  fractionToPercent,
  percentToFraction,
} from "../../../../apps/web/src/lib/investor-api/fraction-percent";

/** The contract's own `allocation_percent` pattern: a fraction in (0, 1]. */
const ALLOCATION_PERCENT_PATTERN = /^(?:0\.(?:0*[1-9][0-9]*)|1(?:\.0+)?)$/;

describe("percentToFraction is exact base-10", () => {
  it.each([
    ["25", "0.25"],
    ["5", "0.05"],
    ["1", "0.01"],
    ["100", "1"],
    ["12.5", "0.125"],
    ["0.5", "0.005"],
    ["99.9", "0.999"],
    ["33.333333333333333", "0.33333333333333333"],
    // Beyond double precision: a float conversion loses these digits.
    ["0.0000000000000001", "0.000000000000000001"],
  ])("%s%% → %s", (percent, fraction) => {
    expect(percentToFraction(percent)).toBe(fraction);
  });

  it("every result satisfies the contract pattern the BFF enforces", () => {
    for (const p of ["25", "5", "100", "12.5", "0.5", "99.9", "0.01"]) {
      expect(percentToFraction(p)).toMatch(ALLOCATION_PERCENT_PATTERN);
    }
  });

  // Verified by exhaustive search over one-decimal percentages in (0, 100]:
  // 261 of them convert wrongly under `Number(p) / 100`. Each wrong value
  // below STILL satisfies the contract pattern, so the request boundary would
  // accept it as a real allocation — exactness is the only thing that catches
  // this class of error.
  it.each([
    ["0.7", "0.007", "0.006999999999999999"],
    ["0.9", "0.009", "0.009000000000000001"],
    ["1.1", "0.011", "0.011000000000000001"],
    ["1.4", "0.014", "0.013999999999999999"],
    ["1.8", "0.018", "0.018000000000000002"],
  ])(
    "%s%% converts to %s, not the float result %s",
    (percent, exact, float) => {
      expect(percentToFraction(percent)).toBe(exact);
      expect(String(Number(percent) / 100)).toBe(float);
      expect(percentToFraction(percent)).not.toBe(float);
      // The corrupted value would have passed the request boundary.
      expect(float).toMatch(ALLOCATION_PERCENT_PATTERN);
    },
  );
});

describe("percentToFraction refuses rather than guessing", () => {
  it.each([
    ["0", "zero is unrepresentable — stopping is leave_template, not 0%"],
    ["0.0", "same, in another spelling"],
    ["100.1", "above the contract ceiling of 1"],
    ["101", "above the contract ceiling of 1"],
    ["1e2", "exponent notation is not a canonical decimal"],
    [".5", "no leading digit"],
    ["0.", "no trailing digit"],
    ["", "empty"],
    ["abc", "not a number"],
    ["-5", "negative allocation"],
    ["25%", "a rendered value, not a decimal"],
    [" 25", "untrimmed"],
  ])("throws on %s (%s)", (input) => {
    expect(() => percentToFraction(input)).toThrow();
  });
});

describe("the two converters are exact inverses", () => {
  const canonical = [
    "0.25",
    "0.05",
    "0.01",
    "1",
    "0.125",
    "0.005",
    "0.999",
    "0.1",
    "0.9999999",
    "0.33333333333333333",
    "0.000000000000000001",
  ];

  it.each(canonical)("round trip %s → percent → fraction", (fraction) => {
    expect(percentToFraction(fractionToPercent(fraction))).toBe(fraction);
  });

  it.each(["25", "5", "100", "12.5", "0.5", "99.9", "0.01"])(
    "round trip %s%% → fraction → percent",
    (percent) => {
      expect(fractionToPercent(percentToFraction(percent))).toBe(percent);
    },
  );
});
