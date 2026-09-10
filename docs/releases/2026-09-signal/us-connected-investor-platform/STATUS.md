# ReFi US Connected Investor Platform — program status

Founder-facing status by formal program phase (mandate 2026-09-09 §3, §36).
Technical authority stays with Daniel's `september-12-launch/frontend_nextsteps.md`
(2026-09-09) and the frozen `v1.1.0-alpha.2` package
(`c1b53c906653ca8860bf66cfc0df8fa862ff34d6cbf77298ac83cb55f006cb09`).
Internal enums keep their technical names (e.g. release stage `automated_alpha`).

**Current phase: US Investor Integration Foundation.** Updated 2026-09-10.

Fixed technical values (Daniel's document is authoritative): Identity
audience `https://identity-ccid.dev.refi.internal`; Investor API audience
`https://investor-api.dev.refi.internal`.

| Phase                                | State                                |
| ------------------------------------ | ------------------------------------ |
| 1 US Investor Integration Foundation | IN PROGRESS                          |
| 2 US Connected Identity Alpha        | NOT STARTED                          |
| 3 US Connected Signal Alpha          | NOT STARTED                          |
| 4 US Managed Paper Alpha             | NOT STARTED                          |
| 5 US Multi-User Acceptance           | NOT STARTED                          |
| 6 US Regulatory Readiness            | NOT STARTED                          |
| 7 US Live Capital Readiness          | NOT STARTED (not under this mandate) |

## Phase 1 — US Investor Integration Foundation: exit criteria vs evidence

| Exit criterion                                    | State        | Evidence / owner                                                                                                                                         |
| ------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated GCP project established                 | BLOCKED      | `refi-us-connected-investor` approved; `infra/gcp/connected/provision-us-connected-investor.sh` ready; founder must run (gcloud auth + project creation) |
| Runtime service account exists                    | BLOCKED      | created by the same script; roles in `infra/gcp/connected/IAM.md`                                                                                        |
| Cloud Run connected runtime defined               | NOT COMPLETE | Dockerfile + build args exist (#90); `bff-dev` service definition follows provisioning                                                                   |
| Native Google audience authentication works       | CODE DONE    | PR #94 `google-id-token.ts`; runtime proof needs the project                                                                                             |
| KMS signer works                                  | CODE DONE    | PR #96 (stacked on #94); key provisioning pending                                                                                                        |
| JWKS works                                        | CODE DONE    | PR #96; serves the KMS public key once configured                                                                                                        |
| Durable sessions work                             | CODE DONE    | PR #97 (stacked on #94) `connected-store/session.ts`; Firestore pending                                                                                  |
| Durable replay protection works                   | CODE DONE    | PR #97 `connected-store/replay.ts`, `login-state.ts`                                                                                                     |
| Connected environment fails closed                | DONE (code)  | PR #94 + #96 + #97 env invariants, contract assertions                                                                                                   |
| Release policy correct                            | DONE (code)  | PR #94 `automated_alpha` explicit allowlist, default deny                                                                                                |
| First brokerage connection not circularly blocked | DONE (code)  | PR #95                                                                                                                                                   |
| alpha.2 untouched                                 | DONE         | digest verified every slice                                                                                                                              |
| Contract validation green                         | DONE         | validate + self-test (Python 3.11.5)                                                                                                                     |

## Open pull requests (none merged; founder review required)

| PR  | Branch                                | Base                         | Slice                                                 |
| --- | ------------------------------------- | ---------------------------- | ----------------------------------------------------- |
| #95 | connected-dev/broker-first-connection | main                         | first-brokerage-connection correction                 |
| #94 | connected-dev/bff-foundation          | main                         | release policy + native runtime auth + env invariants |
| #96 | connected-dev/assertion-signer        | connected-dev/bff-foundation | KMS Investor-API assertion signer + JWKS              |
| #97 | connected-dev/durable-security-state  | connected-dev/bff-foundation | durable session / login / replay / subject-map store  |

Dependency order for review: #95 → #94 → (#96, #97 retargeted to main).

## Founder decisions (resolved 2026-09-09)

GCP project `refi-us-connected-investor`; identity provider Stytch Consumer
Authentication (email magic link primary, email OTP fallback, passkey/TOTP
step-up, no wallet login); Alpaca PAPER only; no live capital; demo and
connected environments separate; backend owns execution; first broker
connection does not require AUTHORIZED; economic actions still do.

## Daniel-owned dependencies

B1 native BFF/upstream trust binding (after Appendix A); B2 preference
acknowledgment error-contract correction; B3 invited test identities and
execution scope; B4 market-session acceptance. `REFI_INVESTOR_API_ALLOW_REMOTE`
stays `0` until B1.
