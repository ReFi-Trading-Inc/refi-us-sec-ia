# FOUNDER DECISION REQUIRED — GCP project for the connected BFF

**Status:** open, 2026-09-09. Blocks provisioning for Daniel's step 1 (runtime
service account) and step 3 (KMS-backed signer). Does **not** block the code:
every module in PR A/B is project-agnostic and reads project facts from env.

**Question.** Which GCP project hosts the connected-Dev BFF (`bff-dev`,
`bff-dev.refi.trading`), its runtime service account, its KMS signing key,
its Secret Manager secrets and its Firestore session store?

| Criterion                       | A. Existing `refi-game-prod`                                                                              | B. Dedicated `refi-frontend-dev` (new)                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| IAM blast radius                | Shares project-level roles with the game, `mint-handoff`, `refi-persistence-api` and the demo web service | Only the BFF's runtime SA and the deployer; nothing else can be granted by accident            |
| KMS separation                  | Signing key sits beside game keys; project-level `cloudkms.*` roles reach it                              | Key ring dedicated to the BFF; key IAM is the only path                                        |
| Secret Manager separation       | BFF secrets listable by anyone with project secret roles for the game                                     | Isolated; per-secret IAM to the runtime SA only                                                |
| Cloud Run service identity      | Possible, but the demo web service already uses the default compute SA in this project                    | Clean: one user-managed SA per service from day one                                            |
| Auditability                    | Audit logs interleave game, demo and regulated-BFF activity                                               | Audit log = the regulated surface only; simpler evidence for the control matrix                |
| Billing / ops                   | Billing already on; one more service                                                                      | New billing link (same account); one more project to watch                                     |
| Production promotion            | Awkward: production BFF would need a separate project anyway, so Dev and Prod would diverge               | Natural: `refi-frontend-dev` → `refi-frontend-stg` → `refi-frontend-prod` with identical shape |
| Isolation from game/demo assets | None; demo world and game APIs live here                                                                  | Complete                                                                                       |
| Time to first deploy            | Hours (APIs enabled)                                                                                      | Hours + project creation, billing link, API enablement (~30 min)                               |

**Recommendation: B, a dedicated project.** Nothing in the repository or the
cloud architecture argues for A: the migration plan (§2/§9) already assumes a
frontend-owned project with its own deployer and runtime identities, and the
control matrix's evidence is cleaner when the regulated surface is alone in
its audit log. The demo stays in `refi-game-prod` untouched.

**Not done pending this decision (deliberately):** no project created, no
billing linked, no service account, no KMS key, no Secret Manager secret, no
Firestore database, no domain mapping.

**Ready to run once decided** (values in `infra/cloudrun/README.md` follow-up
and `SPRINT_STATE.md`):

```
# after `gcloud projects create <PROJECT>` and billing link
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  cloudkms.googleapis.com secretmanager.googleapis.com firestore.googleapis.com --project <PROJECT>
gcloud iam service-accounts create refi-bff-dev --display-name "ReFi BFF dev runtime" --project <PROJECT>
gcloud iam service-accounts describe refi-bff-dev@<PROJECT>.iam.gserviceaccount.com \
  --project <PROJECT> --format='json(email,uniqueId)'   # → Appendix A (uniqueId as a string)
```

Appendix A fields that stay `null` until then: `frontend_project_id`,
`frontend_region`, `frontend_service_name`, `frontend_ready_revision`,
`frontend_runtime_service_account_email`,
`frontend_runtime_service_account_unique_id`, `frontend_bff_current_signing_kid`.
