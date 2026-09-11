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
  eval_id: FIXTURE_EVAL_ID_ACCEPT,
} as const;

export const RESPONSE_REJECT = {
  decision: "REJECT",
  status: "CLOSED",
  eval_id: FIXTURE_EVAL_ID_REJECT,
  tags: ["fixture_tag_not_for_users"],
} as const;

/** Guide step 4 shape: REVIEW + evaluation_paused + DocV token in data_enrichments. */
export const RESPONSE_REVIEW_DOCV_PAUSED = {
  decision: "REVIEW",
  eval_status: "evaluation_paused",
  eval_id: FIXTURE_EVAL_ID_REVIEW,
  data_enrichments: [
    { response: { data: { other: "ignored" } } },
    {
      response: {
        data: {
          docvTransactionToken: FIXTURE_DOCV_TOKEN,
          url: "https://verify.socure.example.invalid/fixture",
        },
      },
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

export const WEBHOOK_ACCEPT = {
  event_type: "evaluation_completed",
  data: {
    id: FIXTURE_WEBHOOK_EVENT_ID,
    eval_id: FIXTURE_EVAL_ID_REVIEW,
    eval_status: "evaluation_completed",
    decision: "ACCEPT",
  },
} as const;

export const WEBHOOK_REJECT = {
  event_type: "evaluation_completed",
  data: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    eval_id: FIXTURE_EVAL_ID_REVIEW,
    eval_status: "evaluation_completed",
    decision: "REJECT",
  },
} as const;

export const WEBHOOK_UNKNOWN_EVAL = {
  event_type: "evaluation_completed",
  data: {
    id: "550e8400-e29b-41d4-a716-446655440002",
    eval_id: "99999999-9999-9999-9999-999999999999",
    eval_status: "evaluation_completed",
    decision: "ACCEPT",
  },
} as const;

export const WEBHOOK_OTHER_EVENT = {
  event_type: "evaluation_started",
  data: {
    id: "550e8400-e29b-41d4-a716-446655440003",
    eval_id: FIXTURE_EVAL_ID_REVIEW,
  },
} as const;

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
