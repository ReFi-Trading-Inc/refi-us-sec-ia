# Phase 2.7 Daniel Contract-Mechanics Resolution

**Date:** 2026-08-17
**Source:** Daniel's written reply to the 2026-08-08 six-question ask
(received 2026-08-17).
**Status:** **Authoritative.** Second Daniel message with verifiable written
provenance. It answers the interface mechanics left open by
[`phase2-7-daniel-direction-resolution.md`](phase2-7-daniel-direction-resolution.md);
it does not overturn any decision recorded there.

**Closes:** D-012, D-013, D-014, D-015, D-017, D-018 (all previously OPEN in
[`decisions/DECISION_LOG.md`](decisions/DECISION_LOG.md)). Partially closes
D-010. Dates D-011.

**Relationship to the July direction:** additive. The July message decided
_who owns what_; this one specifies _how the frontend talks to it_. Where this
document adds detail to a July section, both stand.

---

## 1. Owning services and investor-facing projections (closes D-012)

### Daniel's direction

Ownership splits three ways:

| State                                                                                                                                    | Owning service                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Authenticated identity, stable `user_id`, initial user/account membership                                                                | `identity-ccid`                                               |
| KYC-provider exchange, normalized KYC result                                                                                             | `compliance-adapter`                                          |
| Durable eligibility decisions, versioned advisory profiles, disclosure registry, consent receipts, derived account trading authorization | investor authorization domain, exposed through `investor-api` |

Investor-facing route groups:

- `GET /api/v1/investor/onboarding/status`
- `GET|POST /api/v1/investor/eligibility`
- `GET /api/v1/investor/kyc`
- `GET|POST /api/v1/investor/advisory-profiles`
- `GET /api/v1/investor/advisory-profiles/current`
- `GET /api/v1/investor/disclosures`
- `GET|POST /api/v1/investor/consents`
- `GET /api/v1/investor/accounts/{account_id}/authorization`

Advisory profiles are **append-only versions**. The disclosure registry keeps
document key, version, content hash, effective date, status, and content
reference. The initial Records Center references the exact profile, disclosure,
consent, and template versions used for each decision.

### What this resolves

The open half of D-012 — the owning service and route per state object. It also
answers the two specific unknowns: versioned advisory-profile state and the
disclosure document registry are both owned by the investor authorization
domain behind `investor-api`, not by the frontend and not by `compliance-adapter`.

`compliance-adapter` owns only the KYC exchange and its normalized result. KYC
is therefore **read-only** to the investor product (`GET` only), while
eligibility and consents accept writes.

### Phase 2.7 interpretation

- Interim frontend records (advisory profile versions, disclosure
  acknowledgments, consent receipts) remain exportable but stay explicitly
  marked **not authoritative** until these projections connect — the same
  posture already set for preferences in July §4.
- `advisory-profiles` being append-only means the frontend must never model a
  profile edit as an in-place update. A change is a new version; "current" is a
  separate read.
- The disclosure registry's `content_hash` is the binding identity for an
  acknowledgment. Acknowledging a disclosure by key alone is insufficient —
  key + version + hash travel together (this is also what the §4 `409` returns).
- `GET .../accounts/{account_id}/authorization` is the single read for derived
  trading authorization. The frontend must not recompute authorization from
  KYC + eligibility + profile status.

**Mock-replacement grouping** (extends July §7): onboarding status, eligibility,
KYC, advisory profiles, disclosures, and consents form one replacement group
keyed to these six route groups; account authorization joins the "accounts and
templates" group.

---

## 2. BFF→investor-api user assertion (closes D-017)

### Daniel's direction

`v1.0.0-dev.1` defines this separately from the Google OIDC service credential.

| Element          | Value                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Header           | `X-Refinity-User-Assertion`                                                                                                          |
| Signing          | BFF-signed **ES256** JWT                                                                                                             |
| Issuer           | stable environment-specific issuer — **not** a Vercel preview URL                                                                    |
| Key distribution | BFF publishes a **JWKS**; investor-api fetches/caches it and supports `kid`-based rotation                                           |
| Audience (dev)   | `urn:refinity:investor-api:dev`                                                                                                      |
| Verification     | investor-api pins issuer and audience                                                                                                |
| Max TTL          | **2 minutes**                                                                                                                        |
| Required claims  | `iss`, `aud`, `sub`, `iat`, `nbf`, `exp`, `jti`, `sid`, `auth_time`, and `amr` or `acr`                                              |
| `sub`            | the stable backend `user_id`                                                                                                         |
| `auth_time`      | time of the **underlying user authentication**, not the time the BFF minted the assertion                                            |
| Minting          | one assertion **per BFF→backend call**, unique `jti`                                                                                 |
| Replay           | governed by `jti` **and** `Idempotency-Key`; exact repeat may return its existing receipt, reuse for a different request is rejected |
| Account IDs      | **not** in the assertion; investor-api resolves and re-authorizes account ownership server-side on every account request             |

