# Upgrade to v1.1.0-alpha.4

Use this package for new integration. Alpha.3 and earlier are immutable,
superseded reference material under `archive/` in the backend handoff root.
Pull the complete current package, regenerate strict response types/validators
and rerun `python3 tools/conformance.py validate` and `self-test`.

1. Allocation previews and recommendation list/detail now return a nullable
   `funding_assessment`. Implement [FUNDING.md](FUNDING.md) and its examples.
2. Recommendation schemas now match the backend's actual projections: list
   items use `RecommendationSummary`; detail uses `Recommendation` with
   `lineage`, `summary`, `content_status`, `lifecycle_status` and separate
   timestamps. Alpha.3 incorrectly retained an older shared schema containing
   `status`, `freshness` and `estimated_turnover_percent`. Do not expect those
   old fields on these routes. Use `turnover` (fraction, not percentage points)
   in summaries or `summary.turnover` in detail. `execution_eligible=false`
   describes the advisory recommendation, not disabled account automation;
   separately authorized intents and execution Records carry trading progress.
3. Historical funding assessments are null, never recomputed. An unconsumed
   legacy preview must be refreshed; already completed action replay remains
   idempotent. A preference change also invalidates a new preview.
4. SSE event names/envelopes, consent naming, allocation fraction request,
   broker environment selection and identity/Google/JWKS ownership stay unchanged.
   Fetch the linked recommendation for amounts; no new event permission or
   broker API access is required.

The package is a frontend-development contract, not a connected Alpha release.
`connected_alpha_verified=false` remains explicit. Actual frontend workload
identity/JWKS binding and cross-system HTTP/SSE acceptance still require the
existing integration steps; this version does not invent or alter those values.
