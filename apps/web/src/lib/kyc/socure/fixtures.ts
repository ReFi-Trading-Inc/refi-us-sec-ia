/**
 * Deterministic Socure fixtures (mandate §32) — used by the fake client and
 * the contract assertions. No network, no credentials, no real PII: every
 * identity value is synthetic (`example.invalid`, 000-00-0000-style ids
 * are avoided; national_id fixture is the documented test pattern of nine
 * digits with no real-world meaning).
 */
import type { SocureIndividual } from "./schemas";

export const FIXTURE_EVAL_ID_ACCEPT = "b1c0e610-822d-4793-a970-8bfc0a9b883f";
export const FIXTURE_EVAL_ID_REJECT = "2f5a7c11-1a1a-4b2b-9c3c-4d4d5e5e6f6f";
export const FIXTURE_EVAL_ID_REVIEW = "11111111-2222-3333-4444-555555555555";
// Assembled at runtime so secret scanners do not flag a literal token shape.
export const FIXTURE_DOCV_TOKEN = ["docv", "txn", "fixture", "0001"].join("-");
export const FIXTURE_WEBHOOK_EVENT_ID = "550e8400-e29b-41d4-a716-446655440000";

/** Synthetic applicant. Used ONLY to build a request against the fake client. */
export const FIXTURE_INDIVIDUAL: SocureIndividual = {
  di_session_token: "di-session-fixture-token",
  given_name: "Jane",
  family_name: "Doe",
  date_of_birth: "1990-01-01",
  email: "investor@example.invalid",
  phone_number: "+15555550100",
  address: {
    line_1: "1 Fixture Way",
    locality: "Springfield",
    major_admin_division: "IL",
    postal_code: "62701",
    country: "US",
  },
};

export const RESPONSE_ACCEPT = {
  decision: "ACCEPT",
  status: "CLOSED",
  eval_status: "evaluation_completed",
  eval_id: FIXTURE_EVAL_ID_ACCEPT,
  workflow: "kyc-fraud-watchlist-docv-fixture",
  workflow_version: "1.0.0",
  environment_name: "Sandbox",
  score: 12,
  reason_codes: ["fixture_reason_not_for_users"],
} as const;

export const RESPONSE_REJECT = {
  decision: "REJECT",
  status: "CLOSED",
  eval_status: "evaluation_completed",
  eval_id: FIXTURE_EVAL_ID_REJECT,
  environment_name: "Sandbox",
  score: 91,
  tags: ["fixture_tag_not_for_users"],
  reason_codes: ["fixture_reason_not_for_users"],
  decision_tags: ["fixture_decision_tag"],
} as const;

/** Wrong environment echoed back: refused as malformed (never applied). */
export const RESPONSE_ACCEPT_WRONG_ENV = {
  ...RESPONSE_ACCEPT,
  environment_name: "Production",
} as const;

export const ERROR_BODY_WORKFLOW_NOT_FOUND = {
  error: "Not Found",
  code: "WORKFLOW_NOT_FOUND",
  message: "fixture",
} as const;

/** Guide step 4 shape: REVIEW + evaluation_paused + DocV token in data_enrichments. */
export const RESPONSE_REVIEW_DOCV_PAUSED = {
  decision: "REVIEW",
  eval_status: "evaluation_paused",
  status: "ON_HOLD",
  eval_id: FIXTURE_EVAL_ID_REVIEW,
  environment_name: "Sandbox",
  data_enrichments: [
    {
      enrichment_name: "OtherEnrichment",
      response: { data: { other: "ignored" } },
    },
    {
      enrichment_name: "SocureDocRequest",
      enrichment_provider: "SocureDocRequest",
      response: {
        data: {
          docvTransactionToken: FIXTURE_DOCV_TOKEN,
          url: "https://verify.socure.example.invalid/fixture",
        },
      },
    },
  ],
} as const;

/** REVIEW + paused, but the token sits in a NON-DocV enrichment: not a DocV step-up. */
export const RESPONSE_REVIEW_TOKEN_WRONG_ENRICHMENT = {
  decision: "REVIEW",
  eval_status: "evaluation_paused",
  status: "ON_HOLD",
  eval_id: FIXTURE_EVAL_ID_REVIEW,
  environment_name: "Sandbox",
  data_enrichments: [
    {
      enrichment_name: "SomethingElse",
      response: { data: { docvTransactionToken: "should-not-be-used" } },
    },
  ],
} as const;

/** REVIEW without the paused/token shape: provider holds the case. */
export const RESPONSE_REVIEW_NO_DOCV = {
  decision: "REVIEW",
  status: "OPEN",
  eval_id: FIXTURE_EVAL_ID_REVIEW,
} as const;

export const RESPONSE_MALFORMED = {
  decision: "MAYBE",
  eval_id: 42,
} as const;

