/**
 * Socure RiskOS™ wire schemas — the ONLY place raw provider JSON is parsed.
 *
 * Source of truth: the founder-provided Socure Integration Guide
 * (`docs/integrations/socure/IntegrationGuide.md`): Evaluation API
 * `POST /api/evaluation` (decision ACCEPT | REJECT | REVIEW, `eval_id`,
 * `status` / `eval_status`, `data_enrichments[n].response.data.docvTransactionToken`)
 * and the `evaluation_completed` webhook (`data.id`, `data.eval_id`,
 * `data.eval_status`, `data.decision`).
 *
 * Rules: validate before consuming; unknown provider fields are tolerated at
 * the raw boundary (passthrough) but NEVER copied into ReFi records; nothing
 * here is imported outside `lib/kyc/socure/`. No PII type leaves this
 * directory except the request builder input, which is discarded after the
 * call.
 */
import { z } from "zod";

// ─── Request ────────────────────────────────────────────────────────────────

/** Guide: required given_name, family_name, address.country; plus ≥1 of DOB / phone / address detail. */
export const socureIndividualSchema = z
  .object({
    di_session_token: z.string().min(1).max(4096),
    additional_context: z
      .object({
        user_consent: z.literal(true),
        consent_timestamp: z.iso.datetime(),
      })
      .strict()
      .optional(),
    given_name: z.string().min(1).max(240),
    family_name: z.string().min(1).max(240),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
      .optional(),
    email: z.email().max(320).optional(),
    /** E.164 (spec: expects +12025550147; tolerates hyphens — we normalise before submit). */
    phone_number: z
      .string()
      .regex(/^\+[1-9][0-9]{6,14}$/)
      .optional(),
    national_id: z
      .string()
      .regex(/^[0-9]{9}$/, "9 digits, no separators")
      .optional(),
    address: z
      .object({
        line_1: z.string().min(1).max(200).optional(),
        line_2: z.string().max(200).optional(),
        locality: z.string().max(100).optional(),
        minor_admin_division: z.string().max(100).optional(),
        major_admin_division: z.string().max(100).optional(),
        postal_code: z.string().max(20).optional(),
        country: z.literal("US"),
      })
      .strict(),
  })
  .strict()
  .refine(
    (v) =>
      v.date_of_birth !== undefined ||
      v.phone_number !== undefined ||
      v.address.line_1 !== undefined,
    {
      message:
        "at least one of date_of_birth, phone_number or address.line_1 is required",
    },
  );
export type SocureIndividual = z.infer<typeof socureIndividualSchema>;

/** Spec `AdditionalContext`: consent is required for processing; we send only these two fields. */
export const socureAdditionalContextSchema = z
  .object({
    user_consent: z.literal(true),
    consent_timestamp: z.iso.datetime(),
  })
  .strict();

/**
 * Spec top level: `workflow`, `id` (customer-defined, unique per evaluation —
 * ReFi sends an opaque request id, never a user id or email), `timestamp`
 * (RFC 3339), `data.individual`. `customer_metadata` is never sent.
 */
export const socureEvaluationRequestSchema = z
  .object({
    workflow: z.string().min(1).max(200),
    id: z.string().regex(/^refi-kyc-req-[0-9a-f-]{36}$/),
    timestamp: z.iso.datetime(),
    data: z
      .object({
        individual: socureIndividualSchema.and(
          z.object({ additional_context: socureAdditionalContextSchema }),
        ),
      })
      .strict(),
  })
  .strict();
export type SocureEvaluationRequest = z.infer<
  typeof socureEvaluationRequestSchema
>;

// ─── Response ───────────────────────────────────────────────────────────────

export const SOCURE_DECISIONS = ["ACCEPT", "REJECT", "REVIEW"] as const;
export type SocureDecision = (typeof SOCURE_DECISIONS)[number];

const uuidLike = z.string().min(8).max(128);

/**
 * Raw evaluation response. `status` (example: "CLOSED") and `eval_status`
 * (example: "evaluation_paused") are both documented; either may be present.
 * `tags` is documented as informational and is kept opaque.
 */
export const SOCURE_CASE_STATUSES = ["OPEN", "ON_HOLD", "CLOSED"] as const;
export const SOCURE_ENVIRONMENT_NAMES = ["Sandbox", "Production"] as const;
/**
 * `environment_name` as delivered. RiskOS dashboard verification pings
 * (observed 2026-09-12, Sandbox) send the full event envelope with
 * `environment_name: ""`; an empty string is "not provided", never a value.
 * Any other non-enum string is still rejected.
 */
const environmentNameField = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.enum(SOCURE_ENVIRONMENT_NAMES).optional(),
);

