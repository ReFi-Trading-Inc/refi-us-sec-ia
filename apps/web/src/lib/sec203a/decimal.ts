/**
 * Decimal string brand type.
 *
 * Every monetary, quantity, weight, price, threshold, allocation, and
 * percentage value crossing the BFF surface must be a `DecimalString` —
 * a stringified decimal number with no IEEE 754 round-tripping.
 *
 * Why: docs/current-gaps-register.md G-104, and the SEC posture that
 * advisory records must preserve backend precision. JavaScript `number`
 * silently loses precision for many financial values; banning it at the
 * type boundary is the cheapest enforcement.
 */

export type DecimalString = string & { readonly __brand: "DecimalString" };

const DECIMAL_RE = /^-?(\d+)(\.\d+)?$/;

export function isDecimalString(value: unknown): value is DecimalString {
  return typeof value === "string" && DECIMAL_RE.test(value);
}

/** Parse and brand. Throws on invalid input. */
export function asDecimalString(value: string): DecimalString {
  if (!DECIMAL_RE.test(value)) {
    throw new Error(`Not a decimal string: ${value}`);
  }
  return value as DecimalString;
}

/**
 * Zod refinement helper. Use as `z.string().refine(isDecimalString, ...)`
 * in route schemas so bad inputs fail at the BFF boundary, not in UI.
 */
export const decimalStringRefiner = (value: string): boolean =>
  DECIMAL_RE.test(value);

export const decimalStringMessage = (field: string) =>
  `${field} must be a decimal string (e.g. "0.05", "100.50", "-3.14"). ` +
  `JS number is not accepted — precision must be preserved through the BFF.`;
