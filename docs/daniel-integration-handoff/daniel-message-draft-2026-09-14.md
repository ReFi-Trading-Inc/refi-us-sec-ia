# Message to Daniel — DRAFT, NOT SENT (awaiting founder approval)

**Status:** draft. The founder has the packet on hold until the Terraform plan
and Stytch provisioning narrow the ask list further. Do not send this as-is.

---

Daniel — an update on what changed on the frontend since we last wrote, then
five things we need from you. Nothing here needs a meeting; short written
answers against the numbered items are enough.

## 1. We adopted alpha.4

We took your `v1.1.0-alpha.4` package byte-for-byte from `09842e4` on
`integration/refinity-dev`:

```text
package_content_sha256
a6db935b6a398bff00a7ccee4cb268ee565249bbd75c23e36594c9f6b698e7c3
```

Verified on landing rather than trusted: all 11 artifact hashes and the package
content digest recomputed from the vendored bytes, `CURRENT.json` and
`bundle.json` agree, and your `tools/conformance.py validate` and `self-test`
both pass on python3.11. The client is regenerated and pinned to alpha.4.
`connected_alpha_verified` stays `false`, as your package states.

Alpha.4 is now the contract authority for our handoff branch. `main` stays on
alpha.3 during our release freeze; that is deliberate, not drift.

Your recommendation correction was right and we had the bug it predicts:
alpha.3's shared schema let turnover be read as percentage points, and alpha.4's
`turnover` is a fraction. We now convert with exact base-10 string arithmetic
for display only, and there is a test that fails if any alpha.4 schema ever
reintroduces `estimated_turnover_percent`.

## 2. Your connected-dev infrastructure is now our source of record

We reconciled `infra/terraform/connected-dev/**` and `infra/cloudrun/**` onto
our handoff branch **by path, not by merge**. Your 27 declared Terraform
resource addresses match the 27 in live state serial 6 exactly — names,
regions, both service accounts, both P-256 KMS keys, the Firestore database and
the Cloud Build trigger all agree. The release controller, runtime probe and
generation-locked promotion are good work and we kept them intact.

**One change that affects you operationally.** The Cloud Build push trigger
source moves:

```text
^integration/refinity-dev$  →  ^daniel-handoff/integration$
```

Our reviewed, protected branch is now both the certification source and the
deployment source; they had drifted apart, which is not a state we can certify
from. `daniel-handoff/integration` now has branch protection with four required
checks, no direct pushes and no force pushes.

**This is not applied yet.** The live trigger still names your branch until a
credentialed operator runs a reviewed `terraform plan` and the founder approves
the apply. When it does land, pushes to `integration/refinity-dev` will stop
deploying connected Dev. Say so now if that breaks a workflow of yours — we can
sequence around it.

## 3. What we could not take from your branch

Four runtime changes in `09842e4` conflict with decisions made after your branch
diverged, so we left them out. No judgement on the work; the constraints simply
moved underneath it.

| Not taken                                                 | Why                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `integration-dev/kyc-pass.ts` and everything importing it | It mints `kyc.status = "passed"` without a provider decision. Our KYC claim must come from a final Socure evaluation or authenticated webhook, enforced by a module-private trust marker. It is also reachable on a connected deployment, since `REFI_KYC_PROVIDER=unconfigured` is our permitted connected value. |
| `trading_eligibility: "eligible"` becoming emittable      | We type that value out of existence on purpose. Economic authority is the backend's, read from `AccountAuthorization`.                                                                                                                                                                                             |
| `paper \| live` environment and `(PK\|AK)` key ids        | Closed Alpha is paper only by founder decision. Your contract can represent `live`; that is not product permission on our side yet.                                                                                                                                                                                |
| Client-supplied `Idempotency-Key` as operation identity   | See item 7 — the guarantee it depends on is not stated anywhere in the package.                                                                                                                                                                                                                                    |

