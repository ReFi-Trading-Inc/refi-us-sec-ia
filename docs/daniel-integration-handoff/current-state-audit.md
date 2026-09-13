# Current-state audit — authoritative project model

**Status:** AUTHORITATIVE. Founder audit of 2026-09-13, verified against the
tree at main `28ada75f85aea4e34df7e3d9ee296c39c983ea67`.

**Supersedes:** the framing in any earlier summary that described auth, KYC,
Investor Profile / risk assessment, consent or compliance attestation as future
handoff work.

> **The central correction.** Auth, KYC, Investor Profile v2 / risk assessment,
> consent and compliance attestation are **not** future "handoff documentation"
> work. They are substantial ReFi-owned systems that already exist. The Daniel
> handoff is about **certifying and connecting** those systems into
> backend-owned membership, admission, brokerage, authorization, entitlement and
> PAPER execution.

Every factual claim below was re-verified by inspection; the verifying evidence
is named inline. Claims that could not be verified from the repository are
marked as such rather than asserted.

---

## 1. Authoritative lifecycle

```text
STYTCH AUTHENTICATION
  → REFI IDENTITY SUBJECT
  → DANIEL IDENTITY / ACCOUNT MAPPING
  → CLOSED-ALPHA MEMBERSHIP
  → INVESTOR PROFILE V2
  → DISCLOSURES + CONSENTS
  → SOCURE KYC
  → REFI COMPLIANCE DECISION / ATTESTATION
  → BACKEND CANONICAL ADMISSION
  → GENERAL REFI ACCOUNT ACCESS
  → ALPACA BROKERAGE CONNECTION        (may be done later)
  → BROKER SYNC / ACCOUNT TRUTH
  → ACCOUNT AUTHORIZATION
  → STRATEGY SUBSCRIPTION + ALLOCATION
  → COMMERCIAL ENTITLEMENT
  → BACKEND PAPER TRADING ELIGIBILITY
  → AUTOMATED PAPER EXECUTION
```

Three properties of this ordering are load-bearing and are the source of the
defect in §3:

1. **admission precedes brokerage**;
2. **brokerage may be connected later** — an admitted investor legitimately has
   general account access with no brokerage connection;
3. **membership, admission and AccountAuthorization are backend-owned.**

### Dependency spine

```text
AUTH + IDENTITY ──────────────┐
MEMBERSHIP ───────────────────┤
PROFILE ─┐                    │
KYC ─────┼─→ ATTESTATION ─────┼─→ ADMISSION
CONSENT ─┘                    │
                              ↓
                       BROKER CONNECTION
                              ↓
                         ACCOUNT SYNC
                              ↓
                    ACCOUNT AUTHORIZATION
                              ↓
               STRATEGY + ALLOCATION  +  COMMERCIAL ENTITLEMENT
                              ↓
                   PAPER TRADING ELIGIBILITY
                              ↓
                          EXECUTION
```

Terraform / GCP runs **underneath all of these** as the connected environment.
It is not an end-of-project hosting migration.

---

## 2. Domain state