The exact BFF issuer and JWKS URL are pinned in the dev connection sheet.

### Phase 2.7 interpretation

- Two distinct signed assertions now both stand fully specified: identity-ccid→BFF
  (July §1) and BFF→investor-api (this section). They are not interchangeable.
- **`auth_time` propagation is load-bearing twice over.** It is the input to the
  step-up rule in §5. Minting a fresh assertion from an old session deliberately
  does not advance it. The BFF must therefore carry `auth_time` through from the
  identity-ccid assertion into its own session record, and must never substitute
  "now".
- **The issuer constraint has an infrastructure consequence.** Vercel preview
  deployments get per-deployment URLs; the issuer must be a stable
  environment-specific value regardless. The BFF needs a configured issuer
  identity and a stable JWKS URL that survives redeploys — this is a deployment
  task, not a code constant, and it belongs in the dev connection sheet exchange.
- **Key management is now on our side of the boundary.** The BFF holds an ES256
  private key, publishes the public JWKS, and must support rotation by `kid`.
  Key storage, rotation procedure, and JWKS caching semantics need a written
  runbook before the first integration call.
- A 2-minute TTL with per-call minting means no assertion caching and no
  assertion reuse across a fan-out. Clock skew tolerance must be small.
- Because account IDs are absent from the assertion and re-authorized
  server-side, the BFF's own ownership check remains defence-in-depth only
  (unchanged from July §3).

---

## 3. Recommendation freshness (closes D-013)

### Daniel's direction

Freshness is **backend-owned** and may vary by strategy/source and market
schedule. The provisional two-hour and 24-hour thresholds must **not** become
contract constants.

Recommendation projections carry:

- `source_as_of`
- `last_evaluated_at`
- `fresh_until`
- `expires_at`
- `freshness_status` — `fresh` | `stale` | `expired`
- `freshness_policy_version`
- freshness reason codes when not fresh

The frontend displays those values rather than inferring freshness from the age
of the recommendation or account-intent record. **`blocked` remains an
authorization, risk, or control outcome — not a freshness state.**

### What this invalidates

The provisional Phase 2.5 thresholds (fresh ≤ 2h, stale 2h–24h, blocked > 24h),
carried unconfirmed since Phase 2.5. They are now formally dead and must not be
reintroduced as constants anywhere in the codebase.

Also invalidated: any UI that derives staleness by comparing `generatedAt` or
`ts_utc` to the current clock.

### Phase 2.7 interpretation

- `freshness_status` and `RecommendationStatus` are **orthogonal axes**. A
  recommendation can be `open` + `stale`, or `blocked` + `fresh`. The existing
  `blocked` member of `RecommendationStatus` keeps its authorization/risk/control
  meaning and must never be set from a freshness computation.
- `expires_at` on the projection is superseded in meaning: it is now one field
  of a backend-owned freshness envelope, not a frontend-evaluated deadline.
- A tripwire is warranted: no freshness threshold constant may exist in the
  frontend. See §7.

---

## 4. Preference re-acknowledgment (closes D-014)

### Daniel's direction

**Mutation response is the authoritative flow.** No policy preflight endpoint in
the initial contract.

A proposed `PATCH /preferences` that expands trading and lacks the required
current acknowledgment makes **no change** and returns **`409` with
`ACKNOWLEDGMENT_REQUIRED`**. The response includes:

- policy version
- required disclosure key / version / hash
- effective date
- continuation reference
- correlation ID

After the acknowledgment is recorded, the client retries the same preference
change carrying the consent-receipt reference.

The backend re-evaluates policy on the final mutation, so the frontend must not
independently classify a change as restrictive or expanding.

### Phase 2.7 interpretation

- The `409` is a **normal control-flow outcome**, not an error state. It must
  not surface as a generic failure toast, and it must not be retried blindly by
  any HTTP retry layer. This interacts with the July §3 rule "no blind mutation
  retry" — a `409 ACKNOWLEDGMENT_REQUIRED` is resolved by the disclosure flow,
  never by a retry.
