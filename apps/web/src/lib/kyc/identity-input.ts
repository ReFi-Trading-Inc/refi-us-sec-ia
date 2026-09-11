/**
 * Provider-neutral identity input — what ReFi's own onboarding form collects
 * for identity verification (mandate §8, §9). This is the ONLY shape the
 * browser may send; it is strict (unknown keys refused) so a client can
 * never smuggle provider controls (API key, workflow, base URL, environment)
 * into a server-side evaluation.
 *
 * PII handling: values are validated and normalised in memory, handed to the
 * configured adapter once, and discarded. Nothing here persists, logs or
 * echoes a field. `maskIdentityInput` exists for the rare diagnostic that
 * must mention a field at all — it never reveals more than shape.
 */
import { z } from "zod";

export const US_STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "PR",
  "GU",
  "VI",
  "AS",
  "MP",
] as const;

const name = z.string().trim().min(1).max(240);

export const identityInputSchema = z
  .object({
    /** Browser-generated per-submission idempotency key (uuid). */
    submissionKey: z.uuid(),
    /** Device-intelligence session token from the provider's browser SDK. Opaque. */
    diSessionToken: z.string().trim().min(1).max(4096),
    givenName: name,
    familyName: name,
    /** YYYY-MM-DD; must be a real calendar date and imply age ≥ 18. */
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)),
        "invalid date",
      )
      .refine((v) => {
        const dob = new Date(`${v}T00:00:00Z`);
        const cutoff = new Date();
        cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18);
        return dob <= cutoff;
      }, "must be at least 18"),
    email: z.email().max(320).optional(),
    /** Digits with optional leading +; normalised to E.164 (US default). */
    phoneNumber: z
      .string()
      .trim()
      .regex(/^\+?[0-9()\-\s.]{7,20}$/)
      .optional(),
    /** US SSN: 9 digits, separators tolerated; normalised to digits only. */
    nationalId: z
      .string()
      .trim()
      .regex(/^\d{3}-?\d{2}-?\d{4}$/)
      .optional(),
    address: z
      .object({
        line1: z.string().trim().min(1).max(200),
        line2: z.string().trim().max(200).optional(),
        locality: z.string().trim().min(1).max(100),
        region: z.enum(US_STATE_CODES),
        postalCode: z
          .string()
          .trim()
          .regex(/^\d{5}(-\d{4})?$/),
        country: z.literal("US"),
      })
      .strict(),
    /** The investor's explicit consent to identity verification (recorded by ReFi). */
    consentToVerification: z.literal(true),
  })
  .strict();

export type IdentityInput = z.infer<typeof identityInputSchema>;

/** Keys a client might try to send to steer the server; refused by the strict schema and asserted. */
export const FORBIDDEN_CLIENT_CONTROL_KEYS = [
  "apiKey",
  "api_key",
  "workflow",
  "workflowName",
  "baseUrl",
  "base_url",
  "environment",
  "provider",
  "decision",
  "evalId",
  "eval_id",
  "sdkKey",
  "webhookSecret",
] as const;

export function normalizePhoneE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `+${digits.slice(1).replace(/\D/g, "")}`;
  const d = digits.replace(/\D/g, "");
  return d.length === 10 ? `+1${d}` : `+${d}`;
}

export function normalizeNationalId(raw: string): string {
  return raw.replace(/\D/g, "");
}

export interface NormalizedIdentityInput extends Omit<
  IdentityInput,
  "phoneNumber" | "nationalId"
> {
  phoneNumber?: string;
  nationalId?: string;
}

export function normalizeIdentityInput(
  input: IdentityInput,
): NormalizedIdentityInput {
  const out: NormalizedIdentityInput = { ...input };
  if (input.phoneNumber)
    out.phoneNumber = normalizePhoneE164(input.phoneNumber);
  if (input.nationalId) out.nationalId = normalizeNationalId(input.nationalId);
  return out;
}

/** Shape-only view for diagnostics: which fields were present. Never values. */
export function maskIdentityInput(
  input: IdentityInput,
): Record<string, "present" | "absent"> {
  const keys: Array<keyof IdentityInput> = [
    "givenName",
    "familyName",
    "dateOfBirth",
    "email",
    "phoneNumber",
    "nationalId",
    "address",
  ];
  const out: Record<string, "present" | "absent"> = {};
  for (const k of keys) out[k] = input[k] === undefined ? "absent" : "present";
  return out;
}

// ─── Neutral evaluation outcome (what the route returns to the browser) ─────

export const KYC_EVALUATION_RESULT_KINDS = [
  /** Adapter answered; see `state`. */
  "evaluated",
  /** A submission with this key (or an open evaluation) already exists; state returned. */
  "reused",
  /** The journey is already terminal (`passed`). */
  "already_terminal",
  /** Provider operational failure; retryable per `retryable`; never a rejection. */
  "provider_error",
  /** The configured adapter does not evaluate identity in-app (mock / unconfigured). */
  "not_evaluating",
] as const;
export type KycEvaluationResultKind =
  (typeof KYC_EVALUATION_RESULT_KINDS)[number];
