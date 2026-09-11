/**
 * Socure KYC provider adapter — behind the provider-neutral boundary
 * (`../provider.ts`). Owns request construction, response validation, error
 * normalisation, `eval_id` handling, DocV step-up extraction, decision
 * mapping, and (with `../../prototype-store/entities/kyc-evaluation`) the
 * durable ReFi record. Nothing Socure-specific leaves this directory except
 * the adapter `kind` label.
 *
 * Trust: a Socure decision is provider evidence with provenance
 * `provider_evaluation` / `provider_webhook`; it is never admission,
 * eligibility or account authorization. PII is used to build ONE request and
 * is discarded; it is never persisted, logged or placed in an error.
 *
 * Genuine traffic is impossible until the founder activates
 * `REFI_KYC_PROVIDER=socure` with complete configuration; tests use
 * `FakeSocureClient`.
 */
import {
  applyFinalProviderDecision,
  findAuthIdByProviderEvaluation,
  freshKycEvaluation,
  getKycEvaluation,
  putKycEvaluation,
  transition,
  type KycEvaluationRecord,
  type WebhookApplication,
} from "../../prototype-store/entities/kyc-evaluation";
import { getServerEnv } from "../../config/env";
import type { NormalizedIdentityInput } from "../identity-input";
import type { KycEvidenceRecord } from "../evidence";
import {
  TERMINAL_KYC_STATES,
  type KycIdentityEvaluationOutcome,
  type KycProviderAdapter,
  type KycStartResult,
  type KycSubject,
  type KycVerificationSession,
} from "../provider";
import {
  getSocureClient,
  rawToBodyOrThrow,
  type SocureClientLike,
} from "./client";
import { isSocureProviderError, SocureProviderError } from "./errors";
import {
  deriveComponentStatuses,
  mapSocureEvaluation,
  mapSocureWebhookDecision,
} from "./mapping";
import {
  socureEvaluationCompletedEventSchema,
  socureEvaluationRequestSchema,
  socureEvaluationResponseSchema,
  socureWebhookEventSchema,
  SOCURE_WEBHOOK_EVENT_EVALUATION_COMPLETED,
  type SocureIndividual,
} from "./schemas";

export const SOCURE_ADAPTER_KIND = "socure" as const;
/** Same-origin continuation: the ReFi-owned identity form (no provider URL). */
export const SOCURE_CONTINUE_PATH = "/us/onboarding/kyc" as const;

function view(record: KycEvaluationRecord): KycVerificationSession {
  return {
    referenceId: record.referenceId,
    state: record.state,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    history: record.history.map((h) => ({ state: h.state, at: h.at })),
  };
}

export type SocureEvaluateOutcome =
  | {
      ok: true;
      session: KycVerificationSession;
      /** Only for an active DocV step-up: the token the browser SDK needs. */
      docvTransactionToken: string | null;
      reused: boolean;
    }
  | {
      ok: false;
      reason: "already_terminal" | "submission_in_flight" | "provider_error";
      session: KycVerificationSession;
      /** Present for provider_error; never includes request data. */
      error?: {
        kind: string;
        retryable: boolean;
        retryAfterSeconds: number | null;
      };
    };

export class SocureKycProvider implements KycProviderAdapter {
  readonly kind = SOCURE_ADAPTER_KIND;
  constructor(
    private readonly clientFactory: () => SocureClientLike = getSocureClient,
  ) {}

  private async load(
    authId: string,
    correlationId: string,
  ): Promise<KycEvaluationRecord> {
    return (
      (await getKycEvaluation(authId)) ??
      freshKycEvaluation(authId, SOCURE_ADAPTER_KIND, correlationId)
    );
  }

  async getSession(subject: KycSubject): Promise<KycVerificationSession> {
    return view(await this.load(subject.authId, "kyc-read"));
  }