| Domain                                  | State                                                                                                                                                                                                                                                                                                                                                                                                                        | Remaining for handoff                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Authentication — Stytch**             | **Substantially implemented.** `src/lib/auth/stytch.ts`, `login-flow.ts`, `api/v1/auth/login/{start,complete}`. Headless magic link + email OTP, server-only credentials. Stytch authenticates only; it creates no ReFi authority.                                                                                                                                                                                           | Connected acceptance against a real Stytch test environment                                                                    |
| **Identity bridge / connected session** | **Substantially implemented.** `identity-bridge.ts`, `identity-exchange.ts`, `connected-login.ts`, `connected-session.ts`. Stytch result → opaque ReFi subject → separate ES256 identity assertion → Daniel `exchangeIdentity` → verified backend identity → replay-protected durable session. Fails closed if the exchange is unavailable.                                                                                  | Real authenticated call to identity-ccid in `refinity-dev`; account binding; multi-instance durability                         |
| **Browser session**                     | Implemented BFF session projection (`AuthProvider` + `/api/v1/investor/session`). No client refresh; expiry means sign in again; account claims are never trusted for account operations.                                                                                                                                                                                                                                    | Connected acceptance                                                                                                           |
| **Closed-Alpha membership**             | **Missing backend projection.** Daniel confirmed a dedicated backend-owned membership object rather than inferring membership from onboarding status.                                                                                                                                                                                                                                                                        | Daniel contract/addendum + adapter                                                                                             |
| **Investor Profile v2 / risk**          | **Substantially implemented and first-class.** Deterministic server-side policy engine (`sec203a/investor-profile-engine.ts`); risk capacity, willingness, permitted band, product fit and consistency flags are **derived, not user-entered**. The legacy v1 form at `/us/onboarding/profile` is a `permanentRedirect` to v2, pinned by `contract-assertions.ts` so it can never become an independent questionnaire again. | Connected durable / system-of-record transition + attestation acceptance                                                       |
| **Profile persistence**                 | **Important gap.** Records still use `prototype-store`; the code states the eventual system of record is backend-owned. Draft concurrency is only safe inside the prototype model.                                                                                                                                                                                                                                           | Bind connected persistence; multi-instance semantics                                                                           |
| **Socure KYC**                          | **Substantial and provider-tested.** Real Sandbox immediate ACCEPT passed; webhook credential, duplicate event, unknown evaluation, restart and cross-instance durability passed.                                                                                                                                                                                                                                            | Scenario B (REVIEW→DocV) and C (REJECT) remain `BLOCKED — PROVIDER INPUT REQUIRED`; then connect trusted attestation to Daniel |
| **KYC UI / state machine**              | Implemented provider-neutral BFF lifecycle: `additional_info_required`, `under_review`, `passed`, `failed`, step-up, reconciliation.                                                                                                                                                                                                                                                                                         | Connected integration — **not** reimplementation                                                                               |
| **Disclosures / consent**               | Implemented as exact key + version + hash authority. Stale tuples fail closed.                                                                                                                                                                                                                                                                                                                                               | Connected Daniel acceptance                                                                                                    |
| **Compliance attestation**              | **Substantially implemented.** Exact consent prerequisites, deterministic idempotency, backend acknowledgment semantics, terminal vs retryable partitioning.                                                                                                                                                                                                                                                                 | Run against Daniel's connected API                                                                                             |
| **Canonical admission**                 | **Backend-owned; missing as a delivered independent projection.**                                                                                                                                                                                                                                                                                                                                                            | Daniel adds membership/admission contract; frontend reads it                                                                   |
| **Brokerage**                           | Substantial BFF implementation. Credentials one-shot. First connection correctly does **not** require AccountAuthorization — that would be circular.                                                                                                                                                                                                                                                                         | Daniel transport + Alpaca PAPER acceptance                                                                                     |
| **AccountAuthorization**                | **Contract shape already exists** — `PENDING / AUTHORIZED / DENIED / SUSPENDED` with reason codes, policy version and state version (verified in the alpha.3 contract package). Not a shape to invent.                                                                                                                                                                                                                       | Connected policy/acceptance and successor-contract verification                                                                |
| **Economic actions**                    | Existing adapter already requires `AUTHORIZED` for join / update-allocation; disengagement treated separately.                                                                                                                                                                                                                                                                                                               | Connected backend execution proof                                                                                              |
| **Strategy / allocation**               | Frontend domain model and BFF mechanics substantial; allocation bounds backend-owned and fail-closed.                                                                                                                                                                                                                                                                                                                        | Converge P1 UX into canonical onboarding after Daniel transport                                                                |
| **Commercial entitlement / Stripe**     | **Actually missing.** No Stripe runtime, no `CommercialEntitlement` model.                                                                                                                                                                                                                                                                                                                                                   | Design + implement (policy-gated)                                                                                              |
| **Canonical PAPER trading policy**      | **Missing as a single backend policy.** Individual gates exist; no authoritative `MAY_AUTOMATE_PAPER_TRADING` decision.                                                                                                                                                                                                                                                                                                      | Joint ReFi / Daniel contract                                                                                                   |
| **Execution**                           | Daniel/backend owns risk, orders, execution, fills, reconciliation.                                                                                                                                                                                                                                                                                                                                                          | Integrated PAPER campaign with separate real Alpaca Paper accounts                                                             |

---

## 3. Defect — canonical onboarding gate conflicts with the lifecycle

`apps/web/app/us/onboarding/_lib/setup-gate.ts` requires **all** of:

```text
OnboardingStatus = READY
AND AccountAuthorization = AUTHORIZED
AND identity / profile / broker complete
```

`setup-gate.test.ts` pins this explicitly, including a case named
_"there is no input that grants the dashboard without AUTHORIZED"_.

