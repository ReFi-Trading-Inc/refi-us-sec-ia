# Integration completion roadmap

**Goal:** reach 100% _integration_ on two tracks — **(1) the alpha acquisition
funnel** and **(2) the full live investor product** — so the game, shell,
handoff, and Daniel's backend operate as one cohesive system that eventually
replaces refi.trading with a US-geo compliant funnel.

Scope note: this roadmap is **integration only**. Legal/counsel is a _parallel
gate_ that blocks public launch — tracked in
[`alpha-go-live-checklist.md`](alpha-go-live-checklist.md) §C, not repeated here.

Baseline (integration-only, today): **Track 1 ≈ 40%**, **Track 2 ≈ 25–30%**.
Most of Track 1's remaining distance is deployment/activation you control, not
new code.

Status legend: ✅ done · 🟡 built, not activated · 🔴 not started · owner in [ ].

---

## Track 1 — Alpha acquisition funnel → 100%

Player plays the game → mints a handoff token → shell verifies + binds → lands
in eligibility → durable waitlist signup, with a verified identity and funnel
analytics, no dead-ends. (= "Alpha 0" acquisition.)

| #   | Step                                                                                                                                         | Status | Owner        | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | ---------- |
| 1.1 | Provision infra: Neon Postgres, Firestore (`terraform apply`), Firebase project                                                              | 🔴     | you          | —          |
| 1.2 | ES256 key exchange (game private / shell public); deploy Cloud Run mint svc + secrets; deploy game w/ `VITE_HANDOFF_URL` + `VITE_FIREBASE_*` | 🔴     | you          | 1.1        |
| 1.3 | Activate: `REFI_BACKING__ALPHA_*=durable`, `REQUIRE_VERIFIED_IDENTITY=true`                                                                  | 🔴     | you          | 1.2        |
| 1.4 | Merge game PRs #3 (handoff), #4 (landing), #5 (identity); close shell alpha-claim polish #17/#19/#20/#21                                     | 🟡     | eng          | —          |
| 1.5 | Onboarding **past eligibility** — resolve the SIWE wall (D8): email-native Signal-mode path, wallet deferred to ExecutionPolicy signing      | 🔴     | eng + Daniel | D8         |
| 1.6 | Game compliance pass: RLS owner-scoping, §62 labels beyond the landing, G0 typecheck debt (spec §3.3)                                        | 🔴     | eng          | —          |
| 1.7 | One verified end-to-end run on prod; PostHog funnel (acquisition→claim→eligibility) live (#20)                                               | 🔴     | eng + you    | 1.2–1.6    |

**Exit criteria:** a real player completes play → claim → eligibility → durable
signup, identity is a verified Firebase uid, the funnel is measured in PostHog,
and no step dead-ends.

---

## Track 2 — Full live investor product → 100%

Onboarded users run **Signal mode** (read-only recommendations) and later
**Managed** against Daniel's real data via the Admin Portal proxy.

| #   | Step                                                                                                                                            | Status | Owner        | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | ---------- |
| 2.1 | Land the Admin Portal proxy + investor routes onto `main` (from the unmerged Phase 2.6 branch; narrow, gated)                                   | 🔴     | eng          | —          |
| 2.2 | Daniel deps: staging base URL + service auth (**D4**), canonical AccountPrefs writer + parity fixtures (**D6**), account-auth decision (**D8**) | 🔴     | Daniel + you | —          |
| 2.3 | Flip investor entities `msw→backend` per `REFI_BACKING`; conformance suite green `@live` against staging                                        | 🔴     | eng          | 2.1, 2.2   |
| 2.4 | Onboarding → **Signal mode** live (read-only), invited Alpha 1 cohort                                                                           | 🔴     | eng          | 2.3, 1.5   |
| 2.5 | **Managed** (paper) — Alpha 2, Daniel-gated (exec-gateway + Alpaca)                                                                             | 🔴     | Daniel       | 2.4        |

**Exit criteria:** invited users onboard to live Signal mode against Daniel's
staging/prod data with the conformance scoreboard green.

---

## Shared / cross-cutting (supports both tracks)

| Item                                                                                                                                                         | Status | Owner     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| Security backlog to closure: rate limiting #26/#19, CSP + wallet split #30, E2E-in-CI #29                                                                    | 🟡     | eng       |
| Durable books-and-records for **all** compliance entities (extend #27 beyond alpha)                                                                          | 🟡     | eng + you |
| **refi.trading consolidation** → US-geo compliant marketing funnel that feeds game + eligibility, with an investor "book a meeting" on an About/Company page | 🔴     | eng + you |

---

## Milestones (align to spec phasing)

- **Alpha 0** — Track 1 live + game public soft launch (acquisition funnel proven).
- **Alpha 1** — Track 2.4: Signal-mode live, 10–25 invited from the scored waitlist.
- **Alpha 2** — Track 2.5: Managed paper, Daniel-gated.

## Definition of done ("both complete")

1. Track 1 exit criteria met.
2. Track 2 exit criteria met.
3. refi.trading replaced by the compliant funnel.
4. Counsel sign-off obtained (separate gate — `alpha-go-live-checklist.md` §C).

> Fastest path: Track 1 is mostly _your deploys_ + a few code items I can do
> (1.5 D8 path, 1.6 game compliance, 1.4 alpha-claim polish). Track 2's long
> pole is Daniel (D4/D6) + landing the proxy — start 2.1/2.2 in parallel since
> they gate the most.
