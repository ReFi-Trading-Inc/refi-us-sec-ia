# September 12 Launch Audit — 2026-08-24

**Scope:** readiness audit for the September 12 freeze / September 13 milestone, run against
`c2a-structural-signal-surface @ 19c598b` (5 commits ahead of `origin/main @ 6803f09`),
the six updated backend checklists Daniel supplied 2026-08-24 (in `september-12-launch/`),
and Daniel's verbal response of 2026-08-24.

**Status:** tracked in this folder's canon as of the C2a branch; supersedes nothing —
companion to SHIP_CONTRACT.md and open-items.md.

---

## Verdict

**The launch is not currently one launch.** The repository's canonical milestone
(SHIP_CONTRACT.md: _Signal Dev Release 1 Candidate — advice only, structurally no
execution_) and Daniel's 2026-08-24 verbal direction (_alpha users put live funds on it…
see the last x trades sent on their behalf… a managed fund following stock portfolio in
minutes_) describe **two different products**. Until that is reconciled in writing, no
schedule assessment is meaningful, because the two definitions have different critical
paths, different frontend surfaces (one of which C2a just structurally removed), and
different regulatory postures.

Independently of the definition conflict, **backend schedule risk is severe**: Daniel is
mid-way through checklist 01 of 6 (68/193 items; checklists 02–06 stand at 0/985), and
the Dev Release 1 gate (MC-06B) requires 01→05 plus MC-06A complete. Nineteen days remain
to the September 12 freeze.

---

## 1. What September 12/13 means on paper

- `SHIP_CONTRACT.md` (canonical, 2026-08-23): **September 13 = Signal Dev Release 1
  Candidate** in `refinity-dev` — production-shaped, technically complete Signal release.
  Freeze September 12.
- Explicitly **not**: Production Signal alpha, real advisory-client activation, Managed
  paper, live Managed.
- Required safety properties include: no executable `AccountIntent`, no order submission,
  no Signal service identity with broker-write authority, structural absence of deferred
  execution capability.
- Gate A (engineering) / Gate B (legal) split stands; all six disclosure documents remain
  `status: "pending"` — correct for Gate A, blocking for Gate B.

## 2. Finding 1 — Launch definition conflict (CRITICAL)

Daniel's 2026-08-24 response, read literally, describes an execution-capable alpha:

| Daniel's statement (point)                                                     | Implication                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| "We can let alpha users put live funds on it to test the system" (3)           | Live capital in September alpha                                                      |
| "max 2% of net worth on alpha system or … massive risk disclaimer" (3)         | New frontend requirement: net-worth-based allocation gate in the risk questionnaire  |
| "they get a managed fund following stock portfolio in minutes" (5)             | Managed, not Signal                                                                  |
| "last x trades (and metadata) **sent on their behalf** from our system" (9)    | Trade execution exists and is user-visible — a surface C2a just removed as Managed   |
| "The system has and must have write authority in order to execute trades" (11) | Did not recognize the Signal no-broker-write question; answered for the whole system |

Against this, Daniel's **own written architecture** — the same documents pinned by SHA-256
in SHIP_CONTRACT.md — says Signal Dev Release 1 "includes no paper or live order effect"
and sequences Signal Dev → Managed paper → staging → Production Signal alpha → live
Managed, with Managed paper validated **before** any live-capital program. His verbal
plan skips to live capital while he is still on checklist 01, before Managed paper
(MC-06C) even begins.

Possible readings (do not pick one silently):

1. Daniel is describing the **eventual** alpha (post-Dev-Release-1) informally, and
   September 13 remains Signal-only. His point that paper accounts are "recommended"
   partially supports this.
2. Daniel has **re-scoped September 13** to an execution-capable alpha, contradicting his
   own governing documents and the ship contract.

**This is the first thing to close with him, in writing, as a yes/no:** _does the
September 13 artifact submit orders to any broker account (paper or live) on a user's
behalf — yes or no?_ Every other decision inherits from that answer.

Note also that reading (2) conflicts with Zeshan's own recorded gate (2026-08-22 email:
"we are not launching a customer facing product until we have had SEC specialized counsel
look at the product") — live alpha funds are a Gate B event, not a Gate A event.

## 3. Finding 2 — Backend schedule vs. the gate chain (SEVERE)

Required chain for Dev Release 1: `MC-01 → MC-02 → MC-03 → MC-04 → MC-05 → MC-06A → MC-06B`.