This contradicts §1. Because `AccountAuthorization` legitimately reports
`DENIED` with `BROKER_CONNECTION_MISSING` for an admitted account that has not
yet connected a brokerage, an admitted investor who defers brokerage **can
never reach the dashboard** — even though the confirmed lifecycle grants them
general account access at that point.

**Classification:** real defect in the canonical onboarding path, not in the
temporary `/us/product/*` pages.

**Constraint:** the fix is **runtime code** and is therefore blocked by the
demo freeze through 2026-09-16 unless the founder explicitly exempts it. Its
test is a pinned expectation, so the test changes with it — under the
source-of-truth hierarchy, a test contradicting approved architecture is a
**stale test, not truth**.

---

## 4. Route architecture

```text
/us/onboarding/*  = canonical BFF/onboarding path
/us/product/*     = temporary fixture-first adapter successor path
```

`/us/product/*` is intentionally temporary. Once Daniel's transport exists:
map his contract into `InvestorProductAdapter`, bring the accepted
brokerage/subscription UX into canonical onboarding, retire the duplicate.
**Do not build a third onboarding stack.** See
`docs/investor-product-design-decisions.md`.

---

## 5. Platform — GCP + Terraform

The connected US product deploys to **Google Cloud via Terraform**, targeting
the shared **`refinity-dev`** environment in **`us-west1`**. There is **no**
separate `refi-frontend-*` project family, and Vercel is **not** production
infrastructure.

```text
GCP ORGANIZATION / BILLING
└── refinity-dev
    ├── ReFi Next.js Web/BFF — Cloud Run
    ├── Daniel identity-ccid
    ├── Daniel investor-api
    ├── Firestore / connected durable state
    ├── Secret Manager
    ├── Cloud KMS
    ├── Artifact Registry
    ├── IAM / service identities
    └── Monitoring / Logging
later: refinity-stg, refinity-prod
```

### Terraform exists, but is not the connected configuration

The foundation is real and must be extended, not replaced: Firestore, Cloud Run
module, Artifact Registry, Secret Manager, Workload Identity,
`environments/{dev,staging,prod}`.

But `environments/dev` is **not** the connected Dev runtime — verified:

- `region` defaults to **`us-central1`**, not `us-west1`;
- `REFI_DATA_ADAPTER = "mock"`;
- **inline plaintext development secrets** as Cloud Run env vars
  (`SESSION_SECRET`, `IP_HASH_SECRET`, `ELIGIBILITY_JWT_SECRET` literals).

Staging/prod are an older generic deployment lacking the connected-auth
configuration.

**Additional finding, beyond the founder audit:** `infra/terraform/README.md`
frames **Vercel as the current host** and Cloud Run as "later", and instructs
running `terraform output -raw gcp_service_account_key_json` to paste a
**downloaded service-account key** into Vercel. That directly contradicts the
service-identity rule (no downloaded SA JSON keys). This README is stale and
actively misleading; correcting it is a prerequisite for the platform lane.

### What Terraform must own for connected Dev

Cloud Run Next.js/BFF · Artifact Registry · dedicated runtime service account ·
Workload Identity / GitHub deployment identity · Firestore connected durable
store · Secret Manager · **Cloud KMS: Investor API assertion P-256 key and
identity-bridge P-256 key (separate)** · IAM · Stytch server secret bindings ·
Socure bindings where appropriate · identity-ccid / investor-api audiences ·
Cloud Logging / Monitoring · outputs needed by `bff-dev.refi.trading`.

The application already supports separate KMS-backed Investor API and
identity-bridge signing; `.env.example` already describes the intended connected
configuration. What is missing is bringing that infrastructure into the correct
Terraform-managed environment.

---

## 6. Contract state

`contracts/investor-api/CURRENT.json` pins **`v1.1.0-alpha.3`** with
`package_content_sha256` provenance and, notably,
**`"connected_alpha_verified": false`**.

Daniel has since issued **alpha.4**; membership/admission/error corrections are
not yet in the frontend checkout. Early Daniel-track task:

```text
inspect latest Daniel contract → verify provenance/digest → migration diff
→ update generated client → rerun conformance
→ bind new independent membership/admission projections
```

Adopt his projections. **Do not invent them.**

---

## 7. Source-of-truth precedence

1. Latest explicit founder decisions + Daniel confirmations
2. Current owner-approved integration/lifecycle architecture
3. Latest dated certification evidence
4. Canonical product specifications
5. Current contract package
6. Current implementation / tests
7. Older historical decision docs / PR descriptions

