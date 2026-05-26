/**
 * BFF prototype store — barrel export.
 *
 * Contract: docs/bff-prototype-state-contract.md.
 * Domain noun → entity file mapping:
 *
 *   session                       → session.ts
 *   advisory_profile              → advisory-profile.ts
 *   disclosure_document           → disclosure-document.ts
 *   disclosure_acknowledgement    → disclosure-acknowledgement.ts
 *   brokerage_connection          → brokerage-connection.ts
 *   subscription_mode             → subscription-mode.ts
 *   execution_policy              → execution-policy.ts
 *   managed_execution_state       → managed-execution-state.ts
 *   recommendation_projection     → recommendation-projection.ts
 *   exception_review              → exception-review.ts
 *   decision_record               → decision-record.ts
 *   investor_action_receipt       → receipt.ts
 *   record_access_log             → record-access-log.ts
 *   auth_session_link             → auth-link.ts
 *   lifecycle_state               → lifecycle.ts
 */
export * from "./store";
export * from "./entities/session";
export * from "./entities/advisory-profile";
export * from "./entities/disclosure-document";
export * from "./entities/disclosure-acknowledgement";
export * from "./entities/brokerage-connection";
export * from "./entities/subscription-mode";
export * from "./entities/execution-policy";
export * from "./entities/execution-policy-draft";
export * from "./entities/managed-execution-state";
export * from "./entities/recommendation-projection";
export * from "./entities/exception-review";
export * from "./entities/decision-record";
export * from "./entities/receipt";
export * from "./entities/record-access-log";
export * from "./entities/auth-link";
export * from "./entities/lifecycle";