export const socureEvaluationResponseSchema = z
  .object({
    decision: z.enum(SOCURE_DECISIONS),
    eval_id: uuidLike,
    /** Echo of our customer-defined request id. */
    id: z.string().max(256).optional(),
    workflow: z.string().max(200).optional(),
    workflow_version: z.string().max(64).optional(),
    status: z.enum(SOCURE_CASE_STATUSES).optional(),
    sub_status: z.string().max(128).optional(),
    eval_status: z.string().max(64).optional(),
    environment_name: environmentNameField,
    /** Informational risk data — parsed to be discarded; never persisted, never shown. */
    score: z.number().optional(),
    reason_codes: z.array(z.string().max(200)).max(500).optional(),
    decision_tags: z.array(z.string().max(200)).max(200).optional(),
    review_queues: z.array(z.string().max(200)).max(50).optional(),
    tags: z.array(z.string().max(200)).max(200).optional(),
    data_enrichments: z
      .array(
        z
          .object({
            enrichment_name: z.string().max(200).optional(),
            enrichment_provider: z.string().max(200).optional(),
            response: z
              .object({
                data: z
                  .object({
                    docvTransactionToken: z
                      .string()
                      .min(1)
                      .max(4096)
                      .optional(),
                    url: z.url().optional(),
                  })
                  .loose()
                  .optional(),
              })
              .loose()
              .optional(),
          })
          .loose(),
      )
      .max(50)
      .optional(),
  })
  .loose();
export type SocureEvaluationResponse = z.infer<
  typeof socureEvaluationResponseSchema
>;

/** Guide step 4: REVIEW + eval_status "evaluation_paused" + a DocV transaction token. */
export const SOCURE_EVAL_STATUS_PAUSED = "evaluation_paused" as const;
/** Help center ("Handle DocV Step-Up"): the DocV request enrichment object. */
export const SOCURE_DOCV_ENRICHMENT = "SocureDocRequest" as const;
export const SOCURE_EVAL_STATUS_COMPLETED = "evaluation_completed" as const;

// ─── Error body ─────────────────────────────────────────────────────────────

export const SOCURE_ERROR_CODES = [
  "AUTHENTICATION_FAILED",
  "PERMISSION_DENIED",
  "WORKFLOW_NOT_FOUND",
  "WORKFLOW_NOT_PUBLISHED",
  "INVALID_REQUEST",
  "INVALID_PAYLOAD",
  "INVALID_ID",
  "INVALID_FRAUD_TYPE",
  "INTERNAL_ERROR",
  "CUSTOMER_METADATA_TOO_LARGE",
] as const;
export type SocureErrorCode = (typeof SOCURE_ERROR_CODES)[number];

/** Spec `Error`: `error` required; `code` enumerated; `invalid_args[]` names fields (never echoed to users). */
export const socureErrorBodySchema = z
  .object({
    error: z.string().max(500),
    code: z.enum(SOCURE_ERROR_CODES).optional(),
    message: z.string().max(2000).optional(),
    invalid_args: z
      .array(
        z
          .object({
            field: z.string().max(200),
            description: z.string().max(500),
          })
          .loose(),
      )
      .max(100)
      .optional(),
  })
  .loose();

// ─── Webhook ────────────────────────────────────────────────────────────────

export const SOCURE_WEBHOOK_EVENT_EVALUATION_COMPLETED =
  "evaluation_completed" as const;
export const SOCURE_WEBHOOK_EVENT_EVALUATION_PAUSED =
  "evaluation_paused" as const;
export const SOCURE_WEBHOOK_EVENT_WORKFLOW_FAILED =
  "workflow_execution_failed" as const;

/**
 * Webhook envelope (webhooks spec 1.0.0): `event_id` (uuid — the delivery
 * id; idempotency key), `event_at`, `event_type`, `data`. Inside `data`, `id`
 * is OUR customer-defined request id (correlation, anti-reassignment) and
 * `eval_id` is the provider evaluation id.
 */
export const socureWebhookEventSchema = z
  .object({
    event_id: uuidLike,
    event_at: z.iso.datetime().optional(),
    event_type: z.string().min(1).max(100),
    data: z
      .object({
        id: z.string().max(256).optional(),
        eval_id: uuidLike,
        decision: z.enum(SOCURE_DECISIONS).optional(),
        eval_status: z.string().max(64).optional(),
        evaluation_status: z.string().max(64).optional(),
        environment_name: environmentNameField,
      })
      .loose(),
  })
  .loose();
export type SocureWebhookEvent = z.infer<typeof socureWebhookEventSchema>;

/** The only webhook shape ReFi acts on. */
export const socureEvaluationCompletedEventSchema = z
  .object({
    event_id: uuidLike,
    event_at: z.iso.datetime().optional(),
    event_type: z.literal(SOCURE_WEBHOOK_EVENT_EVALUATION_COMPLETED),
    data: z
      .object({
        id: z.string().max(256),
        eval_id: uuidLike,
        decision: z.enum(SOCURE_DECISIONS),
        evaluation_status: z.literal(SOCURE_EVAL_STATUS_COMPLETED).optional(),
        environment_name: environmentNameField,
        status: z.enum(SOCURE_CASE_STATUSES).optional(),
        sub_status: z.string().max(128).optional(),
        /** Parsed to be discarded — never persisted, never shown. */
        score: z.number().optional(),
        reason_codes: z.array(z.string().max(200)).max(500).optional(),
        tags: z.array(z.string().max(200)).max(200).optional(),
      })
      .loose(),
  })
  .loose();
export type SocureEvaluationCompletedEvent = z.infer<
  typeof socureEvaluationCompletedEventSchema
>;