- The flow is a three-step loop, all backend-adjudicated:
  1. `PATCH /preferences` → `409 ACKNOWLEDGMENT_REQUIRED` + disclosure ref
  2. disclosure flow → `POST /api/v1/investor/consents` → consent receipt
  3. retry the **same** `PATCH /preferences` + consent-receipt reference
- The retry must reuse the same intended preference payload. Whether it reuses
  the original `Idempotency-Key` or takes a new one is unspecified; the safe
  reading given §2's replay rule ("reuse for a different request is rejected")
  is a **new** `Idempotency-Key` for the retry, since the request body now
  differs by the consent-receipt reference. **Verify against `v1.0.0-dev.1`.**
- No frontend "will this need re-acknowledgment?" prediction. The UI cannot
  pre-warn before submission; the disclosure step appears in response to the
  `409`. Preference-form copy should be written accordingly.
- The `continuation reference` implies the backend correlates the `409` with the
  eventual retry. Carry it through the disclosure flow rather than dropping it.

---

## 5. Step-up authentication (closes D-015)

### Daniel's direction

**Signal-only first release:** `join_template`, `leave_template`, and preference
changes require **no** step-up beyond a valid authenticated session. A
trading-expanding preference change still requires the §4 disclosure
re-acknowledgment.

**Managed contract — step-up required before:**

- `resume_autopilot`
- disabling an investor `reduce_only` request
- joining a template **when that action activates Managed automation**
- a trading-expanding preference change in Managed mode
- the future `liquidate_all`

**Step-up NOT required for:** pause, enabling reduce-only, leaving a template,
restrictive preference changes.

**Mechanism:** investor-api enforces a maximum underlying `auth_time` age of
**10 minutes**. If step-up is needed it returns `STEP_UP_REQUIRED` with a
short-lived challenge **bound to user, account, action, and idempotency key**.
The BFF then performs fresh authentication through `identity-ccid` and retries
with an assertion carrying the new underlying `auth_time`. **Merely minting a
new BFF assertion from an old session does not satisfy step-up.**

### Phase 2.7 interpretation

- The organizing principle is **relaxation of a control requires step-up;
  tightening never does.** `join_template` is the one action whose requirement is
  mode-dependent — the same verb needs step-up only when it activates Managed
  automation. The frontend cannot determine that; the backend answers with
  `STEP_UP_REQUIRED` or does not.
- Consistent with §4, the frontend does not pre-classify. It reacts to
  `STEP_UP_REQUIRED` the way it reacts to `ACKNOWLEDGMENT_REQUIRED`.
- The challenge binding to **idempotency key** means the retry after step-up
  must carry the same `Idempotency-Key` as the challenged request — the opposite
  of the §4 re-acknowledgment retry, where the body changes. Do not conflate the
  two retry flows.
- Step-up is a **round trip through identity-ccid**, not a BFF-local operation.
  Until identity-ccid deploys, no step-up path can be exercised end to end. This
  is acceptable for `v1.0.0-dev.1` because no Signal-only action requires
  step-up.
- **Cross-check to record:** `auth_time` max age of 10 minutes vs. the assertion
  TTL of 2 minutes. These are different clocks — assertion freshness vs.
  underlying authentication freshness. A valid 2-minute assertion can still
  carry a 40-minute-old `auth_time` and be rejected for step-up.

---

## 6. Signal-only action surface (closes D-018, partially D-010)

### Daniel's direction

For `v1.0.0-dev.1`, enabled:

- `join_template`
- `leave_template`
- preference updates through the dedicated **`PATCH /preferences`** route

Preference updates create the same immutable action receipts but **must not be
exposed as a second public write path through `/actions`**.

`pause_autopilot`, `resume_autopilot`, `reduce_only` stay unavailable until
Managed paper. `liquidate_all` remains deferred. The `/actions` surface is not
gated wholesale; the initial allowlist is limited to Signal-relevant actions,
with no path to broker submission.

### What this changes on our side

**`update_prefs` is no longer a client-emittable `/actions` verb.** It remains a
real backend action-receipt kind, but the only public write path is
`PATCH /api/v1/investor/accounts/{account_id}/preferences`. Our
`INVESTOR_ACTION_TO_ADMIN_VERB` mapped `updateAccountPrefs → update_prefs`,
which would have produced exactly the second write path Daniel is excluding.
That mapping is removed. See §7.

The client-emittable `/actions` allowlist is therefore:

