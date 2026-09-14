# Open Daniel decisions

Backend implementation and contract items requiring Daniel's authority.

**Rule:** nothing here may be unblocked by a plausible frontend invention. Each
row is `BLOCKED — DANIEL CONTRACT DECISION REQUIRED` until he answers, and the
frontend holds a fail-closed placeholder in the meantime.

**Do not mix founder/business-policy questions into this file** — those live in
`open-founder-decisions.md`.

Status vocabulary: `OPEN` · `ASKED` · `ANSWERED` · `SUPERSEDED`.

---

## D-A1 — Expose membership + admission in a machine-readable package

**Status:** `OPEN` · **Blocks:** Lane C, and transitively A, E, F, H
**Corrected twice — see history below.**

### Current state of fact (verified 2026-09-13; adoption landed on the handoff line)

**alpha.4 exists and is now adopted on `daniel-handoff/integration`.** It was
vendored byte-for-byte from `integration/refinity-dev` commit `09842e4` at
digest `a6db935b6a398bff00a7ccee4cb268ee565249bbd75c23e36594c9f6b698e7c3` and
re-verified on landing: `CURRENT.json` ↔ `bundle.json` agree, all 11 artifact
hashes and the package content digest recompute, and Daniel's
`tools/conformance.py validate` + `self-test` pass (python3.11). The client is
regenerated and pinned to alpha.4; alpha.3/alpha.2 stay vendored as history.

**Merge record (founder Tier 2 review complete, 2026-09-13):** PR #155,
reviewed head `3611307` (`36113072896527cfad0e7e793a4f28f82be147bc`), CI run
`34800004663` (Typecheck/Lint/Scan, Build, E2E production artifact, Security
scans — all SUCCESS), merge commit `019a6bf`
(`019a6bfa2de4238acebdf3a8107abc3a4a8385d8`) = new `daniel-handoff/integration`
head. **From this point alpha.4 is the current contract authority for the
handoff line.** Lanes F and H are never again certified against alpha.3.

**Subsequent merges on the handoff line (2026-09-13/14):** #158 Lane H fixes
(head `c4cdea6`, CI run 34802196817, merge `57680cf`); #156 Group A connected-dev
infrastructure with the deployment source corrected to `daniel-handoff/integration`
(reviewed head `915e77d`, CI run 34803445524, merge `ac11593`). GitHub branch
protection was then applied to `daniel-handoff/integration` and verified via the
API (required checks strict, admins enforced, PR required, no force push or
deletion). `terraform apply` of the trigger change remains gated on a
founder-reviewed credentialed plan. Then Tier 1: #159 Lane H detail-field
removal (merge `342d533`) and #160 funding notice (merge `77220c4`). Lane F's
paper-only read boundary is open as #161 (Tier 2, founder review).

`main` still pins alpha.3 (`5eca1200…`) during the release freeze; that is
expected and is not contract ambiguity. See
[`alpha4-reconciliation.md`](alpha4-reconciliation.md) §6 for the audit of the
rest of Daniel's branch.

### The ask is NOT "deliver alpha.4"

**Closed-Alpha cohort membership and canonical admission are absent from
alpha.4's machine-readable artifacts.** Precisely:

- `schemas.json` / `openapi.json` / `capabilities.json` / `contract.json`
  contain **no admission** object or operation.
- The word "membership" does appear in them — but only as
  `listAccountMemberships` (`AccountMembership`: `account_id`, `portfolio_id`,
  `template_id`, `allocation_percent`, `status ∈ ACTIVE | ENDED | PENDING`,
  version/fingerprint fields) and as `lineage.membership_fingerprint` /
  `membership_version` on a recommendation. That is the **portfolio
  allocation** membership (the result of `join_template`), byte-identical to
  alpha.3. It is **not** the closed-Alpha cohort membership of D-A2.
- Cohort membership and admission appear only as prose in `INTEGRATION.md`
  (10 mentions), which describes backend admission as already existing and
  initializing account state transactionally.

So the backend **has** admission; the frontend still has **no contracted way to
read it**, exactly as with alpha.3. #149's `OnboardingStatus === READY` proxy
stands until a package supplies the projection.

**Daniel's own status record on `integration/refinity-dev`
(`docs/alpha4-integration-status.md`, 2026-09-12) states: "Backend alpha.5 is
now issued/deployed in the separate GitLab repository, but is not adopted by
this merge … current backend membership/admission reads and normal disconnect
recovery are implemented."** We have not seen that package; it is not vendored
on any branch of this repository. If accurate, it is the answer to this row.

