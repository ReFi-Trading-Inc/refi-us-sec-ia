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

### Plan result — RUN 2026-09-14, apply still gated

Executed from `daniel-handoff/integration` at `f657e90` with a clean tree,
Terraform 1.16.1 (above the 1.15.9 that wrote the state), against
`gs://refinity-dev-frontend-tfstate/connected-dev`.

```text
Plan: 0 to add, 2 to change, 0 to destroy.
```

Of 36 tracked resources, 34 are no-ops. Every changed attribute, classified:

| Resource                               | Attribute                                                                                           | Class                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `google_cloudbuild_trigger.frontend`   | `repository_event_config.push.branch` `^integration/refinity-dev$` → `^daniel-handoff/integration$` | **EXPECTED**                                                |
| `google_cloudbuild_trigger.frontend`   | `description` (same reviewed commit)                                                                | **EXPECTED**                                                |
| `google_cloud_run_v2_service.frontend` | `template.revision` `refi-frontend-integration-00015-mez` → null                                    | **KNOWN RESIDUAL DRIFT — RUNTIME EFFECT NOT YET CERTIFIED** |

Nothing classified `UNEXPECTED`. Nothing destroyed.

**On the revision diff — corrected classification (founder, 2026-09-14).** An
earlier revision of this document called it `METADATA-ONLY`. That claim was not
proven and is withdrawn. `template` is Cloud Run's _revision template_, and an
omitted revision name is **auto-generated** by Cloud Run. Terraform models the
change as an in-place update, but we have not demonstrated that applying it
cannot create a new revision or otherwise touch runtime deployment state.
`main.tf` deliberately does not ignore the field so a later configuration edit
cannot reuse an immutable CLI-generated revision name — that explains why the
diff _appears_, not what applying it _does_.

It is recorded as **`KNOWN RESIDUAL DRIFT — RUNTIME EFFECT NOT YET CERTIFIED`**
and deliberately excluded from the trigger migration: there is no need to accept
incidental Cloud Run rollout risk in order to move trigger authority. It will be
resolved separately, when we actually intend a Cloud Run configuration and
revision reconciliation.

**Secret hygiene of the plan.** It carries secret _references_, never values —
e.g. `SESSION_SECRET` appears as an empty `value` with a `secret_key_ref`
naming `refi-frontend-session` version `1`. The only long hex literals in the
plan are container image digests. The JSON rendering used for classification
was deleted afterwards; `deployment.tfplan` is gitignored (`*.tfplan`).

**A clean plan does not prove the served image.** The service sets
`ignore_changes` on the container image, so image drift cannot appear here.

**The full plan is retained as evidence, not as an apply path.** It proves the
live state broadly matches configuration, that 34 of 36 resources are no-ops,
that there are no destructive surprises, and that the residual revision-name
drift exists.

**`deployment.tfplan` must NOT be applied** — its scope includes the uncertified
Cloud Run change. The trigger migration uses a separate, deliberately narrow
plan whose only mutation is `google_cloudbuild_trigger.frontend`: an intentional
one-time reconciliation, not our normal operating pattern, recorded as such
because a targeted plan bypasses Terraform's usual whole-configuration
guarantee. Apply of that narrow plan remains gated on founder approval.

### Trigger-only plan — ATTEMPTED, DOES NOT ISOLATE (2026-09-14)

Founder asked for a plan whose only mutation is
`google_cloudbuild_trigger.frontend`. **`-target` cannot deliver that here**,
and the attempt is recorded rather than quietly abandoned.

```bash
terraform plan -var-file=release.tfvars \
  -target=google_cloudbuild_trigger.frontend -out=trigger-only.tfplan
# → Plan: 0 to add, 2 to change, 0 to destroy   ← still TWO
```

`-target` includes the target **and everything it depends on**. The trigger
declares `depends_on = [google_cloud_run_v2_service_iam_member.deploy, …]`, and
that member reads `google_cloud_run_v2_service.frontend[0].name`. The Cloud Run
service is therefore pulled in transitively, and its pending
`template.revision` change rides along. The saved file was deleted so nothing
named "trigger-only" can be applied while carrying a second resource.

### Why the Cloud Run change is riskier than a name churn

Read-only comparison of live state against configuration:

|                           | Value                                                                       |
| ------------------------- | --------------------------------------------------------------------------- |
| Live serving revision     | `refi-frontend-integration-00015-mez`, 100% of traffic                      |
| **Live image digest**     | `…@sha256:8fa6baa0c472947ff91e388d0de865514e5a7e92a495325e80b9abf38e3deb21` |
| **`release.tfvars` pins** | `…@sha256:62359b2e009361ea1763da141fe7b2e3c1d61c15c307ea3d23a8f52c16e62500` |

**The configuration pins a different image than the one actually serving.** The
plan does not show it because `main.tf` sets
`ignore_changes = [template[0].containers[0].image, …]`, which is precisely why
"a clean plan does not prove the served digest".

In Cloud Run v2 any service-spec update produces a new revision. `ignore_changes`
should make Terraform carry the refreshed (live) image into that revision rather
than the `release.tfvars` value — but _should_ is not _certified_, and if it
carried the configured value instead the apply would roll the service back to an
older build. That is a real rollback risk, not a cosmetic diff, and it justifies
excluding Cloud Run from the trigger migration entirely.

### Options for moving trigger authority without touching Cloud Run

None has been executed; all need founder approval.

1. **Align the configuration with reality first.** Update `release.tfvars` to
   the live digest (`8fa6baa0…`) in a reviewed one-line PR, so configuration and
   live agree. Removes the rollback risk, leaves only the revision-name question.
   Does not by itself isolate the trigger.
2. **Move the trigger out of band, then let Terraform converge.** The
   configuration _already declares_ `^daniel-handoff/integration$`; only the live
   resource lags. A single
   `gcloud builds triggers update` on that one field makes reality match
   configuration, after which the next refresh shows no trigger diff and Cloud
   Run is never in the graph. This is convergence toward the reviewed
   configuration, not drift away from it — the narrowest possible mutation.
3. **Certify the Cloud Run revision behaviour, then apply normally.** Answers the
   question permanently rather than routing around it, since any future apply on
   this stack meets the same coupling. Slowest, most durable.

Recommendation: **2 for the immediate migration, then 1 and 3 as a deliberate
Cloud Run reconciliation** — it achieves the stated goal with the least
privilege and no rollout risk, and leaves the durable question properly scoped
instead of bundled into an unrelated change.

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
