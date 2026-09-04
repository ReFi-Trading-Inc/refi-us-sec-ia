# Vendored Investor API contract package

| Field                                  | Value                                                              |
| -------------------------------------- | ------------------------------------------------------------------ |
| Contract version                       | `v1.1.0-alpha.2`                                                   |
| Package id                             | `v1.1.0-alpha.2-frontend-handoff`                                  |
| `package_content_sha256` (bundle.json) | `c1b53c906653ca8860bf66cfc0df8fa862ff34d6cbf77298ac83cb55f006cb09` |
| Source contract SHA-256 (bundle.json)  | `b51556df2a28b531dad0a81d0001685da110bfdf7b2bd38e8e2ac899f22e0278` |
| Received                               | 2026-09-03, from Daniel's `refinity-main` repository               |
| Generator                              | `scripts/contracts/build_investor_alpha_handoff.py` v2 (his side)  |

`v1.1.0-alpha.2/` is a **byte-for-byte copy** of the package directory Daniel
delivered. Nothing in it is edited here; a correction is a new version
directory with its own `bundle.json`. `src/__tests__/investor-api-package.test.ts`
fails if any vendored file's SHA-256 differs from `bundle.json.artifacts[]` or
if the file set differs from the bundle's artifact list.

## Why all nine files are vendored

Daniel's `tools/conformance.py validate` checks the **entire** package: every
artifact hash, the README's required sections and standalone commands, the
example fixtures' safety, and the exact file set. Vendoring a subset would make
his validator fail against our copy, which would defeat the point of running it
as a blocking CI gate. So the whole package is vendored, and the following
rules hold instead:

- `connection.dev.json` is **documentation only**. No runtime module imports
  it; the client never derives a base URL, audience, or service account from
  it. `investor-api-boundary.test.ts` asserts no `src/` file imports it.
- `capabilities.json` and `README.md` are governance artifacts. Nothing reads
  them at runtime.
- `tools/conformance.py` is executed only by the test suite, against loopback.

## What reads what

| Runtime module                      | Reads                                       |
| ----------------------------------- | ------------------------------------------- |
| `src/investor-api/package.ts`       | `bundle.json`, `contract.json`              |
| `src/investor-api/validation.ts`    | `schemas.json` (JSON Schema 2020-12)        |
| `src/generated/investor-api.gen.ts` | generated from `openapi.json` at build time |
| tests only                          | `examples.json`, `tools/conformance.py`     |
