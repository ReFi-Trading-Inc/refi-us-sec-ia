# Sprint 5 Conformance Report — Template

**Version:** v1 (2026-07-14), Sprint 4 doc deliverable that Sprint 5 consumes.
**Purpose:** the shape the nightly `@live`-tagged Playwright run fills in
once **D4** (staging Admin Portal URL + service auth) lands. A fresh
copy of this file lives at `artifacts/conformance/<yyyymmdd>-<sha>.md`
per nightly run; the last-observed timestamp on the README integration
scoreboard is a link into the most recent one.

The template is intentionally verbatim-fillable — the nightly job runs
a small formatter (`scripts/conformance-report.ts`, Sprint 5) that
replaces the `«placeholder»` markers with real values. Fields the
formatter cannot fill (e.g. counsel-required-review flags) stay as-is
and are marked `MANUAL`.

---

## Header

| Field                 | Value                                                                      |
| --------------------- | -------------------------------------------------------------------------- |
| Run at                | «run_started_at_iso»                                                       |
| Contract V3 version   | «contract_v3_version» (from `artifacts/contract-schemas/v3/manifest.json`) |
| Investor-shell commit | «investor_shell_sha»                                                       |
| Admin Portal URL      | «admin_portal_base_url»                                                    |
| Admin Portal commit   | «admin_portal_sha» (from upstream `x-refi-build` header)                   |
| Session identity used | e2e-signal-user (Signal-mode, no broker)                                   |
| Runner                | GitHub Actions `nightly-conformance.yml`                                   |

---

## Contract V3 schema drift

For every endpoint the strict Zod projection either (a) parsed and
projected the response without loss, (b) rejected an unknown field
(fail-closed at the transport seam), or (c) received an admin-only
field that survived the projection (a leak — **SEV-1**).

| Endpoint                                   | Result              | Fields observed | Fields rejected         | Admin-field leaks     |
| ------------------------------------------ | ------------------- | --------------- | ----------------------- | --------------------- |
| `GET /api/v1/templates`                    | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/memberships`                  | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/rules`                        | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/accounts`                     | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/account-flow`                 | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/risk-limits`                  | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/intents`                      | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/risk-decisions`               | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/execution-plans`              | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/orders`                       | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/orders-blocked`               | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/broker-interactions`          | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/reconciliation`               | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/trading-controls`             | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/orders/{cli}/lifecycle`       | «pass\|fail\|drift» | «field_count»   | «rejected_list_or_none» | «leaked_list_or_none» |
| `GET /api/v1/stream` (SSE, first-N events) | «pass\|fail\|drift» | «event_count»   | «rejected_list_or_none» | «leaked_list_or_none» |

**Any row with `admin_field_leaks != none` fires the SEV-1 IR runbook
procedure automatically** — the nightly job posts to the incident
channel and pages the on-call before the report finishes rendering.

## Cross-account isolation

The `@live` block re-runs the two ACL specs against the live upstream:

| Assertion                                                      | Result       |
| -------------------------------------------------------------- | ------------ |
| Spoofed `x-investor-account-id` header does not escalate scope | «pass\|fail» |
| Cross-account request via a legitimate query param returns 404 | «pass\|fail» |
| SSE bridge drops events for foreign account ids                | «pass\|fail» |

## Latency

Per-endpoint wall-clock, measured from BFF handler entry to response.
p50 / p95 across the run's request count. Latency budgets are
informational — a persistent regression is a ticket, not a red row.

| Endpoint                                | count | p50 (ms) | p95 (ms) | budget (ms)                               |
| --------------------------------------- | ----- | -------- | -------- | ----------------------------------------- |
| «row per endpoint, filled by formatter» |       |          |          | 800 (read) / 1500 (mutate) / n/a (stream) |

## Cache posture

The per-account LRU cache in `apps/web/src/lib/admin-portal-proxy/cache.ts`
should show meaningful hit rates on repeated dashboard renders. A
hit-rate at or near 0% either means the cache TTL is wrong or (more
likely) the run is single-request and there was nothing to hit.

| Metric                 | Value                 |
| ---------------------- | --------------------- |
| Requests               | «total_requests»      |
| Cache hits             | «cache_hits»          |
| Hit rate               | «cache_hit_rate_pct»% |
| Upstream request count | «upstream_requests»   |

## D7 status (bidirectional enforcement)

D7 is Daniel's GitLab CI job validating Admin Portal responses against
the Contract V3 JSON Schemas published from this repo.

| Field                                     | Value                     |
| ----------------------------------------- | ------------------------- |
| D7 job present in refinity-main           | «yes\|no»                 |
| Last D7 run                               | «iso_or_unknown»          |
| D7 last result                            | «pass\|fail\|unknown»     |
| D7 sha of schemas the job pinned          | «sha_or_unknown»          |
| Our current schemas sha                   | «current_manifest_sha»    |
| Schema drift (Daniel pinned an older set) | «none\|N versions_behind» |

A non-`none` drift row is a **SEV-2**: our side stayed compatible with
a schema Daniel no longer validates against. Ping Daniel to bump the
pinned sha.

## Manual observations (MANUAL)

- Counsel review status for Machine Ladder Level 3+ (G4 blocker): MANUAL
- TACO likeness flag posture: MANUAL, default off unless counsel sign-off attached
- Records retention verification on the durable driver: MANUAL, run monthly

## Exit disposition

- If every row of §Contract V3 schema drift is `pass`, every row of
  §Cross-account isolation is `pass`, and D7 drift is `none`: the
  scoreboard row for each endpoint on the README flips **green** with
  today's date. Sprint 5 exit criterion met for those rows.
- If any row is not `pass`: the README row stays red; the failing
  endpoint's row on this report links to the IR runbook procedure
  that fires (SEV-1 for admin leaks, SEV-2 for schema drift, SEV-3 for
  latency regressions).

## Sign-off (Sprint 5 sprint-close only)

| Role        | Name         | Date | Signature |
| ----------- | ------------ | ---- | --------- |
| Engineering | Zeshan Ahmad |      |           |
| Backend     | Daniel       |      |           |

Signature commits to the sha256 of this report file plus the linked
evidence bundle for the same commit.
