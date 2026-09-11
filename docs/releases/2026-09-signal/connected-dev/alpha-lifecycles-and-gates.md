# Alpha lifecycles, gates and journey — authority model confirmed 2026-09-11

Sources: Daniel's 2026-09-11 response (`daniel-response-2026-09-11.md`) and the founder directive of the same day. Documentation only; the contract shapes are Daniel's to deliver. **Do not invent field names before the contract lands.**

## Ownership

**Frontend / ReFi web:** Stytch-facing UX; onboarding UI/UX; Socure integration; questionnaire evaluation; compliance decision; KYC evidence retention; presentation of disclosures; consent capture; brokerage connection UI; PAPER/LIVE selection UI; portfolio subscription/allocation UI.
**Daniel / backend:** dedicated Alpha membership; identity-to-account mapping; authoritative account ownership; combining trusted compliance results with identity, membership, consent state and independent holds; canonical Alpha admission with reasons, rule version, evidence history, revocation/expiry processing; brokerage connection backend; account data; authorization; portfolio subscription; allocation; retry/recovery; activity/event delivery; connected integration testing. There is no frontend `setAdmitted()` or equivalent.

## Journey (admission before brokerage)

authentication → invitation / membership → profile → disclosures / consents → Socure / compliance → **backend admission** → user completes ReFi signup → brokerage connected later (PAPER/LIVE selection) → account sync → AccountAuthorization → portfolio subscription with percentage allocation → automated trading (PAPER under approved Alpha rules). A user is never sent off-site during signup to create or connect Alpaca; brokerage connection is shown as an outstanding setup step and is not a prerequisite for admission or for general access and history.

## Three separate lifecycles

| Lifecycle              | Purpose                                               | Conceptual stages (Daniel's vocabulary when delivered) | Notes                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invitation             | permission/opportunity to join                        | issued → accepted, or expired / revoked                | initial validity ≈ three months, configurable; once accepted, invitation expiry does **not** end membership                                                                                                |
| Membership / admission | whether the user belongs to the Alpha and is admitted | admitted · held · suspended · revoked                  | backend authoritative; continues independently of the invitation; a positive KYC never clears an independent suspension or hold; updates, revocations and expiries take effect without another login       |
| Commercial entitlement | whether automated trading is currently entitled       | trial → paid / lapsed → reactivated                    | **PRODUCT DECISION PENDING** on trial duration, trial start event (admission / first connection / first subscription / first trade), pricing, grace periods, paper-vs-live differences; nothing hard-coded |

Commercial expiry stops automated trading only. It must not liquidate positions, rebalance to cash, close positions, disconnect brokerage, remove history, disable sign-in, fail KYC or revoke membership. Any liquidation policy needs a separate explicit product/risk decision. The backend retains lifecycle dates for reactivation, billing and campaigns. No billing implementation.

## Disclosures and consents

The existing version/hash-bound consent receipt is sufficient for the Alpha: the frontend presents the document before acceptance, the receipt stays bound to version/hash, the backend receives the authoritative consent state; no separate delivery receipt is required. (Any F/G expectation of a delivery receipt is dropped.)

## KYC attestation (confirmed, unchanged)

Existing normalized KYC/profile attestation; provider = Socure; ReFi evidence reference/hash. Behind the reference in ReFi's retained evidence: Socure `eval_id`, workflow details, component outcomes, detailed provider evidence. Never sent: raw SSN, ID images, selfie/biometrics, raw Socure payload, detailed scores/tags. The attestation is evidence — not admission, brokerage readiness, AccountAuthorization or trading permission.

## Alpaca for the Alpha

Users' existing Alpaca accounts and their Trading API credentials with an explicit PAPER or LIVE connection selection; the backend must know the environment of every connection. Broker API account creation is deferred until after Alpha targets. Supporting a LIVE connection type does not authorize live automated execution: the existing live-capital gate stays; PAPER managed execution proceeds under approved Alpha rules; LIVE remains gated until explicit founder/regulatory approval.

## Trading gates (all required)

admitted membership · ready brokerage connection · correct PAPER/LIVE environment · AccountAuthorization · explicit portfolio subscription · percentage allocation · backend risk/execution controls. Neither KYC, admission, nor a brokerage connection alone authorizes trading. The frontend should expect to support subscription, percentage allocation, subscription status and backend validation/error states; the backend is authoritative for allocation rules (not invented here).

## Continuous backend effects

Because updates, revocations and expiries apply without another login, the frontend must not derive admission, membership or entitlement from a cached session claim; it reads the backend projection on every authoritative use and renders the current state. (Founder directive §17 was truncated after "frontend must not rely on login/session refresh to"; this section records the evident intent and awaits the remainder.)