One more, worth flagging because it was not in any of your infra commits: the
merge resolutions in `d592c10` and `6cd903e` flipped
`SOCURE_WEBHOOK_ENFORCE_SENDER_IP` from `'0'` to `"1"` in both Socure
**production** manifests, under a comment saying the merge preserved the
existing value. We hold `0` there deliberately until genuine sandbox delivery
proof passes, so we rejected all three `infra/gcp/` files. Nothing was applied,
and production is still dark. Flagging it so the same resolution does not repeat
on your side.

## 4. What we need — the lead item

**Issue the alpha.5 frontend integration package.**

Your `docs/alpha4-integration-status.md` says alpha.5 is issued and deployed in
GitLab and that backend membership and admission reads are implemented. We have
not seen that package; it is not vendored on any branch of this repository.

Please issue the immutable frontend integration package corresponding to that
work, including the package digest and complete machine-readable artifacts
(`contract.json`, `schemas.json`, `openapi.json`, `capabilities.json`,
`examples.json`, bundle/digest record, migration notes and conformance tooling
as applicable).

We specifically need machine-readable operations and projections for:

1. `ClosedAlphaMembership`
2. canonical admission

To be precise about why alpha.4 does not close this: the string "membership"
does appear in its machine artifacts, but only as `listAccountMemberships` /
`AccountMembership` (`ACTIVE | ENDED | PENDING`, `allocation_percent`,
`template_id`) and `lineage.membership_fingerprint`. That is the portfolio
allocation membership produced by `join_template`, byte-identical to alpha.3 —
not the closed-Alpha cohort object. Cohort membership and admission appear only
as prose in `INTEGRATION.md`.

We will not transcribe either projection from prose. Adoption stays mechanical
on our side: verify digest → migration diff → regenerate client → rerun
conformance, exactly as we did for alpha.4. Until the package lands, our setup
gate keeps using `OnboardingStatus.state === READY` as a documented proxy, which
we would rather replace than keep.

## 5. Four contract items found while adopting alpha.4

**a. `$defs.Freshness` is an orphan.** It is defined with `source_as_of`,
`last_evaluated_at`, `fresh_until`, `expires_at`, `freshness_status`,
`freshness_policy_version` and `freshness_reason_codes` all required, and
`openapi.json` publishes it under `components.schemas` — but neither file
contains a single `$ref` to it. `Recommendation` and `RecommendationSummary`
carry flat `freshness_status` / `fresh_until` / `expires_at` instead. Please
either `$ref` it from the recommendation shapes or delete it. We removed the
evaluation-time and policy-version fields from our UI rather than fabricate
them, and will re-add them only against a contracted field.

**b. `lifecycle_status` and `freshness_status` have no vocabulary.** Both are
`{"type": "string"}` with no `enum`, and your `examples.json` is inconsistent in
case: `RecommendationEnvelope.freshness_status` is `"fresh"` while
`AccountPositionEnvelope` and `TemplateEnvelope` use `"FRESH"`. We need either an
`enum` per field per shape, or an explicit statement that both are open,
case-insensitive sets — in which case we normalise on read and never key UI or
tests off the raw value. We are not guessing a vocabulary.

**c. `RecommendationSummary` needs `template_id`.** It has no `template_id` and
no `lineage`, so template identity is recoverable only from
`funding_assessment.input_versions.template_id` — and `FUNDING.md` says
historical assessments are null and never recomputed, so for any list containing
history most rows have no template identity at all. Our BFF currently fills the
gap with bounded detail fetches: worst case 4 pages × 100 items = 400 detail
calls in 100 sequential rounds, so **404 upstream calls for one list request**,
with no cache layer. `RecommendationSummary` already carries a lineage-derived
field (`output_fingerprint`, required), so adding `template_id` is consistent
with the shape rather than a new class of data. We delete the fan-out the day it
lands.

**d. `allocation_percent` is a fraction, not percentage points.** On
`AllocationPreview`, `AllocationPreviewRequest`, `AccountActionRequest.parameters`
and `AccountMembership` the pattern is
`^(?:0\.(?:0*[1-9][0-9]*)|1(?:\.0+)?)$`, i.e. (0, 1]. The name reads as
percentage points and is exactly the unit hazard alpha.3 → alpha.4 already
corrected once for turnover. If renaming is off the table for compatibility, a
one-line `description` saying "decimal fraction in (0, 1], not percentage
points" on each occurrence would close it.