**Classification of the alpha.5 statement (founder, 2026-09-13):**
`EVIDENCE OF A POSSIBLE NEW CONTRACT — NOT YET FRONTEND AUTHORITY`. Nothing
is implemented from the status prose.

**The exact request to Daniel (founder-approved wording):**

> Please issue/provide the immutable frontend integration package
> corresponding to the backend alpha.5 membership/admission work, including
> the package digest and complete machine-readable artifacts (`contract.json`,
> `schemas.json`, `openapi.json`, `capabilities.json`, `examples.json`,
> bundle/digest record, migration notes and conformance tooling as
> applicable).
>
> We specifically need machine-readable operations/projections for:
>
> 1. `ClosedAlphaMembership`
> 2. canonical admission
>
> If alpha.5 exists only internally and has not yet been issued as a frontend
> package, please issue the successor package rather than sending field names
> in chat.

Delivery: onto a branch of this repository or as a directory we can vendor
byte-for-byte. We will not transcribe either projection from prose. Adoption
stays mechanical: verify digest → migration diff → regenerate client → rerun
conformance — exactly as done for alpha.4 (#155).

**D-A2 and D-A3 remain blocked until that package arrives. #149's admission
proxy does not change before then.**

### Correction history

1. Originally asked Daniel to "deliver alpha.4", per `README.md`.
2. Re-framed 2026-09-13 to "alpha.3 is current, there is no alpha.4" after an
   artifact search found none — **that search was truncated** and missed
   `integration/refinity-dev`.
3. Corrected again: alpha.4 exists and is authenticated, but **does not carry
   membership/admission**, so the underlying blocker never changed. Only its
   description did.
4. 2026-09-13: alpha.4 adopted on the handoff line. Daniel's status record
   claims a backend **alpha.5** with membership/admission reads; the ask is now
   that package, not a hypothetical successor.

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

## D-A4 — `AccountAuthorization` reason-code vocabulary and `SUSPENDED` lifecycle

**Status:** `OPEN — NARROWED 2026-09-13` · **Blocks:** Lane F (F-2 shape only)

`PENDING / AUTHORIZED / DENIED / SUSPENDED` with reason codes, policy version
and state version exists in the contract and is **not** ours to invent.

**Closed by the alpha.4 package (`lane-f-alpha4-audit.md` F4):**

1. ~~confirmation the shape is unchanged in alpha.4~~ — `AccountAuthorization`
   is byte-identical between alpha.3 and alpha.4 (`schemas.json` `$defs`
   compared programmatically).
2. ~~confirmation that `DENIED` + `BROKER_CONNECTION_MISSING` is the expected
   pre-connection steady state~~ — alpha.4 `INTEGRATION.md` §6 states it
   normatively ("An admitted account with no connection legitimately reports
   `DENIED` with `BROKER_CONNECTION_MISSING` … do not relabel DENIED as
   AUTHORIZED"); our code complies (first connection reads no authorization).

**Still needed — exact ask:**

> alpha.4 confirms the `AccountAuthorization` shape is unchanged, and
> INTEGRATION.md §6 confirms `DENIED` + `BROKER_CONNECTION_MISSING` is the
> legitimate pre-connection state — both closed. Residual: (a) `reason_codes`
> is declared only as the open pattern `^[A-Z][A-Z0-9_]{1,63}$` with no enum
> and no non-AUTHORIZED example (`examples.json` carries only
> `{"status":"AUTHORIZED","reason_codes":[]}`); please supply the complete
> enumerated reason-code vocabulary, or state that it is intentionally open and
> clients must key behaviour only on `status`. (b) What transitions an account
> into `SUSPENDED`, and who clears it?

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

**Status:** `ASKED — RE-PINNED TO alpha.4 2026-09-13` — see
`docs/releases/2026-09-signal/connected-dev/daniel-dependency-packet.md`

alpha.4 `contract.json` `brokerage_mutation` is byte-identical to alpha.3: it
still excludes `ACCOUNT_AUTHORIZATION_REQUIRED` and
`ACKNOWLEDGMENT_BINDING_INVALID`, and `403` is absent from its status set
(unlike `allocation_mutation` / `preference_mutation`). alpha.4 answers
"unchanged", not "never emitted". Exact ask:

> Is that a guarantee the backend never emits either code from brokerage
> disconnect, or an omission to be corrected in the next package? Our
> disconnect adapter fails closed on both as contract mismatches until you
> answer.

D-A6 note (same date): alpha.4 adds no attestation/profile schema and answers
none of D-A6's four needs; they stand as written.

---

## D-A8 — Recommendation contract defects found on alpha.4 adoption

**Status:** `OPEN` · **Blocks:** Lane H (H-PR1 shape; fan-out removal) ·
Evidence: `lane-h-alpha4-audit.md`

**D-A8a — attach or remove the orphaned `Freshness` schema.**

> `v1.1.0-alpha.4/schemas.json` defines `$defs.Freshness` (`source_as_of`,
> `last_evaluated_at`, `fresh_until`, `expires_at`, `freshness_status`,
> `freshness_policy_version`, `freshness_reason_codes`, all required) and
> `openapi.json` publishes it under `components.schemas`, but neither file
> contains a single `$ref` to it. `Recommendation` and `RecommendationSummary`
> carry flat `freshness_status` / `fresh_until` / `expires_at` and no
> evaluation time or policy version. Please either (a) `$ref` `Freshness` from
> the recommendation shapes or (b) delete it from the package. We render blanks
> rather than fabricate, and will remove those fields on (b).

**D-A8b — pin the `lifecycle_status` and `freshness_status` vocabularies.**

> Both are `{"type": "string"}` with no `enum` on `Recommendation` and
> `RecommendationSummary`, and alpha.4's own `examples.json` is inconsistent in
> case (`RecommendationEnvelope.freshness_status = "fresh"` vs
> `AccountPositionEnvelope` / `TemplateEnvelope` `= "FRESH"`). We need either
> (a) an `enum` per field per shape, or (b) an explicit statement that both are
> open, case-insensitive sets — in which case we normalise on read and never
> key UI or test selectors off the raw value.

**D-A8c — expose `template_id` on `RecommendationSummary`.**

> `listAccountRecommendations` returns `RecommendationSummary`, which has no
> `template_id` and no `lineage`. Template identity is recoverable only from
> `funding_assessment.input_versions.template_id`, and FUNDING.md states
> historical assessments are `null` and never recomputed — so for any list
> containing history most rows have no template identity. Our BFF fills the
> gap with bounded `getAccountRecommendation` calls: worst case 4 pages × 100
> items = 400 detail fetches in 100 sequential rounds of 4 — 404 upstream calls
> for one list request, with no cache layer. `RecommendationSummary` already
> carries a lineage-derived field (`output_fingerprint`, required), so adding
> `template_id` (required, same pattern as `lineage.template_id`) is consistent
> with the shape's design. We will delete the fan-out the day it lands.

**D-A8d (minor) — `allocation_percent` is a fraction.** Founder decided
2026-09-14: **document, do not rename** — a rename would break your existing
integrators for a naming preference. The ask is the one-line description only.

> `allocation_percent` on `AllocationPreview`, `AllocationPreviewRequest`,
> `AccountActionRequest.parameters` and `AccountMembership` uses
> `^(?:0\.(?:0*[1-9][0-9]*)|1(?:\.0+)?)$`, i.e. (0, 1]. The name reads as
> percentage points — a live unit hazard of exactly the kind alpha.3→alpha.4
> already corrected for turnover. If renaming is off the table, a one-line
> `description` stating "decimal fraction in (0, 1], not percentage points" on
> each occurrence would close it.

---

## D-A9 — `Idempotency-Key` semantics

**Status:** `OPEN` · **Blocks:** nothing today (we keep parameter-derived keys)
· Evidence: `lane-f-alpha4-audit.md` F5

> `IDEMPOTENCY_KEY_REUSED` appears in five error profiles but is defined
> nowhere in `openapi.json` or `INTEGRATION.md`. Please state normatively:
> (a) same key + different body — rejected with 409 `IDEMPOTENCY_KEY_REUSED`,
> or replays the first result? (b) the key persistence window; (c) behaviour
> for two concurrent in-flight requests with the same key. Until (a) is
> explicit we keep idempotency keys derived from the economic parameters, not
> a client-supplied operation id.

---

## D-A10 — Connected identity binding facts (step 4 / B1 / ATD-046)

**Status:** `OPEN` · **Blocks:** Lane A · Exact wording and the six frontend
facts we must transmit first: `lane-ab-dependency-audit.md` "Daniel asks" 1–6
(identity-result `iss`/`aud` pair, upstream assertion binding, ALLOW_REMOTE
addendum, `amr` retention, backend KYC expectations at attestation,
attestation idempotency).

---

## How to answer

A short written reply against the IDs above is sufficient for everything except
D-A1, which needs the package. Answers are recorded back here with status
`ANSWERED` and the date, then folded into the contract adoption PR.
