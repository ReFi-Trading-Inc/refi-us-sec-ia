# Open Daniel decisions

Backend implementation and contract items requiring Daniel's authority.

**Rule:** nothing here may be unblocked by a plausible frontend invention. Each
row is `BLOCKED — DANIEL CONTRACT DECISION REQUIRED` until he answers, and the
frontend holds a fail-closed placeholder in the meantime.

**Do not mix founder/business-policy questions into this file** — those live in
`open-founder-decisions.md`.

Status vocabulary: `OPEN` · `ASKED` · `ANSWERED` · `SUPERSEDED`.

---

## D-A1 — Deliver the alpha.4 contract package

**Status:** `OPEN` · **Blocks:** Lane C, and transitively A, E, F, H

This checkout imports and generates **`v1.1.0-alpha.3`**
(`contracts/investor-api/CURRENT.json`, `connected_alpha_verified: false`). The
issued backend package is **alpha.4**, carrying funding assessments and
corrected recommendation responses. Only alpha.2 and alpha.3 exist in the repo.

**Needed:** the alpha.4 package itself, in the same shape as alpha.3 —
`contract.json`, `schemas.json`, `openapi.json`, `examples.json`,
`capabilities.json`, `MIGRATION.md`, plus a `package_content_sha256` we can pin
in `CURRENT.json`.

**We will not** hand-transcribe alpha.4 from prose. Adoption is:
verify digest → migration diff → regenerate client → rerun conformance.

---

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

**Status:** `OPEN` · **Blocks:** Lane I; depends on D-A2, D-A3, D-A4 and
founder policy F-G1

There is no single authoritative `MAY_AUTOMATE_PAPER_TRADING` decision today —
individual gates exist and independently approximate it, which is the failure
mode to avoid.

**Needed:** one backend-owned policy operation returning allowed/denied,
normalized denial reasons, the evaluated rule version and a timestamp.

**Note:** its prerequisite list includes commercial entitlement, which is
blocked on founder policy — so this cannot be finalized from the backend side
alone.

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