## 6. `AccountAuthorization` — two residual questions

alpha.4 confirms the shape is unchanged, and `INTEGRATION.md` §6 confirms
`DENIED` + `BROKER_CONNECTION_MISSING` is the legitimate pre-connection state.
Both of those close on package evidence, and our code complies — we read no
authorization before a first brokerage connection.

Residual:

**a.** `reason_codes` is declared only as the open pattern
`^[A-Z][A-Z0-9_]{1,63}$` with no enum, and `examples.json` carries only
`{"status":"AUTHORIZED","reason_codes":[]}` — no DENIED, PENDING or SUSPENDED
example. Please supply the complete enumerated reason-code vocabulary, or state
that it is intentionally open and that clients must key behaviour only on
`status`.

**b.** What transitions an account into `SUSPENDED`, and who clears it?

## 7. `Idempotency-Key` semantics are undefined

`IDEMPOTENCY_KEY_REUSED` appears in five error profiles in `contract.json` but
is defined nowhere in `openapi.json` or `INTEGRATION.md`. Please state
normatively:

1. same key + **different** body — rejected with 409 `IDEMPOTENCY_KEY_REUSED`,
   or replays the first result?
2. the key persistence window;
3. behaviour for two concurrent in-flight requests with the same key.

Until (1) is explicit we keep deriving keys from the economic parameters rather
than from a client-supplied operation id, because a parameter-derived key is
safe under either backend behaviour and the client-supplied model is only safe
under one of them.

Related, carried forward: `brokerage_mutation` in alpha.4 is byte-identical to
alpha.3 and still excludes `ACCOUNT_AUTHORIZATION_REQUIRED` and
`ACKNOWLEDGMENT_BINDING_INVALID`, with no `403` in its status set, unlike
`allocation_mutation` and `preference_mutation`. Is that a guarantee the backend
never emits either from brokerage disconnect, or an omission for the next
package? Our disconnect adapter fails closed on both until you answer.

## 8. Connected identity — what we need to agree before the first exchange

Our runtime identity facts now exist in Terraform rather than as placeholders.
For Cloud Run service `refi-frontend-integration` in `refinity-dev/us-west1` we
emit:

```text
iss    https://refi-frontend-integration-182665799543.us-west1.run.app
aud    urn:refinity:identity-bridge:dev
JWKS   <origin>/.well-known/identity-bridge-jwks.json
alg    ES256, kid refi-dev-bridge-20260911-1
       (a KMS P-256 key separate from our Investor API assertion key)
SA     refi-frontend-runtime@refinity-dev.iam.gserviceaccount.com
redirect  <origin>/us/auth/callback
```

Please accept these or return the values you require instead, and confirm when
`IDENTITY_FEATURE_STATE` is enabled on identity-ccid — `connection.dev.json`
still reports it disabled with the frontend trust inputs blank.

Two more:

**a. identity_result `iss` / `aud`.** We pin both as exact strings. Absent
configuration we fall back to `urn:refinity:identity-ccid:dev` and
`urn:refinity:frontend-bff:dev`. Confirm both verbatim, or give us the pair you
actually emit. We will not infer them from the JWKS URL.

**b. `amr`.** We accept it as optional, non-empty and unique, and we bind `sid`,
`email` and `auth_time` against our bridge assertion. Does identity-ccid echo
the upstream `amr`, re-derive it, or omit it? If it is meant to be retained we
will bind it too, but we will not assume it.

Note we also have a domain mapping pending (`bff-dev.refi.trading`). If that
lands, the issuer and JWKS URLs change. Tell us which origin you want to bind
so it is bound once rather than twice.

## 9. What is not blocked on you

So you know where the line is: our contract adoption, connected-dev
infrastructure reconciliation, recommendation and funding surfaces, and the
paper-only brokerage boundary are done and gated. Socure scenarios B and C are
blocked on the provider, not on you, and nothing else in that lane depends on
them. Stytch provisioning is ours. The only frontend work genuinely waiting on
backend authority is admission and membership — item 4.
