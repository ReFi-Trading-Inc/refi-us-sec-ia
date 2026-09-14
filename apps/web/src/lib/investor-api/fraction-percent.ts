/**
 * Exact base-10 conversion of a canonical decimal FRACTION string (alpha.4
 * `turnover`, `allocation_percent`, …) to percentage points for DISPLAY only.
 * Never floating point, never used for an allocation decision. Malformed or
 * non-canonical input throws rather than guessing units.
 */
export function fractionToPercent(value: string): string {
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value))
    throw new Error("Invalid decimal fraction");
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace(/^-/, "").split(".");
  const digits = fraction.padEnd(2, "0");
  const integer = (whole + digits.slice(0, 2)).replace(/^0+(?=\d)/, "");
  const remainder = digits.slice(2).replace(/0+$/, "");
  const result = integer + (remainder ? `.${remainder}` : "");
  return negative && result !== "0" ? `-${result}` : result;
}
