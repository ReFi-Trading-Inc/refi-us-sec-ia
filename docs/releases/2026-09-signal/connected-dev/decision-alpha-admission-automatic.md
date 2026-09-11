# Alpha admission — founder decision 2026-09-10 (later revision): automatic on final trusted Socure ACCEPT

**Rule:** `refi.alpha.admission.v1` (`apps/web/src/lib/compliance/alpha-admission.ts`).
**Policy:** eligible/invited user + required ReFi onboarding complete + final trusted Socure `ACCEPT` ⇒ **automatically admitted** to the closed Alpha. No routine human approval step. Human compliance review is an **exception path** (unreconcilable provider result, conflicting terminal events, watchlist escalation, explicit compliance hold, fraud judgment, provider state neither safely accepted nor rejected, approved operator override).

This supersedes earlier statements that every Alpha user requires a separate affirmative human admission after KYC ("internal ReFi human closed-Alpha approval" in `decision-kyc-model.md` §2 and the human-admission wording in `decision-kyc-provider-socure.md` and the demo persona notes). Those texts are retained as history with supersession markers.

## Journey (current)

```
PUBLIC / INVITED ALPHA ENTRY → STYTCH AUTHENTICATION → ELIGIBILITY / COHORT CHECK
→ PROFILE → DISCLOSURES / CONSENTS → SOCURE KYC + FRAUD + WATCHLIST → DOCV IF REQUIRED
→ SOCURE ACCEPT → AUTOMATIC ALPHA ADMISSION → BROKERAGE CONNECTION → ACCOUNT SYNC
→ ACCOUNT AUTHORIZATION → SIGNAL → MANAGED PAPER
```

UI ordering may differ; admission is **state-based, not sequence-dependent**.

## The ten prerequisites (all must hold)

1. authenticated identity (Stytch-backed BFF session);
2. ReFi identity mapping (backend account id);
3. Alpha cohort — backend onboarding state not `WAITLISTED` / `INELIGIBLE` / `SUSPENDED` (invitation/cohort authority remains the backend's; Socure ACCEPT alone never admits);
4. eligibility decision `ELIGIBLE` (backend);
5. advisory profile complete (ReFi profile v2 answers + assessment);
6. required disclosures delivered (backend effective list answered);
7. required consents accepted (ACTIVE receipt for every effective disclosure);
8. KYC final decision `ACCEPT` (ReFi `passed`);
9. the KYC result is final **and trusted** (provider evaluation or webhook provenance via `attestation-evidence.ts`);
10. no ReFi compliance hold (today: a conflicting terminal provider decision flags the record).

## Result mapping

| Provider result                                | KYC state                  | Admission                                                         |
| ---------------------------------------------- | -------------------------- | ----------------------------------------------------------------- |
| immediate `ACCEPT` (final)                     | `passed` (KYC_VERIFIED)    | `admitted` if 1–7 and 10 hold, else `pending` until they converge |
| `REVIEW` + DocV step-up                        | `additional_info_required` | `pending` — launch DocV, do not admit                             |
| DocV final `ACCEPT` (webhook)                  | `passed`                   | same evaluator → `admitted` when prerequisites hold               |
| final `REJECT`                                 | `failed` (KYC_REJECTED)    | `not_admitted` — no brokerage/economic onboarding                 |
| 429 / timeout / 5xx / malformed / delivery gap | `in_progress` (retryable)  | `pending` — neither admitted nor rejected                         |
| conflicting terminal events                    | unchanged (terminal)       | `hold` — surfaced for compliance investigation                    |

## Provenance and audit (`alpha-admission` record)

Subject reference, account id, state, rule version, `AUTOMATIC` provenance, reason (`KYC_ACCEPT_AND_PREREQUISITES_COMPLETE` / `KYC_REJECTED` / `MISSING:…` / hold reason), evaluated/admitted timestamps, evidence references (onboarding state, eligibility decision id, profile version, consent receipt ids, KYC evidence ref, provider `eval_id`), trigger (`kyc_evaluation` / `kyc_webhook` / `consent` / `profile` / `read`), and history. No PII, no provider secrets, no scores.

## Idempotency and durability

Unchanged evaluations append no history (a duplicate `evaluation_completed` produces one record). Admission reached from a final trusted ACCEPT is not revoked by a later unrelated provider error. Two workers evaluating the same decision produce one transition under the store's atomicity; a Firestore transaction wrap is a follow-up once the durable backing is provisioned. Later adverse provider updates need an explicit suspension/review policy — **future compliance work, not built here**.

## Boundaries preserved

KYC state and admission state are separate fields. Admission never implies `AccountAuthorization`, brokerage approval, Signal or Managed Paper; those gates and Daniel's backend authority are unchanged (asserted). The browser only reads admission (`GET /api/v1/investor/admission`).

## Backend contract impact (alpha.3)

- No dedicated admission mutation exists in alpha.3 and none is invented. The backend's own admission condition is the attestation: "Alpha admission requires effective accepted evidence with KYC `passed` … profile `eligible`, trading eligibility `eligible`, and effective consent" (`INTEGRATION.md`). The trusted KYC evidence now feeds `createComplianceProfileAttestation` (PR E), so the existing operation is the backend-facing admission proof.
- Cohort/invitation stays backend-owned (invitation at identity exchange; onboarding state projection); the frontend never writes it.
- Open for Daniel (packet question 8, revised): confirm the attestation `kyc` vocabulary; confirm no separate manually-set admission flag is expected. Status: **AUTOMATIC ADMISSION POLICY COMPLETE; backend admission evidence = attestation (existing operation); DANIEL CONFIRMATION of vocabulary pending.**