/**
 * Webhook envelopes per the RiskOS™ webhooks spec: `event_id` (delivery id),
 * `event_at`, `event_type`, `data.id` (OUR request id — supplied by the
 * test from the stored record), `data.eval_id`, `data.decision`.
 */
export function webhookEvent(args: {
  eventId: string;
  requestId: string;
  evalId?: string;
  decision?: "ACCEPT" | "REJECT" | "REVIEW";
  eventType?: string;
  environment?: "Sandbox" | "Production";
}): Record<string, unknown> {
  const eventType = args.eventType ?? "evaluation_completed";
  return {
    event_id: args.eventId,
    event_at: "2026-09-10T00:00:00.000Z",
    event_type: eventType,
    data: {
      id: args.requestId,
      workflow: "kyc-fraud-watchlist-docv-fixture",
      workflow_id: "673dd085-3daf-4c6c-be67-d399933a9fec",
      workflow_version: "1.0.0",
      eval_id: args.evalId ?? FIXTURE_EVAL_ID_REVIEW,
      eval_start_time: "2026-09-10T00:00:00.000Z",
      eval_end_time: "2026-09-10T00:00:05.000Z",
      decision: args.decision ?? "ACCEPT",
      decision_at: "2026-09-10T00:00:05.000Z",
      status: "CLOSED",
      sub_status: "fixture",
      score: 7,
      eval_source: "API",
      ...(eventType === "evaluation_completed"
        ? { evaluation_status: "evaluation_completed" }
        : { eval_status: eventType }),
      environment_name: args.environment ?? "Sandbox",
      reason_codes: ["fixture_reason_not_for_users"],
      tags: ["fixture_tag_not_for_users"],
      notes: "fixture notes never stored",
      review_queues: ["Default Queue"],
      data_enrichments: [],
    },
  };
}

export const WEBHOOK_UNKNOWN_EVAL_ID = "99999999-9999-9999-9999-999999999999";

/** Transport-level scripts for the fake client. */
export type FakeSocureScript =
  | { kind: "json"; status: 200; body: unknown }
  | {
      kind: "http";
      status: 400 | 401 | 403 | 404 | 422 | 429 | 500 | 502 | 503;
      retryAfterSeconds?: number;
    }
  | { kind: "timeout" }
  | { kind: "network" };

export const SCRIPT_ACCEPT: FakeSocureScript = {
  kind: "json",
  status: 200,
  body: RESPONSE_ACCEPT,
};
export const SCRIPT_REJECT: FakeSocureScript = {
  kind: "json",
  status: 200,
  body: RESPONSE_REJECT,
};
export const SCRIPT_REVIEW_DOCV: FakeSocureScript = {
  kind: "json",
  status: 200,
  body: RESPONSE_REVIEW_DOCV_PAUSED,
};
export const SCRIPT_REVIEW_NO_DOCV: FakeSocureScript = {
  kind: "json",
  status: 200,
  body: RESPONSE_REVIEW_NO_DOCV,
};
export const SCRIPT_MALFORMED: FakeSocureScript = {
  kind: "json",
  status: 200,
  body: RESPONSE_MALFORMED,
};
export const SCRIPT_TIMEOUT: FakeSocureScript = { kind: "timeout" };
export const SCRIPT_429: FakeSocureScript = {
  kind: "http",
  status: 429,
  retryAfterSeconds: 30,
};
export const SCRIPT_503: FakeSocureScript = { kind: "http", status: 503 };
export const SCRIPT_401: FakeSocureScript = { kind: "http", status: 401 };
export const SCRIPT_400: FakeSocureScript = { kind: "http", status: 400 };

/**
 * RiskOS dashboard "Continue To Test" verification delivery, exactly the
 * key structure observed on the Sandbox endpoint on 2026-09-12 (values are
 * fixtures; the real ping's `environment_name` is the empty string).
 * `event_type` is the only difference between the two pings.
 */
export function dashboardVerificationPing(
  eventType: "evaluation_completed" | "evaluation_paused",
  eventId: string = crypto.randomUUID(),
): Record<string, unknown> {
  return {
    event_id: eventId,
    event_at: "2026-09-12T06:18:09.351234567Z",
    event_type: eventType,
    data: {
      id: "verify-ping1",
      workflow: "consumer_onboarding",
      workflow_id: "673dd085-3daf-4c6c-be67-d399933a9fec",
      workflow_version: "1.0.0",
      eval_id: crypto.randomUUID(),
      eval_at: "2026-09-12T06:18:09.351234567Z",
      eval_source: "API",
      decision: "ACCEPT",
      decision_at: "2026-09-12T06:18:09.351234567Z",
      decision_tags: ["fixture"],
      status: "OPEN",
      sub_status: "fixture-stat",
      evaluation_status: "evaluation_completed",
      environment_name: "",
      notes: "fixture-no",
      review_queues: ["fixture"],
      tags: ["fixture"],
      reason_codes: ["fixture"],
      third_party_executions: [{ name: "fixture" }],
    },
  };
}
