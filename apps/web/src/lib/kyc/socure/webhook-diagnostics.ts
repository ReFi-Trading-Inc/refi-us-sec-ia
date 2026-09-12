/**
 * Values-free description of a webhook payload the envelope schema rejected.
 *
 * Emits only structure: key names, value kinds (never contents), string
 * lengths, and zod issue paths/codes. Returned in the 400 body to the
 * credential-validated sender only (the RiskOS dashboard shows the response
 * of its test delivery), so a rejected delivery can be diagnosed without
 * logging anything and without ever echoing PII, tokens or decisions.
 */
import type { ZodError } from "zod";

type Shape = Record<string, string>;

function kindOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array(${String(v.length)})`;
  if (typeof v === "string") return `string(${String(v.length)})`;
  if (typeof v === "object") return "object";
  return typeof v;
}

export function describeWebhookShape(payload: unknown, depth = 2): Shape {
  const out: Shape = {};
  const walk = (v: unknown, prefix: string, d: number): void => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return;
    for (const [k, val] of Object.entries(v).slice(0, 40)) {
      const key = prefix ? `${prefix}.${k}` : k;
      out[key] = kindOf(val);
      if (d > 1) walk(val, key, d - 1);
    }
  };
  walk(payload, "", depth);
  return out;
}

export function describeWebhookRejection(
  payload: unknown,
  error: ZodError,
  correlationId: string,
): Record<string, unknown> {
  return {
    msg: "socure webhook envelope rejected",
    correlationId,
    shape: describeWebhookShape(payload),
    issues: error.issues.slice(0, 20).map((i) => ({
      path: i.path.map(String).join("."),
      code: i.code,
    })),
  };
}
