# SHIP CONTRACT — September 13, 2026 · Signal Dev Release 1 Candidate

**Canonical.** Supersedes the milestone framing in
[launch-contract.md](launch-contract.md) (see its supersession notice).

**Authority:** Daniel's governing architecture set, supplied 2026-08-22 —
`exec_overview_v2.md` (executive architecture overview) and
`arch_migration_overview.md` (backend migration overview). Both are external
documents not yet committed to this repository (Daniel's authorization
pending); dated copies are held in the 2026-08-22 recovery directory. Section
references below cite those documents. Where this contract and those documents
disagree, the documents win.

## Milestone definition

Daniel's release progression (`exec_overview_v2.md` §13; also
`arch_migration_overview.md` §14 "Release boundaries"):

```
Signal Dev Release 1 → Managed paper → staging → Production Signal alpha → live Managed
```

**September 13, 2026 is a Signal Dev Release 1 Candidate: a
production-shaped, technically complete Signal release in `refinity-dev`.**

It is **NOT**:

- Production Signal alpha,
- real advisory-client activation,
- Managed paper,
- live Managed,
- authorization to skip Managed-paper validation before Production Signal.

Managed paper is **not required to accept** Signal Dev Release 1 — and it IS
the next milestone before staging and Production Signal alpha. Promotion
reuses the exact accepted artifacts; completing one milestone does not enable
the next (§13, §14).

## Required vertical slice (arch_migration_overview §14, Signal Dev Release 1)

```
credible source evidence
  → canonical membership
  → actionable asset and price readiness
  → immutable Portfolio Manager construction
  → Portfolio Engine active subscribed target
  → reconciled account valuation
  → current identity / authorization / profile / preferences
  → personalized immutable AccountRecommendation + queryable legs
  → Investor API
  → external BFF
  → Signal frontend
```

"The release includes no paper or live order effect. The absence of an
execution path is a structural property of deployment and IAM, not a product
promise enforced only by a frontend flag." (§14)

## Required September user capability

Sources: `exec_overview_v2.md` §7.1–§7.5 (investor architecture and the
Investor API Signal surface), §7.4 (recommendation content).

- email-first authentication (`identity-ccid`; SIWE reserved for future
  wallet linking, not login)
- current authorization / eligibility / KYC machinery
- advisory profile
- disclosures and consent machinery
- account/template membership
- supported preferences (`driftThreshold`, `minOrder`, `excludedAssets`,
  `fractionalEnabled`)
- broker/account observation needed for advice
- reconciled valuation
- a REAL personalized recommendation (backend-generated, immutable,
  deterministic for its economic inputs)
- recommendation summary + constituent legs (paged)
- explicit exclusions / unavailable assets / residual cash / expected
  turnover / tracking difference — never silently redistributed
- backend-owned freshness (content status, lifecycle status, freshness
  distinct; §7.4)
- records / action receipts and reconstructable lineage

## Required September safety properties

Sources: §14 no-execution requirement; §2.3 non-custodial boundary and
credential isolation; §7.5 Investor API exposure limits; §8 separated
runtimes.

- no executable `AccountIntent`
- no Managed promotion
- no execution-policy investor mutation
- no investor mode activation
- no order submission
- no risk→execution publication
- no Signal service identity with broker-write authority
- no broker-write credential in the frontend, Investor API, or
  recommendation runtime
- cross-account isolation
- structural absence/disablement of deferred execution capability — "a
  reachable but supposedly unused feature is not safely deferred"
  (`arch_migration_overview.md` §17)

## Required delivery / evidence

Sources: `arch_migration_overview.md` §13 (delivery/environments — manually
approved deployments of immutable digests, release manifest) and §16 (work
products and evidence).

- reproducible production-shaped Dev deployment (`refinity-dev` is the sole
  active backend environment)
- exact immutable artifact identity (digests, not mutable tags)
- CI and production-artifact E2E
- build / deploy / verify / rollback evidence
- exact schema / API / event / policy versions
- deterministic replay/reconstruction sufficient for the release gate

## Explicitly deferred (arch_migration_overview §17)

Managed broker submission and Managed investor controls · Managed paper
completion itself · Production Signal · staging · live capital · SIWE /
wallet-first identity · liquidation · tax optimization · international
expansion · multi-broker routing · destructive removal of legacy
architecture.

## Named Daniel dependencies (unresolved; do not decide silently)

- **D-SIGNAL-01** — Signal broker-connection contract (live-account read
  without broker-write authority; mechanism is the backend's).
- **D-SIGNAL-02** — Investor API connection package: dev URL, OIDC audience,
  workload identity, seeded test IDs, exported `v1.0.0-dev.1` route/schema
  package.
- **D-REMEDIATION-01** — remediation-completion contract that closes
  exceptions.
- **D-DISCLOSURE-01** — Signal disclosure acknowledgement write path (legacy
  browser-direct today).
- **D-SUPPORT-01** — support ticket sink.
- No September production hostname, production environment, real-client
  cohort, or legal activation date exists or is invented here.
