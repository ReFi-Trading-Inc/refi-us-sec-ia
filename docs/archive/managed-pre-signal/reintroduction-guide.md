# Managed reintroduction guide

**Managed is deferred, not abandoned.** In Daniel's release progression it is
the very next milestone after Signal Dev Release 1 (Managed paper), ahead of
staging and Production Signal alpha. This archive preserves roughly a product's
worth of built, tested Managed behaviour so that work starts from evidence.

**But the code must not be merged back wholesale.** The archived
implementation predates the governing architecture, and reintroduction is a
reconciliation exercise, not a revert of PRs #49–#52.

Any future Managed implementation must reconcile with, in order:

1. **The advisory-object chain** — `AccountRecommendation` (immutable,
   account-level, queryable legs) → **Managed promotion** (a separately
   authorized runtime) → **`AccountIntent`** (a distinct executable record,
   never a mutated recommendation) → **Risk** (binary, terminal rejections) →
   **Exec Gateway** (builds plans only from approved decisions) → **Trade
   Manager / broker** → **reconciliation** (broker truth outranks API
   success). The archived product has none of this chain; its
   `RecommendationProjection.executing` status is precisely the conflation the
   target architecture forbids.
2. **The exported Investor API contract** (`v1.0.0-dev.1`+) — not the
   archived `/v1/*` prototype shapes, and never browser-direct.
3. **Separated runtime identities** — the Signal runtime and the Managed
   promoter are distinct identities with distinct authority; no Signal service
   identity holds broker-write authority, and broker credentials stay isolated
   to the few runtimes that need them.
4. **The broker authority model** — live-account access through a read-only
   authorization for Signal; write authority only for the Managed execution
   runtimes, under the broker-connection contract Daniel defines
   (D-SIGNAL-01).
5. **The counsel-approved product boundary** — Gate B of the launch contract:
   Managed investor controls ship only inside whatever advisory-product
   boundary counsel approves, with the disclosure set finalized.

What transfers most readily, per the inventory: the **domain designs** (verb
taxonomy and its Daniel-pinned contract assertions, receipt semantics,
append-only policy versioning, MES transition model, exception Ui↔backend
alias layer) and the **behavioural record in the archived e2e specs**, which
document intended Managed UX far better than prose. What does not transfer:
the browser-direct call topology, the prototype `/v1` contracts, the uniform
six-category exception handler, the raw-key broker flow, and every surface the
inventory marks SUPERSEDED.

Practical mechanics: cherry-pick nothing directly onto a future branch without
first re-deriving the surface against the then-current capability policy
(`sec203a/release-policy.ts`), which will need a `managed_paper` stage
allowlist derived from Daniel's contract rather than from this archive.
