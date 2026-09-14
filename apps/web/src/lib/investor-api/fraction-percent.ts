/** Contract pattern for `allocation_percent`: a decimal fraction in (0, 1]. */
const ALLOCATION_PERCENT_PATTERN = /^(?:0\.(?:0*[1-9][0-9]*)|1(?:\.0+)?)$/;

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

/**
 * Exact base-10 conversion of a percentage-point decimal string to the
 * canonical fraction the contract requires (`"25"` → `"0.25"`).
 *
 * Founder decision (F-H2 follow-up, 2026-09-14): the investor-facing control
 * stays a percentage, so this crossing is permanent and must be exact. The
 * input is a STRING deliberately — a `number` has already lost the investor's
 * literal digits to a binary double before any converter could run.
 *
 * The result is asserted against the contract's own `allocation_percent`
 * pattern before it can leave, so an out-of-range or non-canonical value
 * throws here rather than being refused later at the request boundary.
 */
export function percentToFraction(value: string): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value))
    throw new Error("Invalid decimal percentage");
  const [whole = "0", fraction = ""] = value.split(".");
  // Move the decimal point two places LEFT by slicing, never by dividing.
  const padded = whole.padStart(3, "0");
  const cut = padded.length - 2;
  const integer = padded.slice(0, cut).replace(/^0+(?=\d)/, "");
  const digits = (padded.slice(cut) + fraction).replace(/0+$/, "");
  const result = digits ? `${integer}.${digits}` : integer;
  if (!ALLOCATION_PERCENT_PATTERN.test(result))
    throw new Error(
      "Percentage is outside the contract's allocation range (0, 100]",
    );
  return result;
}