| Checklist                            | Items checked  | State                                                                                                                                           |
| ------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Dev platform & delivery           | 68 / 193 (35%) | Phases 0–3 done; **Phases 5–10 (release artifact, manifest, deploy workflow, integration harness, pilot/rollback drill) essentially unstarted** |
| 02 Data/event/IAM contracts          | 0 / 150        | Not begun                                                                                                                                       |
| 03 Index data plane                  | 0 / 173        | Not begun — includes a **ten-day source observation window** (MC-06 §1), which alone nearly consumes the remaining calendar                     |
| 04 Portfolio construction/activation | 0 / 164        | Not begun                                                                                                                                       |
| 05 Account/investor lifecycle        | 0 / 294        | Not begun — `index-data-loader` and `investor-api` do not exist; `identity-ccid`/`compliance-adapter` are skeletons (migration overview §2)     |
| 06 Verification/release              | 0 / 204        | Not begun                                                                                                                                       |

Daniel confirms: "Currently working through migration planning checklist 01."

**Assessment:** completing ~1,110 gated items in 19 days is not plausible on the
checklists' own terms. Either (a) September 13 is accepted as a _candidate with recorded
exceptions_ against a much thinner vertical slice, (b) the date moves, or (c) the gate
definition is thinned deliberately and in writing. What must not happen is an undeclared
thinning — the checklists exist precisely to prevent "backend ready" by assertion.

The ten-day MC-03 source-observation window is the single hardest calendar item: to
finish by September 12 it must **start by ~September 2**, which requires MC-02's relevant
waves first, which requires MC-01's delivery path. That is the backend critical path.

## 4. Finding 3 — Frontend repo state (this repo)

