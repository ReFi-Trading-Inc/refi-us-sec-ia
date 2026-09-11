# Vendored Investor API contract package

| Field                                  | Value                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| Contract version                       | `v1.1.0-alpha.3` (supersedes `v1.1.0-alpha.2`)                                  |
| `package_content_sha256` (bundle.json) | `5eca1200f6af807093ea0986f835235e2da478b69478e621fd54954ba1d77608`              |
| Source contract SHA-256 (bundle.json)  | `3f5df829b1b74d1c95aa41ba4b9bc306d6b6242b25737373082b95d52d8e1cdb`              |
| Issued / vendored                      | 2026-09-09 / 2026-09-10, from Daniel's `refinity-main` `contracts/frontend/`    |
| Verified                               | `verify_current.py`, `tools/conformance.py validate` + `self-test` (python3.11) |

`v1.1.0-alpha.3/` is a **byte-for-byte copy** of the package directory Daniel
delivered (including `tools/`, `MIGRATION.md`, `INTEGRATION.md`). Nothing in
it is edited here; a correction is a new version directory with its own
`bundle.json`. `src/__tests__/investor-api-package.test.ts` fails if any
vendored file's SHA-256 differs from `bundle.json.artifacts[]` or if the file
set differs from the bundle's artifact list.

`v1.1.0-alpha.2/` remains vendored as **issued history only** (its own
bundle hash `c1b53c90…` is still asserted). Nothing under `src/` imports it
(`investor-api-alpha3.test.ts`).

## What alpha.3 changed (MIGRATION.md)

- Same 41 operations, paths, request/response fields, JWT issuers/audiences
  and allocation/credential semantics. No reset, re-onboarding or new
  credentials.
- `updateAccountPreferences` selects the new `preference_mutation` profile:
  `ACKNOWLEDGMENT_REQUIRED`, `ACKNOWLEDGMENT_BINDING_INVALID`,
  `ACKNOWLEDGMENT_NOT_REQUIRED`, `ACCOUNT_AUTHORIZATION_REQUIRED` (explicit
  HTTP 403 denial). Allocation mutations also declare that denial.
- Every profile declares 422 validation and 413 body-size rejection; paged
  reads declare invalid/expired cursors. Preferences return `APPLIED`.
- The client RETAINS the validated optional `error.continuation` on
  `InvestorApiError` (`errors.ts`, forwarded in `client.ts
failureFromResponse`) for the preference/disconnect confirmation flow.
- `connection.dev.json` documents the native Cloud Run binding
  (`frontend_runtime_service_account_email` / `_unique_id`) in place of WIF.

## Why all files are vendored

Daniel's `tools/conformance.py validate` checks the **entire** package: every
artifact hash, the README's required sections and standalone commands, the
example fixtures' safety, and the exact file set. Vendoring a subset would make
his validator fail against our copy, which would defeat the point of running it
as a blocking CI gate. So the whole package is vendored, and the following
rules hold instead:

- `connection.dev.json` is **documentation only**. No runtime module imports
  it; the client never derives a base URL, audience, or service account from
  it. `investor-api-boundary.test.ts` asserts no `src/` file imports it.
- `capabilities.json`, `README.md`, `MIGRATION.md`, `INTEGRATION.md` are
  governance artifacts. Nothing reads them at runtime.
- `tools/conformance.py` is executed only by the test suite, against loopback.

## What reads what

| Runtime module                      | Reads                                       |
| ----------------------------------- | ------------------------------------------- |
| `src/investor-api/package.ts`       | `bundle.json`, `contract.json`              |
| `src/investor-api/validation.ts`    | `schemas.json` (JSON Schema 2020-12)        |
| `src/generated/investor-api.gen.ts` | generated from `openapi.json` at build time |
| tests only                          | `examples.json`, `tools/conformance.py`     |
