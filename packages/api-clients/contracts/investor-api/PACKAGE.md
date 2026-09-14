# Vendored Investor API contract package

| Field                                  | Value                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Contract version                       | `v1.1.0-alpha.4` (supersedes `v1.1.0-alpha.3`)                                                            |
| `package_content_sha256` (bundle.json) | `a6db935b6a398bff00a7ccee4cb268ee565249bbd75c23e36594c9f6b698e7c3`                                        |
| Source contract SHA-256 (bundle.json)  | `47b670f366b09280fe90c0e01d53f7d616f8d145ca823c314f9dbae060a11be3`                                        |
| Issued / vendored                      | 2026-09-11 / 2026-09-13, byte-for-byte from `integration/refinity-dev` commit `09842e4` (Daniel)          |
| Verified                               | 11/11 artifact hashes + package digest recomputed; `tools/conformance.py validate` + `self-test` (py3.11) |
| `connected_alpha_verified`             | `false` — a frontend-development contract, not a connected Alpha release                                  |

`v1.1.0-alpha.4/` is a **byte-for-byte copy** of the package directory Daniel
delivered (including `tools/`, `FUNDING.md`, `MIGRATION.md`, `INTEGRATION.md`).
Nothing in it is edited here; a correction is a new version directory with its
own `bundle.json`. `src/__tests__/investor-api-package.test.ts` and
`src/__tests__/alpha4-adoption.test.ts` fail if any vendored file's SHA-256
differs from `bundle.json.artifacts[]`, if the file set differs from the
bundle's artifact list, or if the package content digest does not recompute
from those records.

`v1.1.0-alpha.3/` and `v1.1.0-alpha.2/` remain vendored as **issued history
only** (their bundle hashes `5eca1200…` and `c1b53c90…` are still asserted).
Nothing under `src/` imports them (`investor-api-alpha3.test.ts`). Daniel's
handoff root moves superseded packages under `archive/`; this repository keeps
them at their original paths so existing hash assertions and history stay
byte-stable. `CURRENT.json` records `archive_status:
superseded_reference_only` for them either way.

## What alpha.4 changed (MIGRATION.md)

- **`funding_assessment`** (nullable) on allocation previews and on
  recommendation list/detail. Semantics in `FUNDING.md`: all amounts are USD
  decimal strings; `INSUFFICIENT` is a persistent portfolio funding notice;
  `null` is historical, unassessed evidence and is **never** "sufficient".
- **Recommendation schemas corrected** to the backend's real projections. List
  items are `RecommendationSummary`; detail is `Recommendation` with `lineage`,
  `summary`, `content_status`, `lifecycle_status` and separate timestamps.
  alpha.3 wrongly retained `status`, `freshness` and
  `estimated_turnover_percent`. **Turnover is now a fraction**
  (`turnover` / `summary.turnover`), not percentage points — the projection in
  `apps/web/src/lib/investor-api/recommendations.ts` converts with exact
  base-10 string math (`fractionToPercent`) for display only.
  `execution_eligible` is `const: false` and describes the advisory
  recommendation, not account automation.
- Historical funding assessments stay null and are never recomputed; an
  unconsumed legacy preview must be refreshed; a preference change invalidates
  a new preview; completed action replay stays idempotent.
- **Unchanged:** SSE event names/envelopes, consent naming, allocation fraction
  request, broker environment selection, identity/Google/JWKS ownership.
- Still **not** exposed: closed-Alpha cohort membership and canonical
  admission (D-A2 / D-A3). `listAccountMemberships` (`AccountMembership`,
  `ACTIVE | ENDED | PENDING`) is the portfolio **allocation** membership and is
  unchanged since alpha.3 — it is not the cohort object.

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
- `capabilities.json`, `README.md`, `FUNDING.md`, `MIGRATION.md`,
  `INTEGRATION.md` are governance artifacts. Nothing reads them at runtime.
- `tools/conformance.py` is executed only by the test suite, against loopback.

## What reads what

| Runtime module                      | Reads                                       |
| ----------------------------------- | ------------------------------------------- |
| `src/investor-api/package.ts`       | `bundle.json`, `contract.json`              |
| `src/investor-api/validation.ts`    | `schemas.json` (JSON Schema 2020-12)        |
| `src/generated/investor-api.gen.ts` | generated from `openapi.json` at build time |
| tests only                          | `examples.json`, `tools/conformance.py`     |
