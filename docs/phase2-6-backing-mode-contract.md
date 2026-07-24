# Backing-Mode Contract (`REFI_BACKING`)

**Anchor:** Sprint Plan v3, Sprint 0 exit criterion.
**Purpose:** durable-storage hook. The BFF stays stateless; the prototype file store, the durable driver (Firestore, per the durable-store decision doc), and the backend proxy all sit behind the same `BffSource` entity interface. Flipping an entity from one backing to another is a config change plus a green conformance run, not a code change.

## The four modes

| Mode        | Meaning                                           | Where the data lives              |
| ----------- | ------------------------------------------------- | --------------------------------- |
| `msw`       | Mock Service Worker fixtures in the browser       | In-memory in the test browser     |
| `prototype` | File-backed prototype store on the BFF's local FS | `apps/web/.refi-prototype-store*` |
| `durable`   | Firestore (per S3 decision doc)                   | GCP Firestore, region us-central1 |
| `backend`   | Admin Portal proxy (Daniel's stack)               | Spanner via refinity-main         |

## Per-entity matrix

Only entities that this repo _owns_ have `prototype` and `durable` modes. Entities the Admin Portal owns have `msw` (browser mock) and `backend` only.

| Entity                             | Owner        | Valid modes        | Default (dev) | Default (staging) | Default (prod) |
| ---------------------------------- | ------------ | ------------------ | ------------- | ----------------- | -------------- |
| `session`                          | BFF          | prototype, durable | prototype     | durable           | durable        |
| `auth-session-link`                | BFF          | prototype, durable | prototype     | durable           | durable        |
| `activation-idempotency`           | BFF          | prototype, durable | prototype     | durable           | durable        |
| `receipt`                          | BFF          | prototype, durable | prototype     | durable           | durable        |
| `record-access-log`                | BFF          | prototype, durable | prototype     | durable           | durable        |
| `disclosure-acknowledgement`       | BFF          | prototype, durable | prototype     | durable           | durable        |
| `subscription-mode`                | BFF          | prototype, durable | prototype     | durable           | durable        |
| `managed-execution-state`          | BFF          | prototype, durable | prototype     | durable           | durable        |
| `account-prefs` (Sprint 3)         | BFF          | prototype, durable | prototype     | durable           | durable        |
| `account-prefs-history` (Sprint 3) | BFF          | prototype, durable | prototype     | durable           | durable        |
| `intents`                          | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `risk-decisions`                   | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `orders` (lifecycle)               | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `fills`                            | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `control-states`                   | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `reconciliation`                   | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `templates`                        | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `memberships`                      | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `rules`                            | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `accounts`                         | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `account-flow`                     | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `risk-limits`                      | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `orders-blocked`                   | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `broker-interactions`              | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `execution-plans`                  | Admin Portal | msw, backend       | msw           | backend           | backend        |
| `trading-controls`                 | Admin Portal | msw, backend       | msw           | backend           | backend        |

The `alpha-application` entity (F-track, Sprint 2) is BFF-owned with the same `prototype` / `durable` posture.

## Env encoding

Per-entity overrides use the pattern `REFI_BACKING__<ENTITY_NAME>=<mode>`, where `<ENTITY_NAME>` is the SCREAMING_SNAKE variant of the entity id. A global default `REFI_BACKING_DEFAULT=<mode>` fills gaps.

Examples:

```
REFI_BACKING_DEFAULT=durable
REFI_BACKING__SESSION=durable
REFI_BACKING__RECEIPT=durable
REFI_BACKING__RECORD_ACCESS_LOG=durable
REFI_BACKING__INTENTS=backend
```

The env is validated at boot by the Zod schema in `apps/web/src/lib/config/env.ts` (see the `REFI_BACKING` block). Unknown entities, invalid modes, or mode-entity combinations from outside the per-entity matrix reject at boot with a clear error. There is no runtime silent-fallback.

## Flip semantics

- Flipping a BFF-owned entity from `prototype` to `durable` in staging is a per-entity env change. No code change, no rollback via revert.
- Flipping an Admin Portal entity from `msw` to `backend` requires D4 (staging URL + service auth) and either D2-ratified or explicitly flagged rows.
- Rollback is symmetric: flip the env back, redeploy, done.

## Conformance and scoreboard

Every entity in `backend` mode has a nightly `@live` Playwright run that asserts the entity's conformance to Contract V3 against staging. Green rows update the README scoreboard automatically; drift flags the exact unexpected field (see Sprint 5 conformance suite).

## Local dev and CI

- Local dev boots with all entities in `prototype` or `msw`. No Firestore, no Admin Portal, no external calls.
- Playwright CI runs against `prototype` for BFF-owned entities and `msw` for Admin Portal entities. The Firestore emulator is wired in Sprint 2 for driver-parity tests.
- Only the deployed staging and prod builds carry `durable` / `backend`.
