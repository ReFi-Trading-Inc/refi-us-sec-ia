# Phase 2.7 Daniel Connection-Mechanics Resolution

**Date:** 2026-08-19
**Source:** Daniel's written reply to the 2026-08-19 three-item ask (identity-ccid
claim set, JWKS caching/rotation, dev connection sheet).
**Status:** **Authoritative.** Third Daniel message with verifiable written
provenance.

**Closes:** **D-010** (the residual `reduce_only` wire spelling) and **D-019**
(post-acknowledgment `Idempotency-Key`) — the last two OPEN items in
[`decisions/DECISION_LOG.md`](decisions/DECISION_LOG.md). Partially unblocks
**D-011**: the dev hostname is now named, the package still follows deployment.

**Relationship to the prior two messages:** additive and narrowing. The July
direction decided _who owns what_; the 2026-08-17 reply
([`phase2-7-daniel-contract-mechanics-resolution.md`](phase2-7-daniel-contract-mechanics-resolution.md))
specified _how the frontend talks to it_; this one supplies _the values needed to
actually connect_, and narrows one 2026-08-17 statement — see §1.

---

## 1. identity-ccid claim set — and a narrowing of "amr or acr"

### Daniel's direction

The identity-ccid handoff to the BFF will include `auth_time` (the underlying
user authentication time) and **a non-empty `amr` array**. `acr` may be added
later, but **`amr` is the required v1 method claim**. Method values ship with the
exported contract, initially covering email verification code and email magic
link.

The BFF must preserve `auth_time` and `amr` in its server-side session and copy
them into each user assertion. It must **not** replace `auth_time` when it
refreshes its session or mints a new assertion — only a new underlying
authentication or a step-up updates it.

### What this resolves

The dependency that blocked the assertion path: we were failing closed rather
than synthesising `auth_time`, without knowing whether upstream would ever
supply it. It will.

### The narrowing, which is the part with teeth

The 2026-08-17 reply was recorded as "at least one of `amr`/`acr` must be
present", and the code implemented exactly that. **That reading is now too
loose.** `acr` is _additive_, never a substitute: an assertion carrying only
`acr` would be missing the claim investor-api actually reads.

The permissive version would not have failed in dev — it would have failed on
the first real handoff, as a verification rejection with a well-formed-looking
assertion. Changed:

- `REQUIRED_AUTH_METHOD_CLAIMS = ["amr", "acr"]` → `REQUIRED_AUTH_METHOD_CLAIM = "amr"`
  plus `OPTIONAL_AUTH_METHOD_CLAIM = "acr"`.
- Minting throws `MissingAuthMethodError` when `amr` is absent, **empty**, or
  supplied only as `acr`. An empty array is refused explicitly: `[]` asserts
  that authentication happened by no method at all.
- Method values are deliberately **not** enumerated. Guessing the spellings
  would produce a set that silently disagrees with `v1.0.0-dev.1`.

### Non-replacement of `auth_time`

Stated in `apps/web/src/lib/bff/auth.ts` as an obligation rather than a comment.
A refresh path that re-stamps `auth_time` would defeat step-up while every test
still passed — the assertion would look perfectly well-formed. It is the same
failure shape as the `amr` widening: correct-looking output, wrong meaning.

---

## 2. investor-api JWKS caching and rotation

### Daniel's direction

| Behaviour                       | Value                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| JWKS cache TTL                  | 5 minutes                                                                                           |
| Unknown `kid`                   | one immediate refresh + one retry, then reject                                                      |
| Refresh storms                  | coalesced and rate-limited on his side                                                              |
| Rotation overlap required of us | **minimum 10 minutes**                                                                              |
| Emergency revocation            | explicit invalidation/revocation, not TTL expiry                                                    |
| JWKS URL resolution             | **only** the explicitly configured URL — never derived from `iss`, never followed from an assertion |
| Failure mode                    | fails closed                                                                                        |

### What this resolves

The runbook's two open dependencies (§6), both of which were ours to close and
neither of which we could answer alone.

- **Overlap is now a number.** Ten minutes, double his TTL — the right shape: a
  fetch landing just before rotation is served a key set valid for another five
  minutes, so a five-minute overlap would leave no margin at all. The runbook
  step said "confirm it in the connection sheet"; it now says ten.
- **Our `max-age=300` is confirmed correct** — it matches his TTL, so no
  intermediary holds a key set longer than he does. Recorded in the route as
  _matching_ rather than _chosen_, with the note that raising it without raising
  the overlap silently shortens the margin.