| Verb               | `v1.0.0-dev.1` (Signal)                         | Managed paper                               |
| ------------------ | ----------------------------------------------- | ------------------------------------------- |
| `join_template`    | enabled                                         | enabled (step-up when it activates Managed) |
| `leave_template`   | enabled                                         | enabled                                     |
| `pause_autopilot`  | gated                                           | enabled (no step-up)                        |
| `resume_autopilot` | gated                                           | enabled (step-up)                           |
| `reduce_only`      | gated                                           | enabled (step-up to disable only)           |
| `update_prefs`     | **not client-emittable — `PATCH /preferences`** | same                                        |
| `liquidate_all`    | deferred                                        | deferred                                    |

### Confirmed assumptions (D-010 and A-001)

Daniel confirmed all four working assumptions:

- **Template discovery** — dedicated investor-api projection, not the Admin
  Portal route. (D-016 confirmation holds.)
- **Streaming** — browser subscribes through the BFF-proxied SSE route;
  investor-api performs the authoritative account filter before emitting any
  event. (A-001 confirmed.)
- **Action wire shape** — the existing action envelope. `join_template` and
  `leave_template` carry `parameters.template_id`. Managed `reduce_only` carries
  `parameters.enabled` as a **boolean**; disabling it is a control relaxation and
  takes the §5 step-up rule. **This closes the substantive half of D-010** —
  reduce-only is a plain action in the standard envelope, not a distinct
  account-control request shape. The literal spelling still gets verified against
  the exported contract on receipt.
- **Connection package** — URL, Google OIDC audience, WIF identifiers, seeded
  IDs, and deployed contract/image revision arrive together after the first
  investor-api deployment.

### Deployment timing (dates D-011)

Daniel: deployment target **about two weeks** (≈ 2026-08-31 from the 2026-08-17
reply — approximate, stated informally), with the connection package following
**after** the service and dev fixtures are available. D-011 stays BLOCKED but is
no longer undated.

---

## 7. Code changes required

Applied in this pass:

1. **`apps/web/src/lib/sec203a/admin-verbs.ts`**
   - `update_prefs` moved out of the client-emittable allowlist into a
     receipt-only category; `updateAccountPrefs → update_prefs` mapping removed
     so no route can emit the second write path.
   - Signal-only enabled subset added as an explicit constant.
   - `parameters` shapes recorded for `join_template` / `leave_template` /
     `reduce_only`.
2. **`scripts/contract-assertions.ts`** — allowlist assertions updated to the
   new membership and the Signal-only subset; assertion that
   `adminVerbFor("updateAccountPrefs")` is `undefined`.
3. **`apps/web/src/lib/sec203a/freshness.ts`** (new) — the backend-owned
   freshness envelope type, with a tripwire-backed prohibition on threshold
   constants.
4. **`apps/web/src/lib/sec203a/step-up.ts`** (new) — the `STEP_UP_REQUIRED` and
   `ACKNOWLEDGMENT_REQUIRED` control-flow response shapes, the Managed step-up
   matrix as documentation-grade reference data, and the explicit rule that the
   frontend does not pre-classify.

5. **`apps/web/src/lib/investor-api/user-assertion.ts`** (new) — the ES256
   signer: header/alg/TTL constants, required-claim lists, per-call minting with
   unique `jti`, issuer validation that rejects preview-shaped hosts outside
   dev, key resolution (ephemeral in dev, required elsewhere), and JWKS assembly
   with rotation overlap. `mintUserAssertion` throws rather than substituting
   `now` for a missing `auth_time`.
6. **`apps/web/app/.well-known/jwks.json/route.ts`** (new) — publishes the
   public JWKS at the stable path investor-api fetches. Verified serving.
7. **`apps/web/src/lib/config/env.ts`** — `BFF_ASSERTION_ISSUER`,
   `INVESTOR_API_AUDIENCE`, and the two optional key variables. The signing key
   deliberately has no committed default.
8. **`apps/web/src/lib/bff/auth.ts`** — `AuthContext` gained `sid`, `authTime`,
   `amr`, `acr`, read from the session token and never synthesised.
9. **`apps/web/src/lib/investor-api/routes.ts`** (new) — the route constants
   from §1 plus the account-scoped actions/preferences/events routes, with the
   ownership split and the mock-replacement grouping recorded.
