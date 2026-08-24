# compliance/

This directory holds the engineering-side compliance evidence for the investor
platform. Its centerpiece is [`CONTROL_MATRIX.md`](./CONTROL_MATRIX.md): a
living map of regulation-relevant control → implementing code → verifying
test/CI gate → current evidence status. It is Gate A evidence for the
September release (see `docs/releases/2026-09-signal/`).

## Purpose

The matrix makes every compliance claim checkable. If a row says a control is
verified, there is a named gate you can run today that proves it. If a row says
`NO AUTOMATED VERIFICATION`, that is a known gap — deliberately recorded, not
papered over.

## Per-PR maintenance rule

Any PR that touches a file listed in a control's "Implementing code" column
MUST update that control's row in `CONTROL_MATRIX.md`:

- re-run the row's verifying gate and refresh the Status date,
- fix file:line references that moved,
- add a row for any new control (or new gate), and delete rows for removed ones.

Reviewers should treat a stale row like a failing test.

## How to mark a row VERIFIED

Run the gate named in the row's "Verifying test/gate" column from the repo root
and record the date it passed:

- `pnpm tripwire` — investor/admin boundary scanner (self-testing rules for
  freshness thresholds and the browser-direct execution guard)
- `pnpm contract-test` — contract assertions (auth, CSRF, immutability, enums,
  capability policy, user assertion/JWKS, alpha-claim, storage backing, …)
- `pnpm test` — the above two plus the unit tests, including the
  property-based account-prefs invariants
- `pnpm scan-copy` — SEC-sensitive copy scan
- `pnpm e2e` — Playwright main lane against the PRODUCTION artifact
  (eligibility, onboarding, exception review, recommendations, support,
  C2a structural-absence proofs, …)
- `pnpm e2e:signal` — the release-authority lane: the same artifact rebooted at
  `REFI_RELEASE_STAGE=signal` (boot/CSP/hydration/auth posture, positive
  capability controls, structural absence at the September stage, per-trade
  approval absence)

ALL of the above run as blocking CI jobs on every push/PR
(`.github/workflows/ci.yml`), alongside gitleaks, typecheck, lint, and the
production build.

Then set the row's Status to `VERIFIED <YYYY-MM-DD>` (the date the gate passed
against the current tree). If no gate exercises the control, the Status stays
`UNVERIFIED` and the row's test column must read `NO AUTOMATED VERIFICATION`.

## Regulatory hooks are drafts

Every entry in the "Regulatory hook" column is an engineering-side suggestion
of the plausibly relevant regime (Advisers Act rule areas, Reg S-P,
books-and-records, marketing rule, etc.) and is explicitly marked
"DRAFT — confirm with counsel". None of these mappings has been reviewed by
counsel and none should be cited as a legal determination until they have been.