- **Unknown-`kid` refresh is a safety net, not the plan.** It only helps
  assertions signed with a key that is _newer_ than his cache. One signed with a
  key we have already unpublished fails closed with nothing to refetch — so it
  is not permission to skip the overlap.
- **Compromise response is better than the runbook assumed.** It said "purge
  rather than wait for TTL"; explicit revocation is a supported path, so the
  five-minute TTL is not the bound on exposure.

---

## 3. Dev connection sheet — approved

Approved as proposed, with one addition:

| Item                 | Value                                                    |
| -------------------- | -------------------------------------------------------- |
| Issuer (dev)         | `urn:refinity:bff:dev`                                   |
| Audience (dev)       | `urn:refinity:investor-api:dev`                          |
| Algorithm            | ES256 only                                               |
| `kid`                | protected header                                         |
| Assertions           | one per BFF→investor-api call, unique `jti`              |
| TTL                  | 60 seconds                                               |
| **Dev BFF hostname** | **`bff-dev.refi.trading`**                               |
| **Dev JWKS URL**     | **`https://bff-dev.refi.trading/.well-known/jwks.json`** |

Staging and prod issuers (`urn:refinity:bff:staging`, `urn:refinity:bff:prod`)
are accepted as **reserved names**; only dev is enabled now.

The Google OIDC service credential and `X-Refinity-User-Assertion` remain
separate, and **both** are required on protected BFF calls. One authenticates
the service, the other identifies the user; neither substitutes for the other.

**The hostname is not provisioned yet.** Keep the JWKS URL configurable on his
side until it is live and included in the Dev connection package. Recorded in
`.env.example` as `BFF_DEV_HOSTNAME` and in the runbook's open dependencies —
this is a deliverable we owe him, not a question for him.

Note that the URN issuer and the JWKS hostname now move independently by
design, which is what we wanted — but §2 means a JWKS URL change is a
coordinated config change on his side, never something a redeploy can do
silently.

---

## 4. The two settled wire details

### `reduce_only` (closes D-010)

A plain Managed action named `reduce_only`, carrying `parameters.enabled` as a
boolean, in the existing action envelope. **Unavailable in Signal mode.**

This confirms the shape already implemented, and the Signal-mode exclusion is
already enforced by `REFI_RELEASE_STAGE` in `apps/web/src/lib/config/env.ts` —
server-side, so no client build constant can widen the action surface.

### Post-acknowledgment `Idempotency-Key` (closes D-019)

After `ACKNOWLEDGMENT_REQUIRED`, the final `PATCH /preferences` uses a **new**
`Idempotency-Key`, because the continuation and consent-receipt references
change the request. Exact retries of that final PATCH reuse **its** new key.
Reusing the original key with the changed request is rejected as
`IDEMPOTENCY_KEY_REUSED`.

This confirms the working assumption recorded against D-019.

**The trap, now stated once in `sec203a/step-up.ts`:** the two 409 loops take
_opposite_ key rules.

| Loop                      | Retry key | Why                                                      |
| ------------------------- | --------- | -------------------------------------------------------- |
| `STEP_UP_REQUIRED`        | **SAME**  | the challenge is bound to it, and the body is unchanged  |
| `ACKNOWLEDGMENT_REQUIRED` | **NEW**   | the body now carries continuation + consent-receipt refs |

Same-shaped 409s, opposite rules, and the same underlying reason: a key
identifies a _request_, not a user intention. `continuationIdempotencyKeyRule()`
exists so the distinction is read from one place rather than remembered.

---

## 5. What remains open

Nothing in the contract. The residual is delivery:

- **D-011** — the Dev connection package (final endpoint, WIF values, seeded
  IDs, deployed contract/image versions, exported `v1.0.0-dev.1`, deterministic
  dev fixtures) arrives together after the backend services and fixtures are
  deployed. Dated ≈ 2026-08-31 for the `investor-api` deployment.
- **`bff-dev.refi.trading`** — ours to provision.
- **`amr` method values** — arrive with the exported contract; not guessed here.

Daniel: "You can continue against these contract decisions."

---

## 6. Process note

Daniel asked that this class of discussion stay on email, keeping live time for
company direction, integration cutover, and roles ahead of launch. Recorded here
because it changes how the next ask is made, not what it contains.

Separately, he has a revised build of the game at
`https://refi-man-vs-machine.vercel.app/` and is collecting feedback from close
contacts **before 2026-08-31**, when it moves toward production. Not an
engineering dependency of this repo; noted so the date is not missed.
