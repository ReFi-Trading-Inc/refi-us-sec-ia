# Socure support case #15457 — resolution and plan change (2026-09-27)

Base: `main` = `b4c36f6`. Socure support reply (Nate, Socure) received 2026-09-27, answering ReFi's Sandbox certification questions for use case `consumer_onboarding`, workflow `consumer_onboarding` v1.0.0 (`2ba07627-03ea-4c37-a480-44071e7c509b`), Sandbox, Build Your Own UI, DI web SDK 2.11.0.

Production RiskOS traffic remains NOT AUTHORIZED. This record states what Socure answered, what it unblocks, and what changes in our plan. It claims no scenario has been run. Founder decisions on this reply are dated 2026-09-27 and are recorded inline.

## What Socure answered

| Our question (case #15457)                                                                                          | Socure answer                                                                                                                                                                                                                                  | Status                                |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1–2. Test Personas JSON / a Sandbox input routing `consumer_onboarding` to REVIEW with a DocV step-up               | The Test Cases tab not showing the full set is a Socure-side defect; their engineering is investigating. Workaround: "Run in Postman" at the top right of the Test Cases tab exposes every test case under the Consumer Onboarding collection. | ANSWERED — workaround available       |
| 3. How to complete or **fail** the RiskOS-orchestrated DocV step in Sandbox                                         | No Sandbox simulation of DocV failure exists; Socure invites a Production test against the $1,000/month free credits.                                                                                                                          | ANSWERED — Sandbox cannot do it       |
| 4. A Sandbox input producing a final REJECT                                                                         | Same source as 1–2: the Consumer Onboarding Postman collection.                                                                                                                                                                                | ANSWERED — workaround available       |
| 5. Confirmation that the resumed evaluation delivers final routing through `evaluation_completed`                   | Not addressed in the reply.                                                                                                                                                                                                                    | **STILL OPEN** — normative, see §Q5   |
| 6. Whether retaining evaluation identity/decision/provenance without scores or reason codes satisfies certification | "Yes your approach should satisfy certification."                                                                                                                                                                                              | ANSWERED — see §N2 for exact phrasing |

Socure also offered a call. That is the channel for Q5 and for the B2 question in §B2.

## N2 — retention: RESOLVED, and the hardening-era persistence is reverted

Precise record of the provider statement, because the modality matters:

> On 2026-09-27, Socure support stated that ReFi's described evidence-retention approach — retaining evaluation identity/decision/provenance while not retaining scores or reason codes — "should satisfy certification."

This is not a waiver of a requirement, and it is not a guarantee. It is a support statement using "should". It is recorded as provider evidence, preserved with case #15457 and the email (appendix below).

**N2 RESOLVED: Socure confirmed the lean retention approach should satisfy certification. ReFi will return to the intended minimised evidence model and remove the certification-only score/reason-code persistence introduced during hardening.**

Founder decision 2026-09-27. The N2 `providerDetail` field was added during certification hardening because we believed Socure's go-live checklist compelled local retention of scores and reason codes. That belief is now disproven, so the original architecture decision is restored:

Retain:

- `eval_id`
- provider / workflow identity necessary for provenance
- final provider decision
- normalized, tags-derived ReFi state
- lifecycle timestamps
- evidence reference / hash / provenance

Do not retain:

- top-level scores
- enrichment scores
- reason codes
- full enrichment outputs
- raw provider payloads
- full routing / review metadata merely because Socure returned it

Raw tags are not retained for possible future analysis; only the minimum normalized state needed to explain which ReFi decision was made. This is data minimisation, not a loss of auditability. The audit question we must answer is _which Socure evaluation produced which ReFi KYC state, when, under which workflow_ — answerable from the evidence record alone. The question _what numerical fraud/model scores did Socure calculate internally_ has no demonstrated product, regulatory or certification requirement behind it; if one is later established, a bounded retention policy can be added deliberately.

### The contradiction this resolves

`docs/integrations/socure/pii-inventory.md` (row "Scores, reason codes, tags, decision tags, notes") states retention **"parsed and discarded (asserted)"**, while the hardening-era implementation persisted exactly those fields as `providerDetail` on the evaluation record. On `main` today the inventory is therefore inaccurate. It is resolved in favour of the minimised design: the implementation is corrected, the inventory is left as written. The inventory is not "fixed" by documenting wider retention.

Implementation follows in a **separate security / data-retention PR**, classified `TIER 2 — FOUNDER REVIEW REQUIRED` because it changes sensitive-data retention policy, and not self-merged. Scope: remove the `providerDetail` persistence path, remove `SocureCertificationDetail` once unused, remove extraction of enrichment scores and reason codes for persistence, remove the field from the KYC evaluation entity, update the adapter / webhook / reconciliation paths, update tests, assert that scores and reason codes cannot enter durable KYC records, and preserve only the coarse evidence and provenance that ReFi attestation already requires. Every caller is searched before deletion; no second storage path is left behind.

## Scenario B splits

### B1 — REVIEW → DocV step-up → ACCEPT · Sandbox · NOT RUN

Executable now. Input source: the Consumer Onboarding Postman collection. The published workflow auto-completes Sandbox DocV (CONDITION "10sec for Sandbox" gates on `socure_doc_request_response.environmentName == "Sandbox"`), so the ACCEPT branch of the step-up runs end to end.

Evidence to capture — "Run in Postman" is not an acceptable record of the input:

1. Exact Postman test-case / persona name.
2. The non-secret synthetic inputs used.
3. Initial `eval_id`.
4. REVIEW / `ON_HOLD` / `evaluation_paused` state as returned.
5. `SocureDocRequest` enrichment presence.
6. `docvTransactionToken` presence.
7. Capture App completion.
8. Resumed evaluation.
9. Final ACCEPT.
10. Webhook event sequence.
11. GET reconciliation result (Scenario M repeated live against this evaluation).

Snapshot the exact test case used into the evidence record, so certification stays reproducible if Socure later changes the collection. Synthetic inputs only; never a synthetic SSN, document image or selfie in the packet.

### B2 — DocV failure → final negative outcome · NOT a certification requirement

Classification, founder decision 2026-09-27:

- implementation coverage: **PASS via fixtures / deterministic tests**
- live provider coverage: **NOT AVAILABLE IN SANDBOX**
- production exercise: **OPTIONAL / FOUNDER-GATED PENDING SOCURE CONFIRMATION**

Socure said, in full: "We currently do not have an easy way to simulate DocV failure in Sandbox. Feel free to push to production and test there." That is permission to test in Production. It is not a statement that a Production test is required for certification, and it is not treated as a go-live blocker unless Socure says it is one.

Before any synthetic identity is put through Production, ask Nate directly:

> Is a Production DocV-failure run required for our certification/go-live, or is fixture coverage of the failure path plus a successful Sandbox REVIEW → DocV → ACCEPT sufficient?

If not required: defer live-provider validation of B2 to the normal Production-readiness exercise. If required: the founder Production gate in §B2 preconditions applies.

Existing coverage of the failure path stays as is: workflow CONDITION "DocV Reject?" → REJECT with tag "DocV Reject"; `launchDocumentCapture` `onError` classification (no operational error ever becomes a rejection); Scenario H conflict handling.

#### B2 preconditions, if it must run in Production

All of the following first, each recorded:

- explicit founder approval
- Socure Production TPS enabled
- Production `consumer_onboarding` workflow id / version verified
- Production Capture App verified
- Production webhook endpoint + credential verified
- sender-IP policy deliberately set and tested
- monitoring / CRITICAL notification path live
- synthetic identity only
- no real customer identity
- no production brokerage / trading dependency

And ask Socure — do not assume — whether the synthetic Production evaluation enters any persistent fraud/identity graph, whether it affects future risk decisions, whether it can be tagged as test, and whether it can or should be purged afterwards.

Protocol, once authorized: `docs/runbooks/socure-sandbox-activation.md` §C4.

### C — final REJECT · Sandbox · NOT RUN

Executable now with the provider-supported REJECT persona from the Consumer Onboarding collection (pre-DocV reject: SSN mismatch R911 / R947 / R901, or a watchlist hit). Bounded evidence: persona / test-case name, `eval_id`, workflow and version, final decision, timestamps, webhook delivery, reconciliation. No scores or reason codes are persisted.

## Q5 — open as a normative question

B1 may empirically show that the resumed evaluation produces an `evaluation_completed` webhook. Observed behaviour is useful evidence but does not settle the provider contract. Q5 stays open until Socure confirms in writing:

> For `consumer_onboarding` v1.0.0, after the RiskOS-orchestrated DocV step completes and the evaluation resumes, is the final routing delivered through `evaluation_completed`?

Record both observed behaviour and provider confirmation when each is available.

## Remaining actions

| #   | Action                                                                                                                                                                                                                                 | Owner       | Blocks          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------- |
| 1   | On the Sandbox Test Cases tab use "Run in Postman", export the Consumer Onboarding collection, and identify the REVIEW-with-step-up and REJECT test cases (synthetic PII only; hand to the operator run, do not commit request bodies) | founder     | B1, C           |
| 2   | Run B1 in Sandbox per runbook §C step 12–13; capture the eleven items above; repeat Scenario M live against it                                                                                                                         | engineering | B1, M live      |
| 3   | Run C in Sandbox per runbook §C step 14; capture the bounded evidence above                                                                                                                                                            | engineering | C               |
| 4   | Verify the Sandbox Capture App flow in the dashboard (the open N1 item; dashboard-only surface)                                                                                                                                        | founder     | B1              |
| 5   | Send Nate the Q5 confirmation request and the B2 "is it required" question                                                                                                                                                             | founder     | Q5, B2 decision |
| 6   | Open and review the `providerDetail` minimisation PR (TIER 2, no self-merge)                                                                                                                                                           | founder     | N2 closure      |
| 7   | Ask Socure to confirm when the Test Cases tab defect is fixed, so the workaround can be dropped                                                                                                                                        | founder     | nothing         |

## Appendix — provider evidence (case #15457)

Retained verbatim, as provider evidence. Socure support reply, 2026-09-27, Nate (Socure):

> Apologize for the delay here. Apologies for the inconvenience related tot he test cases. OUr engineering team is looking into why they are not showing. In the meantime, if you click 'Run in Postman' in the upper right of the test cases tab, you can see all the test cases under the consumer onboarding collection. See screenshot.
>
> We currently do not have an easy way to simulate DocV failure in Sandbox. Feel free to push to production and test there. That is part of the value of the $1000 in free monthly credits.
>
> Yes your approach should satisfy certification.
>
> Please feel free to grab time here to discuss in more detail. We want to ensure you are set up for success.

Quoted as received, including typographical errors; the referenced screenshot is not reproduced here. ReFi's originating request is case #15457, "Sandbox test inputs for consumer_onboarding v1.0.0 (REVIEW/DocV step-up and REJECT)", six numbered questions, synthetic test data only, no credentials in the thread.

---

## Addendum — Socure's follow-up answers (2026-09-29)

ReFi sent the approved clarification. Socure replied 2026-09-29, opening with "Yes." and answering in the order the questions were asked:

> **Yes.**
>
> **We do not require certification in Launch. This is up to the customer and what they feel is required for them to be confident in the experience they deliver to their end users.**
>
> **The data would be stored and theoretically could impact future risk decisions.**

The questions, in the order sent, were (1) final routing through `evaluation_completed`, (2) whether a Production DocV-failure run is required, (3) if required, what becomes of synthetic Production data. The three answers correspond in order.

### 1. Q5 — CLOSED / PROVIDER CONFIRMED

Socure answered **"Yes"** to the question asking whether the resumed `consumer_onboarding` v1.0.0 evaluation delivers the final outcome through the `evaluation_completed` webhook.

Provider-confirmed contract:

```text
consumer_onboarding v1.0.0
DocV completes
→ evaluation resumes
→ final routing through evaluation_completed
```

Q5 is **no longer open**. B1 must still verify the behaviour at runtime, but these are two separate evidence classes and neither substitutes for the other:

| Evidence class      | State                              |
| ------------------- | ---------------------------------- |
| provider contract   | **CONFIRMED** (Socure, 2026-09-29) |
| runtime observation | **PENDING B1**                     |

### 2. Certification — precise wording

> Socure confirmed that its certification process is not a prerequisite to Launch. The amount of testing/certification evidence is left to the customer based on the confidence they require in their end-user experience.

State it that way, and not as the broader "certification is not required". The distinction that matters:

```text
Socure external certification gate:   NONE
ReFi internal KYC acceptance standard: REMAINS IN FORCE
```

Nothing in ReFi's release standard is weakened because Socure imposes no gate. B1, C, the Capture App check, webhook handling, reconciliation and the Production-readiness controls all stand exactly as written. What changes is only the authority we cite for them: they are ours, and must never be described — internally or in audit — as Socure-imposed.

### 3. B2 — FOUNDER DECISION: WILL NOT RUN

Socure confirmed that a synthetic Production evaluation's data "would be stored and theoretically could impact future risk decisions". Two of the four sub-questions are answered, both unfavourably:

| Sub-question                                | Socure answer                      |
| ------------------------------------------- | ---------------------------------- |
| Enters a persistent fraud/identity graph?   | **Yes — the data would be stored** |
| Can affect future risk decisions?           | **Yes, theoretically**             |
| Can it be marked as a test?                 | NOT ANSWERED                       |
| Can it, or should it, be removed afterward? | NOT ANSWERED                       |

Final classification, founder decision 2026-09-29:

```text
B2 — DocV failure → final negative outcome

deterministic implementation coverage:  PASS
Sandbox provider execution:             UNAVAILABLE BY SOCURE
Production provider execution:          WILL NOT RUN

reason: not required by Socure for Launch, and synthetic Production
evaluation data would be stored and could theoretically affect future
risk decisions
```

ReFi will not contaminate Socure's Production identity/risk data solely to exercise a failure path already covered deterministically. This is **not** an open gate and is no longer "optional / founder-gated" — the decision has been made. The §C4 Production procedure remains documented as a **dormant procedure** should circumstances materially change.

### 4. Socure status after this reply

```text
A   PASS

B1  REVIEW → DocV → ACCEPT
    Sandbox
    NOT RUN
    provider routing semantics CONFIRMED
    live observation pending

B2  DocV failure
    deterministic PASS
    Sandbox provider run unavailable
    Production run WILL NOT RUN

C   final REJECT
    Sandbox
    NOT RUN

D–L accepted

M   fixture PASS
    live repeat with B1 pending

Q5  CLOSED — Socure confirmed evaluation_completed
```

Remaining real Socure work:

1. Obtain the Consumer Onboarding Postman collection.
2. Complete the Sandbox Capture App dashboard check.
3. Run B1.
4. Run C.
5. Repeat M against B1.

Still worth obtaining, but blocking nothing: whether a Production evaluation can be marked as a test or purged, the booking link for the Postman walkthrough, and confirmation when the Test Cases tab defect is fixed.

Production RiskOS traffic remains NOT AUTHORIZED.
