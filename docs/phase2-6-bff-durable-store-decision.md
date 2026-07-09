# BFF Durable Store Decision (S3)

**Anchor:** Sprint Plan v3, Security Elevation Register S3.
**Decision date:** 2026-07-09 (Sprint 0)
**Decision:** Firestore, behind the existing `BffSource` entity interface, as the second driver alongside the prototype file store.
**Owner:** Zeshan

## Problem

The deploy target is Cloud Run (multi-instance, ephemeral filesystem per
instance, per `.github/workflows/deploy-prod.yml`). The prototype store
in `apps/web/src/lib/prototype-store/store.ts` is a per-instance disk
implementation using tmp + rename for atomic single-file writes. That is
adequate for local dev and CI, but on Cloud Run:

1. Records evaporate on redeploy.
2. Records diverge across instances (no shared filesystem, no coordination).
3. Read-modify-write races silently lose updates (S8).
4. Cross-entity invariants — PR-F's "atomic prefs write + history entry"
   spans two entities and cannot be enforced with a file-level rename.

Several BFF-owned entities become Rule 204-2 books-and-records the day
Form ADV files: receipts, RecordAccessLog, consents, disclosure
acknowledgements. Sprint Plan v3 pulls S3 forward from Sprint 6 to
Sprint 0 decision + Sprints 1–2 implementation for exactly this reason.

## Options considered

### A. Firestore (chosen)

- **Fit:** Serverless, no infrastructure to provision on our side, cheap
  at prototype scale, native TTL policies for session-scoped documents,
  transactions cover the S8 concurrent-write invariant.
- **Shape:** Per-entity collections map 1:1 to the current prototype
  entities. Document IDs mirror the file-key convention already used in
  the prototype store (e.g., `${authId}__${accountId}` for auth-session
  links, `${accountId}__${policyVersion}` for policy history).
- **Region:** us-central1 to match the Cloud Run region.
- **Auth:** Cloud Run service account with a scoped IAM role
  (`roles/datastore.user` on the target project). No admin SDK
  credentials in env.
- **Costs:** At Alpha 1 volume (10–25 users, <100 req/sec on any single
  entity), Firestore's free tier absorbs everything; steady-state cost
  is essentially the Cloud Run invocation cost. Recomputed at Alpha 2.

### B. Cloud SQL (Postgres) — rejected

- **Fit:** Would work; the entity interface is trivial to back with a
  Postgres row-per-entity schema.
- **Reject reason:** Provisioning + connection-pooling cost on Cloud Run
  is real (Cloud SQL Proxy sidecar or the Node driver's built-in
  pooling), and none of the current BFF-owned entities has a relational
  access pattern. No JOINs, no aggregates, no reports. All lookups are
  primary-key by construction. Paying for a relational engine we do not
  use is churn.

### C. Cloud Storage (GCS) with atomic multi-part writes — rejected

- **Reject reason:** No native transactions. The S8 invariant would be
  enforceable only through hand-rolled leases, which is exactly the
  class of code that becomes an incident three months in.

### D. Keep the file store and add distributed coordination — rejected

- **Reject reason:** Would require solving Cloud Run's ephemeral-FS
  problem first (Filestore + a shared mount, or a persistent volume via
  a workaround), plus a lock service. Every step is a new failure mode.

## Entity migration list

Every entity listed here has a current file-backed implementation under
`apps/web/src/lib/prototype-store/entities/`. The `BffSource` interface
already abstracts them; the Firestore driver implements the same
interface as a second implementation.

**Sprint 1 — lowest-risk, highest-frequency first:**

| Entity                   | File                        | Rationale                                                                                     |
| ------------------------ | --------------------------- | --------------------------------------------------------------------------------------------- |
| `auth-session-link`      | `auth-link.ts`              | Exercised by every authenticated request; prove the driver under load before touching records |
| `activation-idempotency` | `activation-idempotency.ts` | Small, well-scoped, already uses the idempotency-key pattern that S8 generalizes              |
| `session`                | `session.ts`                | Enables TTL (see below); demonstrates the eviction path                                       |

**Sprint 2 — compliance-relevant records:**

