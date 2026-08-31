# Backend observation — 2026-08-30 snapshot

**Addendum to** [launch-audit-2026-08-24.md](launch-audit-2026-08-24.md). Answers
that audit's §8 item 7 (the September 1 checkpoint) six days early, from direct
observation rather than estimate.

**Basis:** Daniel's backend snapshot supplied 2026-08-30 (local copy
`refinity-main-main-Aug-30th`), reviewed with his explicit invitation
("browse around. U can use the planning checklists in docs/planning to kinda
gauge what will still change", 2026-08-30 19:10). Read-only inspection; nothing
in that repository was modified. Counts are from `docs/planning/*.md` checkbox
state; existence claims are from the working tree.

**Daniel's stated timeline, same conversation:** mid-week (≈2026-09-02) for the
contract package, still accurate as of 2026-08-30.

---

## 1. Progress is real and fast

Checked items across the six governing checklists, Aug 24 → Aug 30 (six days):

| Checklist                            | 2026-08-24 |    2026-08-30 |        Δ |
| ------------------------------------ | ---------: | ------------: | -------: |
| 01 Dev platform & delivery           |   68 / 194 | **137 / 194** |      +69 |
| 02 Data/event/IAM contracts          |    0 / 150 |  **28 / 150** |      +28 |
| 03 Index data plane                  |    0 / 173 |  **77 / 173** |      +77 |
| 04 Portfolio construction/activation |    0 / 164 |  **58 / 164** |      +58 |
| 05 Account/investor lifecycle        |    0 / 294 |   **0 / 294** |        — |
| 06 Verification/release              |    0 / 204 |   **0 / 204** |        — |
| **Total**                            |     **68** |       **300** | **+232** |

≈39 items/day sustained. This is not checkbox progress: `mc04_ft04_1_evidence.md`
is dated 2026-08-30 and carries a Spanner migration id (`M0207`), DDL SHA-256,
"152/152 statements completed", before/after schema hashes, and an immutable
GCS receipt with its own SHA-256. MC-03 ran through FT03-5 (Dev activation);
MC-04 has deterministic Portfolio Manager construction and transition-core
evidence. The evidence discipline the checklists demand is being met.

**Qualifier in his own words:** MC-03 FT03-3/FT03-4 evidence describes those
slices as "complete as a **non-connected shadow slice**" — built and
deterministic, not yet wired end to end.

## 2. The frontend's dependency has not started

**MC-05 (account/investor lifecycle) is 0 / 294.** That checklist is the entire
surface this repository integrates with: `investor-api`, identity, authorization,
preferences, valuation, the personalized recommendation, the account event
stream.

Confirmed three ways in the snapshot:

1. MC-05 line 311, Daniel's own text: "skeletons and `apps/investor-api` does
   not exist."
2. No `apps/investor-api` directory exists.
3. `apps/identity-ccid` contains zero Python files.

MC-05 §1.1 also names our blocked slice precisely: _"The BFF can replace mocks
using only the deployed `v1.0.0-dev.1` connection package and dedicated Investor
API."_ That is C1b-2's dependency (D-SIGNAL-02), stated from his side.

## 3. WARNING — do not integrate against the in-repo frontend contract

`docs/authoritative/frontend_integration_contract.md` looks like the package we
have been waiting for. **It is not.**

- Snapshot date **2026-05-29** — pre-migration.
- Zero occurrences of `investor-api`, `recommendation`, `AccountRecommendation`,
  or `direct index`.
- It describes the retired ML/RL pipeline: `stream_id` identities of the form
  `AAPL~rf` / `AAPL~rl`, `inference-worker` writing latest-state `signals` rows,
  signal values `1 / -1 / 0`.

`docs/authoritative/executive_overview.md` carries the same 2026-05-29 date and
the same pre-migration framing. Building against either would implement the
architecture the direct-index shift replaces. **The Signal-era investor contract
does not exist in the repository yet** — consistent with Daniel producing it for
the mid-week package, and it means D-SIGNAL-02 remains genuinely open rather
than quietly satisfied.

## 4. Evidence bearing on D-LAUNCH-06 (the execution question)

Not an answer, but the strongest written signal to date, and it points the same
way as the Ship Contract.

MC-05 §1.1 completion outcomes, current and unchecked:

> "A Signal recommendation cannot reach Risk, Exec, Trade, an order topic, or a
> broker under any status or failure condition."

> "An authorized Signal account can join the one approved active template and
> receive a durable recommendation **without `autopilot_enabled=true`**."

His live planning documents therefore still define Signal Dev Release 1 as
non-executing, which does **not** match the execution-capable alpha his
2026-08-24 verbal notes described (live funds, "the last x trades sent on their
behalf"). A full-text search of `docs/planning/*.md` for "September", "alpha
user", and "live fund" returns nothing: the checklists are silent on launch
date, cohort, and capital. So the written architecture has not moved toward
execution, and **D-LAUNCH-06 stays open** — the yes/no still has to come from
Daniel, not from inference.

## 5. Calendar consequence — the §8 item 7 checkpoint, answered

Remaining unchecked to Dev Release 1: 57 + 122 + 96 + 106 + 294 + 204 ≈ **879
items**. At the observed ≈39/day that is ~22 days — landing near **2026-09-21**,
past the 2026-09-12 freeze.

Sequencing is the harder constraint than the arithmetic:

- MC-05 is 294 items, unstarted, and gated behind MC-02/03/04 completion
  (MC-02 in particular is only 28/150).
- MC-06 (204 items) consumes MC-05's output and includes the Dev Release 1
  acceptance gates themselves.
- The audit's hardest calendar item — MC-03's ten-day source-observation window
  — is now moot as a blocker in the way it was framed on 2026-08-24: MC-03 is
  77/173 with FT03-5 Dev activation evidence recorded, so observation has begun.
  The binding constraint has moved to MC-05/06.

**Conclusion:** on the checklists' own terms, a complete Signal Dev Release 1 by
2026-09-12 is not reachable, and this repository's integration dependency is
last in the queue rather than first. This is a sequencing finding, not a
criticism of pace — the pace is high and the evidence quality is good.

The audit's three options stand unchanged and now need a decision rather than a
checkpoint: (a) accept September 13 as a candidate **with recorded exceptions**
against a thinner vertical slice, (b) move the date, or (c) thin the gate
deliberately and in writing. What must not happen is an undeclared thinning.

## 6. What this repository should do

1. **Do not build against `frontend_integration_contract.md`** (§3). Wait for
   the mid-week package; treat anything dated 2026-05-29 as pre-migration.
2. **C1b-2 stays blocked** on D-SIGNAL-02, exactly as the register records —
   now confirmed from the backend side rather than inferred from silence.
3. **Frontend work that is genuinely independent may continue** — the Investor
   Profile slices (spec `investor-profile-spec.md`) touch no backend contract
   and are valid under every reading of the launch.
4. **Re-ask D-LAUNCH-06 and the reframed D-SIGNAL-01 with the package**, since
   the package is the natural moment those answers become load-bearing.
5. **Re-run this observation when the package lands** and record the delta here.