  /** Start = the user is sent to ReFi's own identity form. Nothing is submitted to the provider yet. */
  async start(
    subject: KycSubject,
    correlationId = "kyc-start",
  ): Promise<KycStartResult> {
    const current = await this.load(subject.authId, correlationId);
    if (current.state === "passed") {
      return {
        accepted: false,
        reason: "already_terminal",
        session: view(current),
      };
    }
    if (
      current.state === "in_progress" ||
      current.state === "under_review" ||
      current.state === "additional_info_required"
    ) {
      return {
        accepted: true,
        session: view(current),
        continuePath: SOCURE_CONTINUE_PATH,
      };
    }
    const next = transition(current, "in_progress", correlationId, "user");
    await putKycEvaluation(next);
    return {
      accepted: true,
      session: view(next),
      continuePath: SOCURE_CONTINUE_PATH,
    };
  }

  /**
   * Submit ONE evaluation for the current user. `submissionKey` is the
   * browser's per-submission idempotency key (server-scoped to the user): a
   * retry with the same key while a submission is in flight or after it was
   * answered never creates a second provider evaluation.
   */
  async evaluate(args: {
    subject: KycSubject;
    individual: SocureIndividual;
    /** ISO time the investor consented to identity verification (ReFi consent record). */
    consentTimestamp: string;
    submissionKey: string;
    correlationId: string;
  }): Promise<SocureEvaluateOutcome> {
    const { subject, submissionKey, correlationId } = args;
    const current = await this.load(subject.authId, correlationId);
    if (TERMINAL_KYC_STATES.has(current.state) && current.state === "passed") {
      return { ok: false, reason: "already_terminal", session: view(current) };
    }
    if (current.submission?.key === submissionKey) {
      if (current.submission.phase === "submitting") {
        return {
          ok: false,
          reason: "submission_in_flight",
          session: view(current),
        };
      }
      if (current.submission.phase === "answered") {
        return {
          ok: true,
          session: view(current),
          docvTransactionToken: current.docv?.transactionToken ?? null,
          reused: true,
        };
      }
    }
    if (
      current.evidence.providerEvaluationId !== null &&
      !current.evidence.providerDecisionFinal &&
      current.state !== "failed"
    ) {
      // An evaluation already exists and is not final (REVIEW / DocV / awaiting
      // webhook): never open a second one from a new browser submission.
      return {
        ok: true,
        session: view(current),
        docvTransactionToken: current.docv?.transactionToken ?? null,
        reused: true,
      };
    }

    const env = getServerEnv();
    const workflow = env.SOCURE_WORKFLOW_NAME ?? "unconfigured";
    // Spec: `id` is customer-defined and unique per evaluation; it is an
    // opaque ReFi request id (never a user id, email or account id) and is
    // the correlation value echoed back in webhooks as `data.id`.
    const providerRequestId = `refi-kyc-req-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    const request = socureEvaluationRequestSchema.parse({
      workflow,
      id: providerRequestId,
      timestamp: nowIso,
      data: {
        individual: {
          ...args.individual,
          additional_context: {
            user_consent: true,
            consent_timestamp: args.consentTimestamp,
          },
        },
      },
    });

    // Record the in-flight submission BEFORE the provider call so a retry is visible.
    const submitting: KycEvaluationRecord = {
      ...transition(current, "in_progress", correlationId, "user", {
        submission: submissionKey,
      }),
      submission: {
        key: submissionKey,
        phase: "submitting",
        at: nowIso,
        providerRequestId,
      },
      lastProviderError: null,
    };
    await putKycEvaluation(submitting);

    let raw;
    try {
      raw = await this.clientFactory().evaluate(request, { correlationId });
    } catch (err) {
      return this.failed(submitting, submissionKey, correlationId, err);
    }
    let parsed;
    try {
      parsed = socureEvaluationResponseSchema.safeParse(rawToBodyOrThrow(raw));
    } catch (err) {
      return this.failed(submitting, submissionKey, correlationId, err);
    }
    if (!parsed.success) {
      return this.failed(
        submitting,
        submissionKey,
        correlationId,
        new SocureProviderError(
          "malformed_response",
          raw.status,
          null,
          "schema",
        ),
      );
    }
    const response = parsed.data;
    if (
      response.environment_name !== undefined &&
      response.environment_name.toLowerCase() !== env.SOCURE_ENV
    ) {
      return this.failed(
        submitting,
        submissionKey,
        correlationId,
        new SocureProviderError(
          "malformed_response",
          raw.status,
          null,
          "environment mismatch",
        ),
      );
    }
    const outcome = mapSocureEvaluation(response);
    const at = new Date().toISOString();
    let next = transition(
      submitting,
      outcome.refiState,
      correlationId,
      "provider_evaluation",
      {
        providerEvaluationId: response.eval_id,
        providerDecision: outcome.providerDecision,
      },
    );
    next = {
      ...next,
      submission: { key: submissionKey, phase: "answered", at },
      docv:
        outcome.docvTransactionToken !== null
          ? {
              transactionToken: outcome.docvTransactionToken,
              issuedAt: at,
              launchedAt: null,
              captureCompletedAt: null,
            }
          : null,
      evidence: {
        ...next.evidence,
        providerEvaluationId: response.eval_id,
        providerRequestId,
        providerWorkflow: response.workflow ?? workflow,
        providerWorkflowVersion: response.workflow_version ?? null,
        providerDecision: outcome.providerDecision,
        providerDecisionFinal: outcome.final,
        providerEvaluationStatus:
          response.eval_status ?? response.status ?? null,
        docvRequired:
          next.evidence.docvRequired || outcome.docvTransactionToken !== null,
        evaluationCreatedAt: next.evidence.evaluationCreatedAt ?? at,
        completedAt: outcome.final ? at : null,
        reviewReason: outcome.reviewReason,
        decisionProvenance: "provider_evaluation",
        ...deriveComponentStatuses({
          providerDecision: outcome.providerDecision,
          final: outcome.final,
          docvOccurred: outcome.docvTransactionToken !== null,
        }),
      },
    };
    await putKycEvaluation(next);
    return {
      ok: true,
      session: view(next),
      docvTransactionToken: outcome.docvTransactionToken,
      reused: false,
    };
  }

  private async failed(
    record: KycEvaluationRecord,
    submissionKey: string,
    correlationId: string,
    err: unknown,
  ): Promise<SocureEvaluateOutcome> {
    const e = isSocureProviderError(err)
      ? err
      : new SocureProviderError(
          "provider_unavailable",
          null,
          null,
          "unclassified",
        );
    // Operational failure is NOT a rejection: the journey stays in_progress and retryable.
    const next: KycEvaluationRecord = {
      ...record,
      submission: {
        key: submissionKey,
        phase: "failed",
        at: new Date().toISOString(),
      },
      lastProviderError: {
        kind: e.kind,
        retryable: e.retryable,
        at: new Date().toISOString(),
      },
    };
    await putKycEvaluation(next);
    return {
      ok: false,
      reason: "provider_error",
      session: view(next),
      error: {
        kind: e.kind,
        retryable: e.retryable,
        retryAfterSeconds: e.retryAfterSeconds,
      },
    };
  }

  /** Neutral entry point used by the BFF route: maps ReFi's identity input to the wire shape once. */
  async evaluateIdentity(args: {
    subject: KycSubject;
    input: NormalizedIdentityInput;
    consentTimestamp: string;
    correlationId: string;
  }): Promise<KycIdentityEvaluationOutcome> {
    const i = args.input;
    const individual: SocureIndividual = {
      di_session_token: i.diSessionToken,
      given_name: i.givenName,
      family_name: i.familyName,
      date_of_birth: i.dateOfBirth,
      ...(i.email ? { email: i.email } : {}),
      ...(i.phoneNumber ? { phone_number: i.phoneNumber } : {}),
      ...(i.nationalId ? { national_id: i.nationalId } : {}),
      address: {
        line_1: i.address.line1,
        ...(i.address.line2 ? { line_2: i.address.line2 } : {}),
        locality: i.address.locality,
        major_admin_division: i.address.region,
        postal_code: i.address.postalCode,
        country: "US",
      },
    };
    const out = await this.evaluate({
      subject: args.subject,
      individual,
      consentTimestamp: args.consentTimestamp,
      submissionKey: i.submissionKey,
      correlationId: args.correlationId,
    });
    if (out.ok) {
      return {
        kind: out.reused ? "reused" : "evaluated",
        session: out.session,
        stepUpRequired: out.session.state === "additional_info_required",
      };
    }
    switch (out.reason) {
      case "already_terminal":
        return { kind: "already_terminal", session: out.session };
      case "submission_in_flight":
        return { kind: "submission_in_flight", session: out.session };
      case "provider_error":
        return {
          kind: "provider_error",
          session: out.session,
          retryable: out.error?.retryable ?? false,
          retryAfterSeconds: out.error?.retryAfterSeconds ?? null,
          errorKind: out.error?.kind ?? "provider_unavailable",
        };
    }
  }

  /** Provider-neutral evidence for the attestation; null before any evaluation. */
  async evidenceRecord(subject: KycSubject): Promise<KycEvidenceRecord | null> {
    const r = await getKycEvaluation(subject.authId);
    return r ? r.evidence : null;
  }

  /** Neutral step-up capability (interface): the DocV transaction token for THIS user only. */
  async stepUpToken(subject: KycSubject): Promise<string | null> {
    return this.docvTokenFor(subject);
  }

  async markStepUpCaptured(
    subject: KycSubject,
    correlationId: string,
  ): Promise<KycVerificationSession | null> {
    return this.markDocvCaptured(subject, correlationId);
  }

  /** The DocV token for THIS user only, if a step-up is active. */
  async docvTokenFor(subject: KycSubject): Promise<string | null> {
    const r = await getKycEvaluation(subject.authId);
    if (!r || r.state !== "additional_info_required" || !r.docv) return null;
    return r.docv.transactionToken;
  }

  /** Browser reports the capture finished: NOT final — we now await the webhook. */
  async markDocvCaptured(
    subject: KycSubject,
    correlationId: string,
  ): Promise<KycVerificationSession | null> {
    const r = await getKycEvaluation(subject.authId);
    if (!r || r.state !== "additional_info_required" || !r.docv) return null;
    const at = new Date().toISOString();
    const next: KycEvaluationRecord = {
      ...transition(r, "under_review", correlationId, "user", {
        docv: "captured",
      }),
      docv: {
        ...r.docv,
        launchedAt: r.docv.launchedAt ?? at,
        captureCompletedAt: at,
      },
    };
    await putKycEvaluation(next);
    return view(next);
  }

  /**
   * Apply an authenticated webhook payload. Validation of provider
   * authenticity happens BEFORE this call (route layer). Unknown event types
   * are ignored; unknown evaluations never create a user.
   */
  async applyWebhook(
    payload: unknown,
    correlationId: string,
  ): Promise<
    | {
        handled: false;
        reason: "ignored_event_type" | "malformed" | "environment_mismatch";
      }
    | ({ handled: true } & WebhookApplication)
  > {
    const generic = socureWebhookEventSchema.safeParse(payload);
    if (!generic.success) return { handled: false, reason: "malformed" };
    if (generic.data.event_type !== SOCURE_WEBHOOK_EVENT_EVALUATION_COMPLETED) {
      return { handled: false, reason: "ignored_event_type" };
    }
    const completed = socureEvaluationCompletedEventSchema.safeParse(payload);
    if (!completed.success) return { handled: false, reason: "malformed" };
    const env = getServerEnv();
    if (
      completed.data.data.environment_name !== undefined &&
      completed.data.data.environment_name.toLowerCase() !== env.SOCURE_ENV
    ) {
      return { handled: false, reason: "environment_mismatch" };
    }
    const mapped = mapSocureWebhookDecision(completed.data);
    const applied = await applyFinalProviderDecision({
      eventId: completed.data.event_id,
      providerRequestId: completed.data.data.id,
      providerEvaluationId: completed.data.data.eval_id,
      providerDecision: mapped.providerDecision,
      mapped: { refiState: mapped.refiState, final: mapped.final },
      correlationId,
    });
    return { handled: true, ...applied };
  }

  /** Correlation helper for the webhook route (no user creation). */
  async ownerOfEvaluation(
    providerEvaluationId: string,
  ): Promise<string | null> {
    return findAuthIdByProviderEvaluation(providerEvaluationId);
  }
}
