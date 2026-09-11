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
    given_name: z.string().min(1).max(100),
    family_name: z.string().min(1).max(100),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
      .optional(),
    email: z.email().max(320).optional(),
    phone_number: z
      .string()
      .regex(/^\+?[0-9]{7,15}$/)
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

export const socureEvaluationRequestSchema = z
  .object({
    workflow: z.string().min(1).max(200),
    data: z.object({ individual: socureIndividualSchema }).strict(),
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
export const socureEvaluationResponseSchema = z
  .object({
    decision: z.enum(SOCURE_DECISIONS),
    eval_id: uuidLike,
    status: z.string().max(64).optional(),
    eval_status: z.string().max(64).optional(),
    tags: z.array(z.string().max(200)).max(200).optional(),
    data_enrichments: z
      .array(
        z
          .object({
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
export const SOCURE_EVAL_STATUS_COMPLETED = "evaluation_completed" as const;

// ─── Webhook ────────────────────────────────────────────────────────────────

export const SOCURE_WEBHOOK_EVENT_EVALUATION_COMPLETED =
  "evaluation_completed" as const;

export const socureWebhookEventSchema = z
  .object({
    event_type: z.string().min(1).max(100),
    data: z
      .object({
        id: uuidLike,
        eval_id: uuidLike,
        eval_status: z.string().max(64).optional(),
        decision: z.enum(SOCURE_DECISIONS).optional(),
      })
      .loose(),
  })
  .loose();
export type SocureWebhookEvent = z.infer<typeof socureWebhookEventSchema>;

/** The only webhook shape ReFi acts on. */
export const socureEvaluationCompletedEventSchema = z
  .object({
    event_type: z.literal(SOCURE_WEBHOOK_EVENT_EVALUATION_COMPLETED),
    data: z
      .object({
        id: uuidLike,
        eval_id: uuidLike,
        eval_status: z.literal(SOCURE_EVAL_STATUS_COMPLETED).optional(),
        decision: z.enum(SOCURE_DECISIONS),
      })
      .loose(),
  })
  .loose();
export type SocureEvaluationCompletedEvent = z.infer<
  typeof socureEvaluationCompletedEventSchema
>;