A test contradicting a higher authority is a **stale test, not truth.**

### Stale artifacts requiring correction

| Artifact                                        | Problem                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `infra/terraform/README.md`                     | Frames Vercel as current host, Cloud Run as later; instructs downloading a SA key                                                    |
| `docs/decisions/DECISION_LOG.md`                | Older admission-ownership wording                                                                                                    |
| `docs/security/` Socure README                  | Pre-activation language overtaken by 2026-09-12 Sandbox evidence                                                                     |
| `README.md` (lines 68–69)                       | States a three-month trial default while the confirmed lifecycle leaves trial duration/start/pricing/grace as open founder decisions |
| `apps/web/app/us/onboarding/_lib/setup-gate.ts` | Outdated gating model — see §3 (runtime; freeze-blocked)                                                                             |

---

## 8. Engineering lanes

Parallel lanes with dependency gates — **not** one serial documentation project.

| Lane                                                 | Purpose                                                                  | Touches demo surface? |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | --------------------- |
| **A** Auth + identity connected certification        | Stytch → identity bridge → Daniel exchange → durable session             | yes                   |
| **B** KYC + profile + compliance certification       | Finish Socure provider cases; certify Profile v2; attestation to backend | yes                   |
| **C** Membership + canonical admission contract      | Adopt Daniel's projections; remove onboarding-state inference            | yes                   |
| **D** Terraform / GCP connected Dev                  | Build `refinity-dev/us-west1` via Terraform                              | **no**                |
| **E** Canonical onboarding convergence               | Fix connect-later flow (§3); merge P1 UX into `/us/onboarding/*`         | yes                   |
| **F** Brokerage + AccountAuthorization               | Connected Paper broker path, sync, backend authz                         | yes                   |
| **G** Stripe / CommercialEntitlement                 | Build the missing billing/entitlement subsystem                          | **no** (greenfield)   |
| **H** Strategy + allocation                          | Explicit subscription/allocation against backend authority               | yes                   |
| **I** Canonical PAPER eligibility                    | One backend policy — after C/F/G/H stabilise                             | —                     |
| **J** Integrated acceptance / security / reliability | Adversarial + two-positive/one-negative PAPER campaign                   | —                     |

**Freeze interaction:** lanes **D** and **G** are independent of the demo
surface and can run during the freeze. Lanes **A, B, C, E, F, H** modify
runtime the demo depends on and require the freeze to lift (2026-09-16) or an
explicit per-lane exemption. Lane G's _implementation_ is additionally gated on
founder commercial policy; its _architecture_ is not.

---

## 9. PR disposition

| PR             | Disposition                                                                                                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #114 / #115    | `PRESUMPTIVELY SUPERSEDED — DO NOT RETARGET`. Extract reusable tests/invariants only. See `baseline-audit.md` §3.                                                                                                                                                                                               |
| #98            | `PRESUMPTIVELY SUPERSEDED AS A DEPLOYMENT ARCHITECTURE` — built around a separate `refi-us-connected-investor` project and shell provisioning, inconsistent with the 2026-09-11 agreement. **Do not run the provisioning script as written.** Salvage IAM/KMS concepts into Terraform targeting `refinity-dev`. |
| #93 / #84      | Demo-specific; not the Daniel US product.                                                                                                                                                                                                                                                                       |
| #77            | Old global design migration. Separate design-system review, not part of the handoff; check against `investor-product-design-decisions.md` before it lands.                                                                                                                                                      |
| #43 / #7 / #14 | Older architecture stacks. Do not merge wholesale. Audit for narrowly reusable contract/domain material; close superseded history.                                                                                                                                                                              |

The handoff is built from current `main`, current Daniel contracts and current
owner-approved architecture — **not** by resurrecting old branches.

---

## 10. Readiness

| Dimension                                        | Assessment              |
| ------------------------------------------------ | ----------------------- |
| ReFi-owned onboarding / compliance functionality | **advanced**            |
| Backend integration contract                     | **partially connected** |
| Connected GCP environment                        | **not yet certified**   |
| Commercial entitlement                           | **missing**             |
| End-to-end automated PAPER Alpha                 | **not yet certified**   |

Remaining risk is primarily **integration correctness and canonical authority
convergence**, not volume of unbuilt features.

**Handoff status:** `NOT READY FOR DANIEL`.
