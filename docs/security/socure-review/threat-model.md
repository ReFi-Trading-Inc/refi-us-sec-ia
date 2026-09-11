# Threat model — pointer and KYC/PII boundary summary

Status: IMPLEMENTED (evidence cited)

## 1. Existing threat model

The authoritative STRIDE threat model is **`docs/security-threat-model.md`**
(owner: Zeshan; reviewed each phase gate and after auth-chain, BFF, or
handoff changes). It covers trust boundaries B1–B6 (browser → BFF, game
handoff, outbound proxy, state store, wallet stack, edge/header gating), an
asset ranking, and an open-risk register mapped to issues. Its companion
runbooks: `docs/incident-response-runbook.md` and
`docs/security/RUNBOOK-bff-assertion-signing-key.md`.

`compliance/CONTROL_MATRIX.md` (CM-06) also references
`docs/security/THREAT_MODEL-alpha-handoff.md`; that file is untracked in the
working tree at `57a336d` and is not cited here as evidence.

This document does not rewrite the model. It records the trust boundary the
Socure integration will introduce so the model can be extended when the
integration is implemented.

## 2. KYC / PII trust boundary (planned; nothing active)

```
Browser (Socure SDK, public SDK key, DocV capture)
   │  HTTPS to Socure's SDK endpoints (documents/biometrics go to Socure, not ReFi)
   │  HTTPS same-origin to ReFi BFF (start / status / step-up)
   ▼
ReFi BFF (Next.js route handlers on Vercel / Cloud Run)
   │  server-side HTTPS, SOCURE_API_KEY in header (server-only env)
   ▼
Socure API (KYC + Fraud + Watchlist; DocV Step Up)
   │  webhook / callback → BFF (authenticity verified before any state change)
   ▼
ReFi records: Socure reference id, decision, reason codes (CONFIDENTIAL)
```

Boundary rules (policy now; controls when implemented):

| Threat (STRIDE)                                                 | Rule / intended control                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Information disclosure — API key in the browser                 | `SOCURE_API_KEY` is server-only via `serverEnv`; never `NEXT_PUBLIC_`; the contract assertion / tripwire pattern that keeps secrets out of client code applies (DP-02, IB-11 pattern).                                                  |
| Information disclosure — applicant PII stored or logged by ReFi | ReFi persists reference id + decision + reason codes only; no SSN, document images, or biometrics in Firestore, prototype store, logs, Sentry, or PostHog (`data-classification-policy.md` RESTRICTED; `data-handling-standard.md` §3). |
| Spoofing — forged webhook                                       | Verify Socure's signature/secret on every callback; reject unsigned or mismatched; treat callback as advisory and confirm status server-side via the API before advancing a lifecycle state.                                            |
| Replay — duplicate callback / repeated step-up                  | Idempotent handling keyed on Socure event/transaction id, stored in the durable store with `putIfAbsent` (DP-03 pattern already used for consumed jtis).                                                                                |
| Elevation — DocV / step-up token exposure                       | Any DocV session token minted server-side is short-lived, bound to the authenticated ReFi session (`us_session_v1`, AC-01), exposed to the browser once, and never logged.                                                              |
| Tampering — cross-origin start/step-up                          | Mutating BFF routes go through `bffMutate` same-origin enforcement (CS-01); browser never calls Socure's decision APIs directly (E2E forbids vendor-direct targets, `apps/web/e2e/kyc.spec.ts` pattern).                                |
| Repudiation                                                     | Every state change writes an `InvestorActionReceipt`; record reads write `RecordAccessLog` (RB-01, RB-02); correlation ids propagate (RB-08).                                                                                           |
| Denial of service — abuse of the start endpoint                 | Per-session rate limiting on start/step-up; distributed limiter is an open item in the model (§2.1 residual).                                                                                                                           |
| Wording / regulatory                                            | Never display "SEC verified", "KYC certified", "Fully verified"; describe the vendor decision state only (`decision-kyc-model.md` §5 wording rules; MK-01 copy scan).                                                                   |

## 3. Assets added by the integration

1. `SOCURE_API_KEY` and the webhook secret — RESTRICTED; compromise enables
   fraudulent verifications and data access at Socure. Rotate first on any
   suspicion (`incident-response.md` §2).
2. Applicant PII in transit through the BFF (if any field passes through) —
   forwarded once, never persisted.
3. Verification decisions and reason codes — CONFIDENTIAL, append-only
   records.

## 4. What must happen before the boundary goes live

- Extend `docs/security-threat-model.md` with a B7 row (BFF ↔ Socure) and
  the controls above, with tests named in `compliance/CONTROL_MATRIX.md`.
- Complete the vendor-onboarding step in `data-handling-standard.md` §9.
- Reconcile the KYC decision record (`README.md`, "Record to reconcile").