| Entity                       | File                            | Rationale                                                      |
| ---------------------------- | ------------------------------- | -------------------------------------------------------------- |
| `receipt`                    | `receipt.ts`                    | Rule 204-2 record; survives redeploys                          |
| `record-access-log`          | `record-access-log.ts`          | Every records/documents read writes here; completeness matters |
| `disclosure-acknowledgement` | `disclosure-acknowledgement.ts` | Consent evidence                                               |
| `subscription-mode`          | `subscription-mode.ts`          | Load-bearing for mode-branching UX; low churn                  |
| `managed-execution-state`    | `managed-execution-state.ts`    | Load-bearing for Managed users                                 |

**Sprint 3 — PR-F entities (land with the atomic prefs+history invariant):**

| Entity                  | File        | Rationale                                                        |
| ----------------------- | ----------- | ---------------------------------------------------------------- |
| `account-prefs`         | (new, PR-F) | Written under a Firestore transaction with account-prefs-history |
| `account-prefs-history` | (new, PR-F) | Immutable history, one entry per prefs write                     |

**Deferred / not migrated:**

- `advisory-profile`, `execution-policy-draft`, `execution-policy`,
  `profile-snapshots`, `disclosure-documents`, `brokerage-connection`,
  `decision-record`, `exception-review`, `recommendation-projection` —
  these are either seeded fixture data (upstream-owned) or narrow
  read-through projections that will be replaced by the Admin Portal
  proxy in Sprint 5. Migrating them to Firestore is churn we'd throw
  away.

## Retention posture per entity

| Entity                       | Retention                                                 | TTL     |
| ---------------------------- | --------------------------------------------------------- | ------- |
| `session`                    | Sliding, expire after 30 days idle                        | 30d TTL |
| `auth-session-link`          | Retain — traceability of who was linked when              | none    |
| `activation-idempotency`     | 7 days (idempotency window well past any realistic retry) | 7d TTL  |
| `receipt`                    | 5 years (Rule 204-2 books-and-records)                    | none    |
| `record-access-log`          | 5 years                                                   | none    |
| `disclosure-acknowledgement` | 5 years                                                   | none    |
| `subscription-mode`          | Retain (latest wins; history via events)                  | none    |
| `managed-execution-state`    | Retain                                                    | none    |
| `account-prefs`              | Retain (latest)                                           | none    |
| `account-prefs-history`      | Retain (immutable, 5 years)                               | none    |

TTLs are Firestore-native TTL policies keyed on an `expiresAt` field.

## Concurrency and atomicity (S8)

- All mutating routes require an idempotency key (activation already has
  this; Sprint 3 generalizes it into `lib/bff/` as a shared helper).
- Prefs PATCH carries a `version` field; the Firestore transaction reads
  the current version, and the write conditionally succeeds only if the
  version matches — 409 on mismatch.
- The prefs+history invariant runs inside a single Firestore transaction
  that touches both the `account-prefs` and `account-prefs-history`
  collections. Either both writes commit or neither does.

## Local dev, CI, tests

- `REFI_BACKING` per-entity matrix (see the backing-mode contract doc)
  keeps the prototype file store live in local dev and Playwright CI.
- Firestore emulator will be wired in Sprint 2 alongside the receipt /
  access-log migration for driver-parity tests. Until then, the file
  store is authoritative for tests; the Firestore driver is exercised
  in a staging smoke suite.

## Rollout order (Sprint 1 → Sprint 2)

1. Sprint 1: Firestore driver landing under `apps/web/src/lib/durable-store/` implementing `BffSource`.
2. Sprint 1: `auth-session-link`, `activation-idempotency`, `session` flipped to durable in staging via `REFI_BACKING`.
3. Sprint 2: receipts, record-access-log, disclosure-acknowledgement, subscription-mode, managed-execution-state flipped to durable in staging.
4. Sprint 2: `REFI_BACKING` defaults: `durable` in staging/prod, `prototype` in local dev and CI. Prod flip is per-entity and rollback is a config change, not a revert.
5. Sprint 3: PR-F's new entities land directly on the durable driver.

## Follow-ups

- Sprint 2 exports `REFI_BACKING` values as part of the CI evidence
  bundle so counsel can inspect the storage posture at any commit.
- Firestore export → GCS bucket configured Sprint 2 for the books-and-
  records retention path (S6 evidence-bundle work links this).
