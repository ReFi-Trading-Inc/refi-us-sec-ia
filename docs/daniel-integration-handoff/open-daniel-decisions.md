# Open Daniel decisions

Backend implementation and contract items requiring Daniel's authority.

**Rule:** nothing here may be unblocked by a plausible frontend invention. Each
row is `BLOCKED — DANIEL CONTRACT DECISION REQUIRED` until he answers, and the
frontend holds a fail-closed placeholder in the meantime.

**Do not mix founder/business-policy questions into this file** — those live in
`open-founder-decisions.md`.

Status vocabulary: `OPEN` · `ASKED` · `ANSWERED` · `SUPERSEDED`.

---

## D-A1 — Issue membership/admission in a successor contract package

**Status:** `OPEN` · **Blocks:** Lane C, and transitively A, E, F, H
**Corrected 2026-09-13 — there is no alpha.4.**

### What the earlier framing got wrong

This item previously asked Daniel to "deliver the alpha.4 package", following
`README.md:101` ("the backend's currently issued package is alpha.4"). **That
claim is false**, confirmed by the founder and by artifact search:

- our checkout pins `v1.1.0-alpha.3`, digest `5eca1200…`;
- Daniel's own backend checkout (`refinity-main-main-Sept-10-2026`) pins
  **the same version and the same digest**;
- no `alpha.4` artifact exists in any local repository or sibling checkout.

**`v1.1.0-alpha.3` is the current contract, and we are already in sync with
it.** There is no package to chase, and the README line has been corrected.

### The real ask

Membership and canonical admission are **absent from the alpha.3 package**: a
search across its `contract.json`, `schemas.json`, `openapi.json`,
`examples.json` and `capabilities.json` returns nothing. They appear only in
`INTEGRATION.md` **prose**, which says backend admission already exists and
initializes canonical account state transactionally when attestation and
consent complete.

So the backend **has** admission; the frontend simply has no contracted way to
read it. What is needed is a successor package (alpha.5, or whatever he
numbers it) exposing the projections in **D-A2** and **D-A3**, in the same
shape as alpha.3 — `contract.json`, `schemas.json`, `openapi.json`,
`examples.json`, `capabilities.json`, `MIGRATION.md`, plus a
`package_content_sha256` we can pin in `CURRENT.json`.

We will **not** transcribe either projection from `INTEGRATION.md` prose.
Adoption stays mechanical: verify digest → migration diff → regenerate client
→ rerun conformance.

## D-A2 — ClosedAlphaMembership projection

**Status:** `OPEN` · **Blocks:** Lane C

Confirmed as a dedicated backend-owned object rather than something inferred
from onboarding status. It is absent from every contract package we hold — a
grep for membership/admission across alpha.3 returns nothing.

**Needed:**

1. read operation name and path;
2. the state set (at minimum: absent, invited, invitation expired, accepted,
   active) with exact spellings;
3. whether an **accepted** membership survives invitation expiry — we assume
   yes and must not encode the assumption;
4. version / state-version field for concurrency;
5. whether membership is account-scoped or subject-scoped.

---

## D-A3 — Canonical admission projection

**Status:** `OPEN` · **Blocks:** Lane C; currently forces a proxy in Lane E

Backend is the sole canonical admission authority; the frontend must never
implement equivalent hidden logic. There is no admission projection in the
issued contract, so `setupGate` currently uses `OnboardingStatus.state ===
READY` as the nearest backend-**stated** signal. That is a documented proxy,
not a redefinition, and must be re-pointed the moment this lands.

**Needed:**

1. read operation name and path;
2. the state set — we expect at least `ADMITTED` / `HELD` / `REVOKED`, plus any
   backend-defined precursor state;
3. reason codes for non-admitted states;
4. rule version and evidence provenance fields;
5. whether history is exposed or only current state;
6. state version.

---

## D-A4 — Is the alpha.3 `AccountAuthorization` shape final?

