# KYC provider for the initial US Alpha — founder decision 2026-09-10 (supersedes the Alpaca-owned model)

**KYC provider: Socure** · **Integration: Build Your Own UI** · **Workflow: KYC + Fraud + Watchlist > DocV Step Up** · **Scope: US Alpha**

ReFi owns KYC for the initial US Alpha. This supersedes, for the initial Alpha,
the earlier same-day decision "Alpaca-owned brokerage KYC/CIP" recorded in
`decision-kyc-model.md` (kept as history with a supersession banner). Socure
account verification is pending: everything below is **IMPLEMENTATION
COMPLETE, LIVE ACCEPTANCE BLOCKED** unless marked otherwise. No genuine Socure
request, key, webhook credential, PII or document has been used.

## Responsibility model

| Owner            | Owns                                                                                                                                                    | Does not own                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Stytch           | login, magic link, OTP, authentication session/factor evidence, genuine `auth_time`                                                                     | KYC                                    |
| Socure           | identity verification evidence, fraud signals, watchlist/sanctions screening, document verification, selfie/liveness, step-up evidence                  | ReFi admission                         |
| ReFi             | onboarding UX, KYC state machine, compliance decision, review workflow, investor admission, evidence retention, provider abstraction, downstream gating | brokerage account authority, execution |
| Daniel's backend | canonical account ownership, `AccountAuthorization`, risk, execution, orders, fills, reconciliation                                                     | KYC                                    |

Journey: Stytch authentication → ReFi KYC workflow → Socure KYC/Fraud/Watchlist
→ DocV step-up when required → ReFi compliance decision → closed-Alpha admission
→ brokerage connection → AccountAuthorization → Signal → Managed Paper.
Socure `ACCEPT` is a prerequisite, never admission, brokerage approval,
AccountAuthorization, Signal subscription or execution (every downstream gate is
preserved; contract assertions pin the attestation and admission boundaries).

## Specification sources

`docs/integrations/socure/IntegrationGuide.md` (founder-provided, vendored verbatim) and
`docs/integrations/socure/openapi/README.md` (facts derived from Socure's public
OpenAPI specs and help-center pages, 2026-09-10). Nothing was invented beyond them.

## State mapping (ReFi-owned; existing lifecycle names reused)

| Socure                                          | ReFi lifecycle (`lib/kyc/provider.ts`) | Conceptual state                      |
| ----------------------------------------------- | -------------------------------------- | ------------------------------------- |
| not yet submitted / form open                   | `not_started` → `in_progress`          | NOT_STARTED / IN_PROGRESS             |
| `ACCEPT` (sync or final webhook)                | `passed`                               | VERIFIED                              |
| `REJECT` (sync or final webhook)                | `failed`                               | REJECTED                              |
| `REVIEW` + `evaluation_paused` + DocV token     | `additional_info_required`             | REVIEW_REQUIRED (DocV step-up active) |
| DocV captured, awaiting webhook                 | `under_review`                         | IN_PROGRESS (provider)                |
| `REVIEW` without a step-up, or webhook `REVIEW` | `under_review`                         | REVIEW_REQUIRED (provider/manual)     |
| provider operational failure                    | `in_progress` (retryable)              | not a rejection                       |

## Implementation map (PRs)

| PR  | Branch                               | Content                                                                                                                                      |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `security/socure-review-pack` (#110) | security policies, evidence pack, vulnerability scan report                                                                                  |
| B   | `kyc/socure-b-provider` (#109)       | schemas, error model, mapping, client seam + fake, adapter, evidence record, durable evaluation entity, configuration + invariants, fixtures |
| C   | `kyc/socure-c-evaluation` (#111)     | strict identity input, evaluation route, DI token seam, identity form, registries                                                            |
| D   | `kyc/socure-d-docv-webhook` (#112)   | step-up routes, provider webhook (credential verification, IP allowlist, idempotency), DocV SDK seam, CSP gating                             |
| E   | `kyc/socure-e-attestation-docs`      | trusted attestation evidence from final provider decisions; program documentation                                                            |

## Manual review model (mandate §17)

- Socure `REVIEW` with a DocV step-up: **handled by Socure DocV**; ReFi shows "Additional identity verification required" and launches capture; the final decision arrives by webhook.
- Final `ACCEPT`: proceeds (to eligibility/admission gates, not to admission itself).
- Final `REJECT`: stops; investor sees "We could not verify your identity" with a support path; a new evaluation requires a new ReFi submission.
- `REVIEW` without a step-up, webhook `REVIEW`, `workflow_execution_failed`, or a conflicting final decision after a terminal state: **internal ReFi compliance case** (`under_review` / `conflict` flag on the record). No automated path resolves these; no tooling for the internal case is built yet (not required by the current architecture).

## Provider error model (mandate §18)

`invalid_request`, `auth_config`, `rate_limited`, `provider_unavailable`, `malformed_response`, `timeout`, `webhook_validation_failed` (`lib/kyc/socure/errors.ts`). None is a KYC rejection; the journey stays `in_progress` and retryable. Socure `REJECT` / `REVIEW` are decisions, not errors.

## What remains for live acceptance (Socure account dependency)

Sandbox account creation (support@socure.com), API key (server, Secret Manager), SDK key (`NEXT_PUBLIC_SOCURE_SDK_KEY`), workflow name, webhook endpoint registration with its Bearer/Basic credential (mirrored into `SOCURE_WEBHOOK_SECRET`) and subscription to `evaluation_completed`; then `@socure-inc/device-risk-sdk` installation and initialisation in the browser; then sandbox acceptance runs (ACCEPT / REJECT / REVIEW+DocV / webhook) recorded as evidence.
