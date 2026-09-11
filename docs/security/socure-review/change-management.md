# Change management

Status: IMPLEMENTED (evidence cited)

This describes the process as it actually operates on
`ReFi-Trading-Inc/refi-us-sec-ia` at `main @ 57a336d`. There is no change
advisory board; the controls are GitHub branch protection, blocking CI, and a
separate activation approval for anything that touches external systems.

## 1. Branch protection on `main` (read via API on 2026-09-10)

`gh api repos/ReFi-Trading-Inc/refi-us-sec-ia/branches/main/protection` returned:

| Setting                                    | Value                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| Required status checks                     | `Typecheck / Lint / Scan`, `Security scans`, `E2E (production artifact)`, `Build` |
| Strict (branch must be up to date)         | true                                                                              |
| Pull request required                      | yes (`required_pull_request_reviews` present)                                     |
| Required approving review count            | **0**                                                                             |
| Require code-owner reviews                 | false                                                                             |
| Dismiss stale reviews / last-push approval | false / false                                                                     |
| Required signatures (GitHub-enforced)      | **false**                                                                         |
| Enforce for admins                         | true                                                                              |
| Force pushes / deletions                   | not allowed / not allowed                                                         |
| Linear history / conversation resolution   | not required / not required                                                       |

Read the two bold rows honestly on questionnaires: every change to `main`
must arrive by pull request and pass four blocking checks, including for
admins; but with one maintainer no second-person approval is enforced, and
commit signing is a repository convention rather than a GitHub-enforced rule.
Recent `main` commits are GPG-signed (`git log --format=%G?` shows `G` for
the commits behind PRs #105–#107; merge commits show `E`, GitHub-created).

## 2. Pull request review

- `.github/CODEOWNERS` routes all paths to `@ReFi-Trading-Inc/engineering`,
  and compliance-sensitive copy (`packages/config/blocked-terms.ts`,
  `apps/web/app/us/_content/**`) additionally to `@ReFi-Trading-Inc/compliance`
  (CM-03). Because `require_code_owner_reviews` is false, CODEOWNERS is a
  routing aid, not a gate.
- Compliance-relevant PRs must update `compliance/CONTROL_MATRIX.md`
  (update rule at the top of that file; CM-05 notes this is not automated).

## 3. Required CI checks (`.github/workflows/ci.yml`, runs on push to `main` and every PR)

| Check (exact name)          | Steps                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Typecheck / Lint / Scan`   | `pnpm typecheck`; `pnpm lint`; investor-boundary tripwire (`pnpm tripwire`, IB-01); route-manifest gate (`pnpm route-manifest`, CM-04); contract assertions (`pnpm contract-test`); `@refi/api-clients` unit tests incl. Daniel's conformance validator + simulator (`REFI_CONTRACT_STRICT=1`); copy scan (`pnpm scan-copy`, MK-01) |
| `Security scans`            | gitleaks CLI v8.30.1 over the tracked tree, `--exit-code 1` (blocking, CM-02); `pnpm audit --prod` (**report-only**, `continue-on-error: true`)                                                                                                                                                                                     |
| `E2E (production artifact)` | Playwright against the production build: `pnpm e2e` (full suite), `pnpm e2e:signal` (signal-stage lane), `pnpm e2e:demo` (demo-tier lane); report uploaded on failure                                                                                                                                                               |
| `Build`                     | `pnpm --filter @refi/web build` with `NEXT_PUBLIC_REFI_ENV=staging`; bundle-size report                                                                                                                                                                                                                                             |

Supply-chain settings in the same workflow: every action pinned by commit SHA;
`permissions: contents: read` by default; `--frozen-lockfile` installs;
Renovate configured (`renovate.json`) for dependency updates.

## 4. Local gates

- Husky pre-commit runs `lint-staged` (Prettier on staged files); commit-msg
  runs `commitlint` with `@commitlint/config-conventional`
  (`commitlint.config.js`).
- Commit signing: enabled in the local git configuration
  (`commit.gpgsign=true`) and required by the team's commit procedure; not
  enforced server-side (see §1).

## 5. Environment separation

| Tier / environment               | Where                                                                      | How it is selected                                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local dev / CI                   | developer machine, GitHub Actions                                          | `REFI_ENV=dev`, prototype store, simulator upstream                                                                                                               |
| Staging build                    | CI `Build` job                                                             | `NEXT_PUBLIC_REFI_ENV=staging`                                                                                                                                    |
| Demo                             | Cloud Run `demo-web` in GCP `refi-game-prod`; Vercel `refi-us-sec-ia-demo` | `REFI_ENV=demo`; demo persona sign-in exists only here; can never be a connected deployment (`env.ts` invariant)                                                  |
| Production web                   | Vercel `refi-us-sec-ia-web` (`refi.trading`)                               | `NEXT_PUBLIC_REFI_ENV=prod` + `REFI_ENV=prod`; schema applies no defaults and fails boot on any gap (DP-02)                                                       |
| Connected (Investor Integration) | GCP `refi-us-connected-investor` — **not created**                         | `REFI_INVESTOR_API_CREDENTIAL_MODE=native-cloud-run` turns on fail-closed invariants (durable store, live adapter, no mock KYC controls, KMS/secret-store signer) |

Server-side security decisions gate on the server-only `REFI_ENV`, never on
the client-visible build constant (AC-02).

## 6. Deployment approval

- Code merge and external activation are separate decisions
  (`docs/releases/2026-09-signal/connected-dev/founder-activation-actions.md`:
  "Code merge and external activation are separate decisions. Nothing below
  has been executed."). Merging to `main` never provisions cloud resources,
  sends vendor traffic, or enables remote upstreams;
  `REFI_INVESTOR_API_ALLOW_REMOTE=1` is a separately reviewed switch.
- Vercel deploys from the Git integration; Cloud Run demo deploys are manual
  (`infra/cloudrun/deploy-demo.sh`, Cloud Build config). The migration plan
  (§12) targets build-once/deploy-by-digest with an environment approval for
  staging/prod on Cloud Run; that pipeline is not yet in the tree.
- Socure activation (credentials, first traffic) requires the same separate
  activation approval.

## 7. Rollback

- Code: `git revert` on `main` by pull request through the same gates, then
  redeploy.
- Vercel: promote the previous deployment.
- Cloud Run: `gcloud run services update-traffic` to the prior revision
  (runbook §1; migration plan §12).
- Configuration: flip the environment variable and redeploy (runbook §1
  kill-switch table); prototype/durable backing can be switched back per
  entity (`infra/terraform/README.md` "Rollback").

## 8. Emergency changes

Same path — pull request, all four checks, merge — with expedited review by
the owner. Branch protection is enforced for admins, so there is no bypass
lane; if a gate itself is broken, the fix to the gate is the first PR.
Incident-driven changes follow `docs/incident-response-runbook.md` (contain
via environment first, code fix behind a regression test second).