| Slice                                                    | State                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0 capability audit                                      | done                                                                                                                                                                                                                                                                                      |
| C1b-1 live credentials + dead execution surface          | merged (#49)                                                                                                                                                                                                                                                                              |
| C1a-1 default-deny capability policy                     | closed (#51)                                                                                                                                                                                                                                                                              |
| **C2a Managed removal + IA move + exception split**      | **in progress, unmerged** — branch is 5 commits ahead of `main`; 1 dirty file (`receipt.ts` verb-vocabulary rename — coherent, references exist; commit it)                                                                                                                               |
| C1b-2 browser-direct endpoint retirement (~25 endpoints) | **blocked on D-SIGNAL-02** — Daniel now promises the connection package "Wednesday-ish" (~Aug 26), but adds "all service modifications need to be in place before I send you something," while the backend is "still in flux." Treat the date as soft; this is the frontend critical path |
| C2b release-authority Signal lane (11 proofs)            | queued after C2a                                                                                                                                                                                                                                                                          |
| C2c deployment/IAM evidence                              | external (Gate A evidence, backend)                                                                                                                                                                                                                                                       |

New frontend scope from Daniel's point 9 (survives either launch definition):

- Investor-profile risk questionnaire (net worth, risk tolerance) with an
  **alpha allocation gate** (e.g. max 2% of net worth) and/or heavy alpha risk sign-off —
  not in any current plan; needs a decision on gate vs. disclaimer and then a slice.
- "Coming soon" banners acceptable for dummied surfaces — cheap, do late.
- "Last x trades sent on their behalf" — **do not build** until Finding 1 resolves; it is
  the exact Managed surface C2a removed.

Also per point 2: the constituent/inclusions page is explicitly **not needed** for
September 13 — scope relief.

## 5. Finding 4 — Regulatory and licensing flags (for counsel, not resolved here)

1. **Live funds in alpha** (point 3) before counsel sign-off directly contradicts the
   recorded Gate B and Zeshan's 2026-08-22 email. If live funds are in scope at all, the
   counsel review moves from "before client onboarding" to "before September 13."
2. **Data licensing** (point 7): Daniel's claim that the sources are "public domain" is
   not safe as stated. Wikipedia text is **CC BY-SA, not public domain**. Index
   _membership facts_ may be uncopyrightable, but S&P Dow Jones actively licenses index
   data and the "S&P 500" name for financial-product use; benchmark display and
   product-naming use need a counsel pass. D-LAUNCH-05 should be treated as
   **answered-but-unverified**, not closed.
3. **203A-2(e)**: Daniel asserts alignment is unchanged, but the facts he added
   (execution on behalf of users, live funds, operator-run promotion during alpha) are
   exactly the facts counsel must evaluate. D-LAUNCH-00 remains open.
4. **Alpha users on `refinity-dev`** (point 4) with money at stake, before gated CI/CD
   exists (MC-01 Phases 5–10 unstarted) — Daniel acknowledges the trade-off; record it as
   an accepted-risk decision if it stands, with the DCA/slow-index-change mitigation he
   cites.

## 6. Open-items register — deltas from Daniel's 2026-08-24 response

| ID                                                           | Old state                    | New state                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-SIGNAL-01 broker-connection contract                       | OPEN, message drafted unsent | **OPEN — question not understood.** Re-ask in his vocabulary: his own exec overview §8.1 separates the Signal recommendation builder from the Managed promoter as different runtimes/service identities, and §10 says broker credentials are dereferenced only by broker-sync and Trade Manager. The question is _which service identity holds write credentials_, not whether the system ever has them.                                    |
| D-SIGNAL-02 Investor API package                             | OPEN                         | ETA "Wednesday-ish" (~Aug 26) with full contract packages; soft date; unblocks C1b-2                                                                                                                                                                                                                                                                                                                                                        |
| D-REMEDIATION-01                                             | OPEN — backend               | Unaddressed                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D-DISCLOSURE-01                                              | OPEN                         | Unaddressed                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D-SUPPORT-01                                                 | OPEN                         | Unaddressed                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D-LAUNCH-00 SEC alignment                                    | OPEN                         | Asserted on-track by Daniel; **new facts (execution, live funds) change the question** — still open, now more urgent                                                                                                                                                                                                                                                                                                                        |
| D-LAUNCH-03 manual alpha ops                                 | UNRESOLVED                   | **Answered:** near-automated expected; operator-driven acceptable; remaining regulatory targets explicitly _not_ all hit by Sept 13                                                                                                                                                                                                                                                                                                         |
| D-LAUNCH-05 source/naming rights                             | UNRESOLVED                   | **Answered by Daniel, flagged by this audit** — see Finding 4.2                                                                                                                                                                                                                                                                                                                                                                             |
| D-LAUNCH-01/02 closures                                      | CLOSED via ship contract     | **Partially contradicted** — `refinity-dev` confirmed as the alpha environment, but now with external users and possibly live funds; `refinity-prod` planned "a couple months from now" (~$500/mo from ~$7k GCP credits)                                                                                                                                                                                                                    |
| Governing checklists "not received" caveat (launch-contract) | Standing caveat              | **CLOSED 2026-08-24** — Daniel supplied all six numbered specifications in their current working state. Still not held locally: `master_checklist.md` and the `./docs/authoritative` contract set (trade lifecycle, auditability, retention, frontend integration) — Daniel points to the GitLab backend repo (`./docs/planning`, `./docs/authoritative`) as their canonical home; obtain read access rather than waiting on emailed copies |

## 7. Hygiene items that matter this week

- **Branch protection on `main`** — owner Zeshan, still not enabled; Daniel's write
  access and "full contract packages" arrive next week. Do this first.
- **C2a**: finish, commit the dirty `receipt.ts`, merge. It is correct under the ship
  contract regardless of Finding 1's outcome (Managed surfaces return, if ever, via a
  governed re-add, not by keeping dead code).
- Untracked governance set awaiting adjudication: `compliance/CONTROL_MATRIX.md` (stale —
  claims e2e not in CI, false since #47), `docs/branch-disposition-register.md`,
  `THREAT_MODEL-alpha-handoff.md`, `PROD_BRIEF.md`, the invariants test, `.claude/`,
  `september-12-launch/` (Daniel's docs — he has now sent them directly and points to the
  GitLab repo `./docs/planning` + `./docs/authoritative` as their home; get his explicit
  OK before committing copies here).
- Drafted-unsent Dan messages (D-SIGNAL-01/02) are overtaken by events — replace with the
  Finding 1 yes/no question plus the reframed D-SIGNAL-01.
- PROD_BRIEF observability tokens (Sentry auth token, PostHog personal key) still
  missing — with external alpha users on the horizon, production error/funnel visibility
  stops being optional. POSTHOG-CSP decision also still open.

## 8. Recommended sequence (next 7 days)

1. **Today:** send Daniel the one-question definition closer (Finding 2's yes/no) plus
   the reframed D-SIGNAL-01. Everything else queues behind it.
2. **Today:** enable branch protection on `main`.
3. **This week:** finish and merge C2a (including the dirty `receipt.ts`); start C2b.
4. **This week:** design the investor-profile questionnaire + alpha allocation gate
   (needed under every reading of the launch).
5. **On package arrival (~Aug 26):** immediately start C1b-2 against the exported
   contract — the frontend critical path.
6. **This week:** book the counsel review; if live funds survive Finding 1, counsel moves
   ahead of September 13, not after.
7. **Sept 1 checkpoint:** if MC-03's ten-day observation window has not started by
   ~Sept 2, the Signal Dev Release 1 gate cannot close by Sept 12 on its own terms —
   decide then between a recorded-exception candidate or a date move, in writing.