10. **`.../entities/recommendation-projection.ts`** — carries the freshness
    envelope; `expiresAt` deprecated in place.
    > **STATE CORRECTION (2026-08-22): NOT on `main`, deliberately.** The
    > freshness attachment was implemented in the working pass this section
    > describes, but withheld when the work landed (PR #46): the single-symbol
    > `RecommendationProjection` — which still carries an `executing` status —
    > was superseded by the direct-index `AccountRecommendation` model in
    > Daniel's September architecture, and wiring the envelope into a model
    > about to be replaced would have been churn. Only the freshness
    > **primitive** (`sec203a/freshness.ts`) and its anti-threshold tripwire
    > landed; the consumer arrives with the new recommendation model. See
    > `docs/releases/2026-09-signal/open-items.md`.
11. **`.../entities/disclosure-acknowledgement.ts`** — acknowledgments now
    record the `contentHash` they were made against, so an acknowledgment can
    prove _which_ content was shown.
12. **`docs/security/RUNBOOK-bff-assertion-signing-key.md`** (new) — key
    generation, rotation with overlap, and compromise response.

Added after review (2026-08-17):

13. **`apps/web/src/lib/bff/handler.ts`** — the release gate is now
    **enforcement**: a Managed-only verb is refused with `403` and a blocked
    action receipt during the Signal release, before any handler runs. Exported
    constants alone were documentation. Driven by server-only
    `REFI_RELEASE_STAGE`, so no client build constant can widen the surface.
    > **STATE CORRECTION (2026-08-22): NOT on `main`, deliberately.** The gate
    > described here was implemented in the working pass but never landed: it
    > keyed on the three-verb `isGatedUntilManagedPaper()` mapping, and the C0
    > capability audit showed that mapping misses execution-policy mutations,
    > the Managed exception-resolution categories, and the entire
    > browser-direct API surface. `main` today asserts the predicate
    > (`contract-assertions.ts`) but nothing invokes it on the request path.
    > The replacement is the default-deny Signal capability policy owned by
    > **Workstream C1a-1** — see
    > `docs/releases/2026-09-signal/c0-capability-audit.md` §5.
14. **`apps/web/src/lib/bff/public-routes.ts`** (new) + contract assertion —
    any route file outside `app/api/` must be declared as an intentional public
    route with a reason, or CI fails. The JWKS route is the first entry.
15. **`apps/web/tsconfig.json`** — added `app/.well-known/**/*.ts` to
    `include`. TypeScript's `**` skips dot-directories, so the JWKS route was
    invisible to both `tsc` and ESLint. It is now checked by both.
16. **Signing-key tier separation** (D-021) and **URN issuer** (D-020) — see
    the decision log.

Deferred to follow-up PRs (blocked on the connection package or on identity-ccid):

- `PATCH /preferences` `409` → disclosure → retry loop wiring (§4). Response
  shapes are typed; the loop needs the backend.
- Signal-mode freshness rendering (§3) — types are in place, the projection
  source is still fixtures.
- The six new investor-api read routes (§1) as a live mock-replacement group.
- Populating `sid` / `auth_time` / `amr` on the session — arrives with the
  identity-ccid exchange (`GAP-IDENTITY-018`). Until then the assertion signer
  is complete but has nothing authentic to sign.

---

## 8. Still open

No open **questions** to Daniel. What remains is deliverables and
verify-on-receipt items.

### Owed to Daniel (ours)

- **The BFF issuer and JWKS URL** for the dev connection sheet. He pins
  whatever we give him, and his own constraint — stable, environment-specific,
  not a Vercel preview URL — means we must first stand up a stable dev hostname
  for the BFF that survives redeploys. Blocking on our side, not his.
- **Confirmation reply** adopting the six answers.

### Owed to us (his)

- **D-011:** the dev connection package. Deployment ≈ 2026-08-31, package after
  service + fixtures.
- **His JWKS cache TTL.** Not a contract question, but genuinely unanswered: it
  sets our key-rotation overlap window, and the runbook has a placeholder where
  the number belongs. Ask verbally.
- **Whether the identity-ccid assertion carries `auth_time` and `amr`/`acr`.**
  His §2 requires both in _our_ assertion, and we can only forward what
  identity-ccid emits; for that first assertion he said only "standard claims."
  If they are absent, a compliant assertion is impossible without synthesising
  `auth_time` — the one thing §2 forbids. Ask verbally.

### Verify on receipt, do not re-ask

- **D-010 (residual):** exact wire spelling of `reduce_only` and the literal
  envelope field names.
- **D-019:** whether the §4 re-acknowledgment retry reuses the original
  `Idempotency-Key` or takes a new one. Assumption recorded: new key.
