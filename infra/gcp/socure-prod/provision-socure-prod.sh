#!/usr/bin/env bash
# Socure Sandbox acceptance environment — provisioning (DRY RUN by default).
# Prints every command; executes only with APPLY=1 after founder approval.
# Creates: project, APIs, Artifact Registry, Firestore (native), runtime SA,
# least-privilege IAM, six secrets (values entered interactively, never in
# this file), and the Cloud Run service from service.yaml. No Socure call.
set -euo pipefail
PROJECT="${PROJECT:-refi-socure-prod}"
REGION="${REGION:-us-central1}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:?set BILLING_ACCOUNT=<id>}"
SA_NAME="socure-prod-runtime"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
BUILD_SA="socure-prod-build@${PROJECT}.iam.gserviceaccount.com"
run() { echo "+ $*"; if [ "${APPLY:-0}" = "1" ]; then "$@"; fi; }

# 1. Project + billing + APIs
run gcloud projects create "$PROJECT" --name "ReFi Socure Production"
run gcloud billing projects link "$PROJECT" --billing-account "$BILLING_ACCOUNT"
run gcloud services enable run.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com logging.googleapis.com cloudbuild.googleapis.com --project "$PROJECT"

# 2. Artifact Registry + Firestore (native mode)
run gcloud artifacts repositories create refi --repository-format docker --location "$REGION" --project "$PROJECT"
run gcloud firestore databases create --database "(default)" --location nam5 --type firestore-native --project "$PROJECT"

# 3. Runtime service account (no keys are ever created)
run gcloud iam service-accounts create "$SA_NAME" --display-name "Socure production runtime" --project "$PROJECT"
run gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/datastore.user
run gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/logging.logWriter

# 4. Secrets — values are entered at the prompt (generated fresh; never production values)
# 4a. Socure secrets: CONTAINERS ONLY (no versions). Phase 2 — the founder adds real versions
#     through Secret Manager; no placeholder value is ever created (it could satisfy validation).
for s in socure-api-key-prod socure-webhook-bearer-prod; do
  run gcloud secrets create "$s" --replication-policy automatic --project "$PROJECT"
  run gcloud secrets add-iam-policy-binding "$s" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor --project "$PROJECT"
done
# 4b. ReFi-owned secrets: generated fresh at apply time (never production values), one version each.
for s in prod-session-secret prod-ip-hash-secret prod-eligibility-jwt-secret prod-session-jwt-secret; do
  run gcloud secrets create "$s" --replication-policy automatic --project "$PROJECT"
  if [ "${APPLY:-0}" = "1" ]; then openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add "$s" --data-file=- --project "$PROJECT"; else echo "+ openssl rand -base64 48 | gcloud secrets versions add $s --data-file=- --project $PROJECT"; fi
  run gcloud secrets add-iam-policy-binding "$s" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor --project "$PROJECT"
done
echo "Phase 2 (founder, outside chat): Socure API key from the RiskOS dashboard; webhook Bearer = UUIDv4 via uuidgen; add as secret versions; then switch service.yaml to REFI_KYC_PROVIDER=socure with the two secret refs, workflow name and public SDK key."

# 5. Build the image (staging tier constants at build time). New projects give the default Cloud Build identity
#    no permissions, so a dedicated build SA carries only: log writer (project), AR writer (repo `refi`),
#    object viewer on the Cloud Build source bucket. The bucket is created by the first `gcloud builds submit`;
#    on a brand-new project run the build once, then apply the bucket binding and re-run.
run gcloud iam service-accounts create socure-prod-build --display-name "Socure production image build" --project "$PROJECT"
#    Least privilege (verified by a successful build 2026-09-11, build 8095016e): NO roles/cloudbuild.builds.builder.
run gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$BUILD_SA" --role roles/logging.logWriter
run gcloud artifacts repositories add-iam-policy-binding refi --location "$REGION" --project "$PROJECT" --member "serviceAccount:$BUILD_SA" --role roles/artifactregistry.writer
run gcloud storage buckets add-iam-policy-binding "gs://${PROJECT}_cloudbuild" --member "serviceAccount:$BUILD_SA" --role roles/storage.objectViewer
# Placeholders resolved here, not by hand: the image tag is the git short SHA and the public base URL is the
# deterministic Cloud Run URL (https://<service>-<project-number>.<region>.run.app), known once the project exists.
SHORT_SHA="$(git rev-parse --short=7 HEAD)"
if [ "${APPLY:-0}" = "1" ]; then PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format 'value(projectNumber)')"; else PROJECT_NUMBER="PROJECT_NUMBER"; fi
SERVICE_URL="https://refi-socure-prod-${PROJECT_NUMBER}.${REGION}.run.app"
run gcloud builds submit --config infra/gcp/socure-prod/cloudbuild.prod.yaml --project "$PROJECT" --service-account "projects/$PROJECT/serviceAccounts/$BUILD_SA" --substitutions "SHORT_SHA=${SHORT_SHA},_PUBLIC_BASE_URL=${SERVICE_URL},_SOCURE_SDK_KEY=${SOCURE_SDK_KEY:-}" .

# 6. Deploy the service from a rendered copy of the manifest (image tag = SHORT_SHA)
RENDERED="$(mktemp -t socure-prod-service.XXXXXX).yaml"
sed "s/REPLACE_TAG/${SHORT_SHA}/" infra/gcp/socure-prod/service.yaml > "$RENDERED"
run gcloud run services replace "$RENDERED" --project "$PROJECT" --region "$REGION"
run gcloud run services add-iam-policy-binding refi-socure-prod --member allUsers --role roles/run.invoker --project "$PROJECT" --region "$REGION"
run gcloud run services describe refi-socure-prod --project "$PROJECT" --region "$REGION" --format "value(status.url)"
echo "Webhook URL = <status.url>/api/webhooks/kyc/provider (register in RiskOS with the Bearer credential)."
