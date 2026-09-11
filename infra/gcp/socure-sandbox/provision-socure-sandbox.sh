#!/usr/bin/env bash
# Socure Sandbox acceptance environment — provisioning (DRY RUN by default).
# Prints every command; executes only with APPLY=1 after founder approval.
# Creates: project, APIs, Artifact Registry, Firestore (native), runtime SA,
# least-privilege IAM, six secrets (values entered interactively, never in
# this file), and the Cloud Run service from service.yaml. No Socure call.
set -euo pipefail
PROJECT="${PROJECT:-refi-socure-sandbox}"
REGION="${REGION:-us-central1}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:?set BILLING_ACCOUNT=<id>}"
SA_NAME="socure-sandbox-runtime"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
run() { echo "+ $*"; if [ "${APPLY:-0}" = "1" ]; then "$@"; fi; }

# 1. Project + billing + APIs
run gcloud projects create "$PROJECT" --name "ReFi Socure Sandbox"
run gcloud billing projects link "$PROJECT" --billing-account "$BILLING_ACCOUNT"
run gcloud services enable run.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com \
  secretmanager.googleapis.com iam.googleapis.com logging.googleapis.com cloudbuild.googleapis.com --project "$PROJECT"

# 2. Artifact Registry + Firestore (native mode)
run gcloud artifacts repositories create refi --repository-format docker --location "$REGION" --project "$PROJECT"
run gcloud firestore databases create --database "(default)" --location nam5 --type firestore-native --project "$PROJECT"

# 3. Runtime service account (no keys are ever created)
run gcloud iam service-accounts create "$SA_NAME" --display-name "Socure sandbox runtime" --project "$PROJECT"
run gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/datastore.user
run gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/logging.logWriter

# 4. Secrets — values are entered at the prompt (generated fresh; never production values)
for s in socure-api-key-sandbox socure-webhook-bearer-sandbox sandbox-session-secret sandbox-ip-hash-secret sandbox-eligibility-jwt-secret sandbox-session-jwt-secret; do
  run gcloud secrets create "$s" --replication-policy automatic --project "$PROJECT"
  echo "+ (enter value interactively) gcloud secrets versions add $s --data-file=- --project $PROJECT"
  run gcloud secrets add-iam-policy-binding "$s" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor --project "$PROJECT"
done
echo "Generate ReFi secrets with: openssl rand -base64 48 ; webhook bearer: openssl rand -base64 48 ; Socure API key from the RiskOS dashboard."

# 5. Build the image (staging tier constants at build time)
run gcloud builds submit --config infra/gcp/socure-sandbox/cloudbuild.sandbox.yaml --project "$PROJECT" .

# 6. Deploy the service from the manifest (replace REPLACE_* placeholders first)
run gcloud run services replace infra/gcp/socure-sandbox/service.yaml --project "$PROJECT" --region "$REGION"
run gcloud run services add-iam-policy-binding socure-sandbox-web --member allUsers --role roles/run.invoker --project "$PROJECT" --region "$REGION"
run gcloud run services describe socure-sandbox-web --project "$PROJECT" --region "$REGION" --format "value(status.url)"
echo "Webhook URL = <status.url>/api/webhooks/kyc/provider (register in RiskOS with the Bearer credential)."
