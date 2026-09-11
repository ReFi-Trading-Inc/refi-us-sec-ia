# alpha.2 → v1.1.0-alpha.3

## Required frontend changes

1. Vendor the entire new directory and run its validator/self-test. Generate
   types/routes/error profiles from this version; never patch alpha.2 in place.
2. Retain the same 41 methods, paths, operation IDs, request/response fields,
   JWT issuers/audiences and allocation/credential semantics. No database or
   account reset, new credentials or user re-onboarding is required.
3. `updateAccountPreferences` now selects `preference_mutation`, which adds
   `ACKNOWLEDGMENT_REQUIRED`, `ACKNOWLEDGMENT_BINDING_INVALID`,
   `ACKNOWLEDGMENT_NOT_REQUIRED`, and `ACCOUNT_AUTHORIZATION_REQUIRED`.
   The latter is an explicit HTTP 403 denial, not a reason to weaken backend
   authority. Allocation mutations also declare that denial.
4. All error profiles now declare request validation (422) and body-size
   rejection (413); paged read profiles declare invalid/expired cursors.
   Internal authentication, version and dependency errors are translated to
   the declared public codes, rather than exposing internal names. Preferences
   return `APPLIED` rather than internal `succeeded` for completed writes.
5. **Preserve acknowledgment data in your client.** The reviewed alpha.2
   TypeScript client validates `error.continuation` but discards it when building
   `InvestorApiError`. Extend that error type/constructor to retain the validated
   optional continuation, then pass it to the BFF/UI confirmation flow. Apply
   this to preference and disconnect acknowledgments. Do not parse message text,
   disable validation or infer continuation values. This is a frontend adapter
   fix; the backend fields already exist in both versions.
6. Follow INTEGRATION.md and the revised native `connection.dev.json`. No runtime
   WIF credentials are requested. The new service-account inputs replace external
   workload claims; IDs/audiences already selected are not reopened decisions.

## Preference confirmation sequence

Read preferences/version → PATCH desired fields with current If-Match and key A
→ 409 acknowledgment with `mutation_applied=false` → fetch/display the required
disclosure/version/hash → `recordConsent` for that account and disclosure key
→ PATCH the **same desired fields**, both `continuation_ref` and
`consent_receipt_id`, current If-Match and **new key B** → 202 receipt with
`APPLIED` or durable pending state → GET receipt/preferences/history.

The confirmation request fields already exist in `PreferencePatch`; no field
rename is introduced. For transport recovery of B, retain B and the exact body.
For an expired/invalid continuation, reload current state and start a new user
decision; do not retry the expired challenge forever. Changed patch, foreign
account/consent, conflicting version and duplicate confirmation must be tested.
Use `examples.json.errors.acknowledgment_required` for the structured error,
`examples.json.preference_confirmation` for the complete synthetic request,
consent, confirmation, APPLIED receipt and version-conflict sequence,
`schemas.json` for `PreferencePatch`/`ConsentRequest`, and the package's executable
conformance tool for local checks. Real connected acceptance is still required.

## Compatibility boundary

alpha.2 remains preserved for already issued history. This revision corrects
metadata/runtime conformance and transport guidance; it does not claim the
frontend has supplied its real trust facts or that full trading acceptance is
complete. The authoritative artifact digest is `bundle.json.package_content_sha256`.
