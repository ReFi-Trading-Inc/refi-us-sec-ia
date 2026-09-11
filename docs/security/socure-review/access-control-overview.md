# Access control overview

Status: POLICY ADOPTED, ORGANIZATIONAL ACTION PENDING

What is evidenced in the repository is marked as such; account-level facts
(who holds which role on GitHub, Vercel, Stytch) are not recorded in the
repository and must be read from each console at questionnaire time.

## 1. GitHub

- Organization `ReFi-Trading-Inc`; repository `refi-us-sec-ia`. Teams
  referenced by `.github/CODEOWNERS`: `engineering`, `compliance`.
- Branch protection on `main` (API-verified 2026-09-10; full table in
  `change-management.md` §1): PR required, four blocking checks, strict
  up-to-date, enforce for admins, no force push, no deletion. Approval count
  0; code-owner review not required; signatures not GitHub-enforced.
- CI token: `permissions: contents: read` by default.
- Policy: repository write access only for engineers actively working on the
  codebase; outside collaborators never get admin; 2FA required for the
  organization (expectation — confirm the org setting in GitHub before
  citing it).

## 2. Google Cloud IAM (least privilege by design)

- Firestore app service account: `roles/datastore.user` only — explicitly not
  `datastore.owner` (`infra/terraform/main.tf`).
- Connected BFF runtime service account (planned, `founder-activation-actions.md`
  item 6): Firestore user, Secret Manager accessor on its own secrets, KMS
  `signerVerifier` on the `assertion` and `identity-bridge` keys only; no key
  files (Application Default Credentials on Cloud Run).
- GitHub Actions deployer (`modules/workload-identity/main.tf`): Workload
  Identity Federation bound to this repository only
  (`attribute_condition = assertion.repository == <repo>`), roles
  `artifactregistry.writer` and `run.developer` — not `run.admin`.
- Cloud Run service identity: one user-managed runner service account per
  service (`modules/cloud-run-service/main.tf`).
- Project isolation: the connected regulated surface is designed for a
  dedicated project `refi-us-connected-investor` so its audit log and IAM
  contain nothing else (`decision-gcp-project.md`). The demo runs in
  `refi-game-prod`. **The connected project does not exist yet.**
- Human access: named Google accounts with MFA, per-project roles; no shared
  accounts; the owner is the only current principal (confirm in the console).

## 3. Vercel

- Projects referenced: `refi-us-sec-ia-web` (production web) and
  `refi-us-sec-ia-demo`. Team-scoped access; environment variables marked
  sensitive are write-only. Policy: project members limited to engineers who
  deploy; MFA on every Vercel account (expectation — confirm).

## 4. Stytch

- Consumer Authentication project — **not created** (`founder-activation-actions.md`).
- Policy when created: dashboard access to the owner plus at most one
  engineer; MFA on; test environment first; secrets go straight into Secret
  Manager, never into chat or docs.

## 5. Socure (future)

- Account verification pending; no dashboard access exists.
- Policy when granted: named users only, MFA on, roles limited to what the
  integration and case review require, API keys generated for the server
  integration only and stored per `secrets-management.md` §5, dashboard
  access reviewed at offboarding and quarterly.

## 6. Application-level access control (evidenced)

- Session verification and fail-closed dev fallback (AC-01, AC-02); edge
  redirect gates (AC-03, EL-02); every investor route resolves auth through
  shared wrappers (AC-04); `/admin/*` is a hard 404 (IB-02); same-origin
  enforcement on mutations (CS-01); two-user cross-user isolation harness
  (PR #102 series; `docs/releases/2026-09-signal/connected-dev/appendix-c-coverage.md`).
- Deny-by-default API inventory (CM-04) and release-stage capability policy
  (IB-09).

## 7. MFA expectation

Every console and dashboard account (GitHub, Google Cloud, Vercel, Stytch,
Socure, Sentry, PostHog, password manager) uses MFA — passkeys or TOTP
preferred. This is a policy expectation; the repository holds no evidence of
each account's MFA state.

## 8. Offboarding

On the day access ends: remove from the GitHub organization and teams; revoke
Google Cloud IAM bindings; remove from the Vercel team; remove Stytch /
Socure dashboard users; rotate any secret the person could have read
(`secrets-management.md` §3); revoke device sessions and require device wipe
per `endpoint-security-baseline.md`; record the completed steps in a ticket
or PR. Access reviews: quarterly, by the owner, across every system above.
