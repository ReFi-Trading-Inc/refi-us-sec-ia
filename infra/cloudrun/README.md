# Demo tier on Cloud Run — one always-on instance

**Scope: existing demo deployment only.** The connected integration environment
will use a separate service/build configuration in `refinity-dev/us-west1`, not
this script's `refi-game-prod/demo-web` target. Leave the game/demo and their
domains unchanged. Both teams follow the
[shared integration working agreement](../../docs/integration-collaboration.md).

Zeshan's current Vercel development/deployment flow continues while Daniel sets
up connected GCP services on `integration/refinity-dev`. `refinity-dev`
hosts both frontend/BFF and trading backend; future `refinity-stg/prod` follows
the same shared-environment pattern. These internal project names do not change
the public **Refi Trading** brand. No staging/production provisioning or domain
cutover is authorized by this guide.

**Why this exists (2026-09-08).** The demo tier keeps walkthrough state
in-process (the demo world: broker connection, holdings, fills, advice) and on
local disk (the prototype store: KYC mock session, Investor Profile v2,
receipts). On Vercel, requests are spread across function instances, each with
its own memory and its own `/tmp`. A single 90-second walkthrough was observed
reading "no profile, no broker connection" from one instance seconds after
both were written on another. That cannot be made reliable by a KV store
alone (26 stores bypass the durable seam and the demo world is memory), so the
demo runs as **one process**: Cloud Run with `min-instances = max-instances = 1`.
One instance handles a demo audience comfortably (`concurrency 80`).

This is deployment only. No product code path differs between Vercel and
Cloud Run; the same image serves any tier via runtime env.

## Layout

| File                                  | Role                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/Dockerfile`                 | Standalone Next.js image. `NEXT_PUBLIC_*` are **build args** (inlined by `next build`)   |
| `infra/cloudrun/cloudbuild.demo.yaml` | Cloud Build: builds the demo image (`NEXT_PUBLIC_REFI_ENV=demo`) into Artifact Registry  |
| `infra/cloudrun/deploy-demo.sh`       | Deploys the image as `demo-web` (project `refi-game-prod`, `us-central1`), 1 instance    |
| `.gcloudignore`                       | Keeps `node_modules`, `.next`, `.turbo`, env files and local artifacts out of the upload |

Project choice: `refi-game-prod` — billing on, Run/Build/Artifact Registry
enabled, already hosts `mint-handoff`. The GCP migration plan names the BFF's
long-term project as a decision for Zeshan and Daniel; the demo service is
named so it can move without renaming anything else.

## Deploy (run from the repo root)

1. Pull the demo project's Production env into a file **outside git** (it holds
   secrets; the repo ignores `.env*`):

   ```
   mkdir -p /tmp/refi-demo-env && cd /tmp/refi-demo-env \
     && vercel link --yes --scope team_YCZk4vGV2uBDkilwrsh61zzz --project refi-us-sec-ia-demo \
     && vercel env pull --environment production --yes .env.demo
   ```

   **Trap:** variables marked _sensitive_ on Vercel come back as **empty
   strings** (`SESSION_JWT_SECRET`, `SESSION_SECRET`, `ELIGIBILITY_JWT_SECRET`,
   `IP_HASH_SECRET`, `DEMO_HANDOFF_PRIVATE_KEY_JWK`). The Cloud Run demo does
   not need Vercel's values — it signs its own cookies — so fill them with
   fresh 32-byte secrets and a fresh P-256 pair (public half into
   `ALPHA_HANDOFF_PUBLIC_KEY_JWK`, private into `DEMO_HANDOFF_PRIVATE_KEY_JWK`).
   An empty secret silently breaks sign-in (403) and the handoff (404).

2. Build the image (5–10 min):

   ```
   gcloud builds submit --config infra/cloudrun/cloudbuild.demo.yaml \
     --project refi-game-prod --substitutions SHORT_SHA=$(git rev-parse --short HEAD) .
   ```

3. Deploy one instance and print its URL:

   ```
   infra/cloudrun/deploy-demo.sh /tmp/refi-demo-env/.env.demo
   ```

4. Verify against the printed `*.run.app` URL (persona picker, game handoff,
   applicant KYC, invited setup, admitted home) before touching DNS.

## Custom domain

`demo.refi.trading` currently CNAMEs to Vercel. To move it:

- verify `refi.trading` for the deploying account (Search Console), then
  `gcloud beta run domain-mappings create --service demo-web --domain demo.refi.trading --region us-central1 --project refi-game-prod`
  and set the CNAME it prints (`ghs.googlehosted.com`); certificate issuance
  takes up to ~1 h. Keep the Vercel project as the fallback until the mapping
  serves.

## Redeploy after a code change

Rebuild (step 2) and redeploy (step 3). The image tag is the short commit SHA
plus `latest`; the deploy script takes a tag as its second argument.

## Rollback

`gcloud run services update-traffic demo-web --to-revisions <previous>=100`
or point the DNS back at Vercel.