**Status:** `OPEN` · **Blocks:** Lane F

`PENDING / AUTHORIZED / DENIED / SUSPENDED` with reason codes, policy version
and state version already exists in alpha.3 and is **not** ours to invent.

**Needed:**

1. confirmation the shape is unchanged in alpha.4;
2. the **enumerated** reason-code set — we currently key behaviour off
   `BROKER_CONNECTION_MISSING` and need the complete list;
3. confirmation that `DENIED` + `BROKER_CONNECTION_MISSING` is the expected
   steady state for an admitted investor who has not yet connected a brokerage
   (this underpins the Lane E separation of account access from economic
   permission);
4. what transitions `SUSPENDED` and who clears it.

---

## D-A5 — Canonical PAPER trading-eligibility policy

**Status:** `OPEN` · **Blocks:** Lane I · **Depends on:** D-A2, D-A3, D-A4
**Founder policy: RESOLVED 2026-09-13** — no longer blocked on our side.

There is no single authoritative `MAY_AUTOMATE_PAPER_TRADING` decision today —
individual gates exist and independently approximate it, which is exactly the
failure mode to avoid.

**Needed:** one backend-owned policy operation returning allowed/denied,
normalized denial reasons, the evaluated rule version and a timestamp.

### The composition is now decided (founder, F-G10)

Closed Alpha participation is **free, invite-and-admission gated, NOT
commercial-plan gated**. This removes what would otherwise have been the
blocking unknown, and it constrains the policy:

```text
MAY_PARTICIPATE_IN_ALPHA =
    CLOSED_ALPHA_MEMBERSHIP_ACTIVE
  + ADMISSION_STATE = ADMITTED
  + REQUIRED_CONSENTS_CURRENT
  + NO_BLOCKING_HOLD

MAY_AUTOMATE_PAPER_TRADING =
    MAY_PARTICIPATE_IN_ALPHA
  + PAPER_AUTOMATION_ENTITLEMENT
  + REQUIRED_TRADING_CONTROLS_SATISFIED
```

Two consequences for the backend policy:

1. **A commercial plan must not appear in the Alpha eligibility rule.**
   `plan == PRO` or similar is never the authorization condition during Alpha.
   A paid subscription is not a prerequisite for paper automation.
2. **`PAPER_AUTOMATION_ENTITLEMENT` is a separate capability**, not a
   projection of billing state. It may become plan-sensitive after commercial
   launch, but only as a layer **on top of** regulatory and operational
   eligibility — never as a substitute for it.

**Question for you:** does the backend already model a per-account capability
of this shape, or is `PAPER_AUTOMATION_ENTITLEMENT` a new field? If new, we need
its name, values and who writes it.

### Also decided: no `TRIALING`

Founder F-G3: there is no commercial free trial. Closed Alpha is the free
evaluation environment. Please do not model a billing trial state in any
eligibility input.

---

## D-A6 — System of record for Investor Profile v2 and attestation

**Status:** `OPEN` · **Blocks:** Lane B

Profile records still use `prototype-store`; the code states the eventual
system of record is backend-owned. Draft concurrency is only safe inside the
prototype model.

**Needed:**

1. whether the backend stores the profile assessment result, the answer
   snapshot, both, or neither;
2. if backend-owned: the write operation, idempotency semantics and transaction
   boundary;
3. multi-instance concurrency expectations for drafts;
4. retention expectations for answer snapshots.

---

## D-A7 — `brokerage_mutation` error profile

**Status:** `ASKED` — see
`docs/releases/2026-09-signal/connected-dev/daniel-dependency-packet.md`

Carried forward so it is not lost. We will not normalise either response until
answered.

---

## How to answer

A short written reply against the IDs above is sufficient for everything except
D-A1, which needs the package. Answers are recorded back here with status
`ANSWERED` and the date, then folded into the contract adoption PR.
