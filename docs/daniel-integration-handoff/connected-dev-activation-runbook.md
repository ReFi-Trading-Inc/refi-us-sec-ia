# Connected Dev activation runbook — Terraform plan and Stytch TEST binding

**Date:** 2026-09-14 · Founder-executed steps. Nothing here has been run.
No credential value appears in this repository, and none may be added to it.

## 0. Current blockers on this machine (verified 2026-09-14)

| Requirement              | State                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `gcloud` installed       | yes (`/usr/local/bin/gcloud`), account `zeshan@refi.trading`                                             |
| `gcloud` session usable  | **no** — every call fails with "Reauthentication failed. cannot prompt during non-interactive execution" |
| `terraform` installed    | **no** — `terraform not found`                                                                           |
| GitHub branch protection | yes — configured and verified on `daniel-handoff/integration`                                            |

Both remaining infrastructure actions are blocked on those two items, not on
any repository work. The plan cannot be produced until a human reauthenticates
in an interactive shell and a Terraform binary is available.

## 1. Terraform plan (PLAN ONLY — never apply)

Prerequisites, in order:

1. Reauthenticate interactively. In the Claude Code session this is
   `! gcloud auth login` (the `!` prefix runs it in the session so the output
   lands in the conversation); in a terminal it is `gcloud auth login`.
2. Install Terraform (any 1.15.x matching `.terraform.lock.hcl`'s provider
   constraint `~> 6.0` for `hashicorp/google`; the recorded state was written
   by 1.15.9).
3. Check out the reviewed line. `connected-dev.sh` refuses to run from any
   other branch:

   ```bash
   git checkout daniel-handoff/integration && git pull --ff-only
   ```

Then, from the repository root:

```bash
bash infra/cloudrun/connected-dev.sh init   # first run only
bash infra/cloudrun/connected-dev.sh plan   # writes deployment.tfplan, applies nothing
terraform -chdir=infra/terraform/connected-dev show -json deployment.tfplan > plan.json
```

The script exports a process-local access token, never writes credentials to
disk, and `plan` uses `-out=deployment.tfplan` so a later `apply` can only
apply the plan a human inspected.

### Classifying the diff

Every resource change must be labelled before any apply is discussed:

| Label               | Meaning                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `EXPECTED`          | The reviewed trigger-source change.                                             |
| `METADATA-ONLY`     | Labels, descriptions, computed fields, revision churn with no behaviour change. |
| `UNEXPECTED — STOP` | Anything else. Stop and return the plan for review.                             |

The one known material change:

```text
google_cloudbuild_trigger.frontend
  repository_event_config.push.branch
    "^integration/refinity-dev$" → "^daniel-handoff/integration$"
```

Do not assume it is the only one. `main.tf` carries
`ignore_changes = [template[0].containers[0].image, traffic, client, client_version]`
on the Cloud Run service, so an image difference will **not** appear in the
plan — a clean plan does not prove the served digest.

**Apply stays gated** on founder review of the captured plan. Sanitize before
sharing: the plan may echo environment variable values.

## 2. Stytch TEST binding

**Sequencing constraint.** Do not add Stytch resources to
`infra/terraform/connected-dev/` before the trigger plan above is reviewed —
new secret containers and env entries would appear as extra diffs in exactly
the plan that is supposed to show one reviewed change. Provision the secret
values first (step 2a, no Terraform), then land the wiring as its own PR
(step 2b) and plan it separately.

### 2a. Put the credentials in Secret Manager (no repository change)

Create the containers and add the values from an interactive shell, reading
each value from a prompt so it never reaches shell history, a file, this
repository, or a chat message:

```bash
for s in refi-frontend-stytch-project-id refi-frontend-stytch-secret; do
  gcloud secrets create "$s" --project refinity-dev --replication-policy=automatic
done
# Paste the value at the prompt, then press Ctrl-D. Nothing is echoed.
gcloud secrets versions add refi-frontend-stytch-project-id --project refinity-dev --data-file=-
gcloud secrets versions add refi-frontend-stytch-secret     --project refinity-dev --data-file=-
```

Use the **TEST** project's credentials. `STYTCH_ENV` stays `test`.

### 2b. Bind the runtime (separate Terraform PR, after step 1's plan)

The existing pattern in `main.tf` is a `google_secret_manager_secret` map, a
`google_secret_manager_secret_iam_member` granting the runtime service account
`secretAccessor`, and a `value_source.secret_key_ref` entry on the Cloud Run
container. The Stytch pair follows it exactly, adding:

```text
STYTCH_PROJECT_ID  → refi-frontend-stytch-project-id
STYTCH_SECRET      → refi-frontend-stytch-secret
STYTCH_ENV         = "test"            (plain env, not a secret)
REFI_AUTH_CALLBACK_URL                  (already set)
```

`REFI_AUTH_PROVIDER` **stays `unconfigured`** in that PR.
`apps/web/src/lib/config/env.ts` makes `REFI_AUTH_PROVIDER=stytch` require both
secrets and an https callback URL, and forbids it on the demo tier — so
flipping the provider is the deliberate, separate act that turns the login half
of the chain on.

## 3. What may not be claimed

Provisioning credentials and binding them is not Lane A acceptance. Lane A is
certified only when the real chain succeeds against Daniel's trust
configuration:

```text
Stytch TEST login → opaque ReFi subject → identity bridge (separate ES256 KMS
key) → identity-ccid exchangeIdentity → verified identity_result → durable
connected session
```

That additionally needs Daniel's step 4 / B1 / ATD-046 binding, the confirmed
`identity_result` `iss`/`aud` pair, `IDENTITY_FEATURE_STATE` enabled, and the
separate reviewed promotion of `REFI_INVESTOR_API_ALLOW_REMOTE`. Until then the
deployed service fails closed on every exchange by design.
