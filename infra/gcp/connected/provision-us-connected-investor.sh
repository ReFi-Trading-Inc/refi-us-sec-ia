#!/usr/bin/env bash
# ReFi US Connected Investor Platform — GCP security boundary (founder-approved
# 2026-09-09: project `refi-us-connected-investor`). Program phase: US Investor
# Integration Foundation. Idempotent: every step is create-if-absent.
#
# Provisions ONLY what the present phases need (mandate §5): Cloud Run BFF
# identity, KMS signing keys (Investor API assertion + identity bridge, SEPARATE
# keys), Secret Manager placeholders, Firestore for connected security state,
# Artifact Registry for the BFF image. Nothing for live capital. Nothing in
# refi-game-prod. No key material is created or printed here.
#
# Run as the founder (gcloud auth login) from the repo root:
#   infra/gcp/connected/provision-us-connected-investor.sh <BILLING_ACCOUNT_ID>
set -euo pipefail

PROJECT=refi-us-connected-investor
REGION=us-central1
BILLING="${1:?billing account id required (gcloud billing accounts list)}"
RUNTIME_SA=refi-bff-runtime
KEYRING=refi-bff
ASSERTION_KEY=investor-assertion   # per-request BFF -> investor-api assertion
BRIDGE_KEY=identity-bridge          # upstream identity assertion (Stytch -> identity-ccid)
AR_REPO=refi

say() { printf '\n== %s\n' "$*"; }

say "project"
gcloud projects describe "$PROJECT" >/dev/null 2>&1 \
  || gcloud projects create "$PROJECT" --name="ReFi US Connected Investor Platform"
gcloud billing projects link "$PROJECT" --billing-account="$BILLING" >/dev/null

say "APIs"
gcloud services enable --project "$PROJECT" \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  cloudkms.googleapis.com secretmanager.googleapis.com firestore.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com logging.googleapis.com monitoring.googleapis.com

say "runtime service account (the BFF's Cloud Run identity; Appendix A email + uniqueId)"
gcloud iam service-accounts describe "$RUNTIME_SA@$PROJECT.iam.gserviceaccount.com" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$RUNTIME_SA" --project "$PROJECT" \
       --display-name="ReFi BFF runtime (connected US investor)"
RUNTIME_EMAIL="$RUNTIME_SA@$PROJECT.iam.gserviceaccount.com"

say "Firestore (connected security state; namespace set by REFI_CONNECTED_STORE_NAMESPACE)"
gcloud firestore databases describe --database="(default)" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud firestore databases create --database="(default)" --location=nam5 --type=firestore-native --project "$PROJECT"

say "KMS: key ring + two SEPARATE non-exportable P-256 signing keys (mandate §15, §20)"
gcloud kms keyrings describe "$KEYRING" --location "$REGION" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud kms keyrings create "$KEYRING" --location "$REGION" --project "$PROJECT"
for KEY in "$ASSERTION_KEY" "$BRIDGE_KEY"; do
  gcloud kms keys describe "$KEY" --keyring "$KEYRING" --location "$REGION" --project "$PROJECT" >/dev/null 2>&1 \
    || gcloud kms keys create "$KEY" --keyring "$KEYRING" --location "$REGION" --project "$PROJECT" \
         --purpose asymmetric-signing --default-algorithm ec-sign-p256-sha256 --protection-level hsm
done

say "Artifact Registry (BFF image)"
gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "$AR_REPO" --repository-format=docker --location "$REGION" --project "$PROJECT"

say "Secret Manager placeholders (values added by the founder, never by this script)"
for S in stytch-project-id stytch-secret session-jwt-secret session-secret eligibility-jwt-secret ip-hash-secret; do
  gcloud secrets describe "$S" --project "$PROJECT" >/dev/null 2>&1 \
    || gcloud secrets create "$S" --replication-policy=automatic --project "$PROJECT"
done

say "IAM — least privilege for the runtime SA (see IAM.md for the why)"
# Sign with each KMS key (signerVerifier includes getPublicKey; no key admin).
for KEY in "$ASSERTION_KEY" "$BRIDGE_KEY"; do
  gcloud kms keys add-iam-policy-binding "$KEY" --keyring "$KEYRING" --location "$REGION" --project "$PROJECT" \
    --member "serviceAccount:$RUNTIME_EMAIL" --role roles/cloudkms.signerVerifier >/dev/null
done
# Firestore data access only (no admin).
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$RUNTIME_EMAIL" \
  --role roles/datastore.user --condition=None >/dev/null
# Read each secret individually (no project-wide secret access).
for S in stytch-project-id stytch-secret session-jwt-secret session-secret eligibility-jwt-secret ip-hash-secret; do
  gcloud secrets add-iam-policy-binding "$S" --project "$PROJECT" \
    --member "serviceAccount:$RUNTIME_EMAIL" --role roles/secretmanager.secretAccessor >/dev/null
done
# Logs/metrics from the runtime.
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$RUNTIME_EMAIL" \
  --role roles/logging.logWriter --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$RUNTIME_EMAIL" \
  --role roles/monitoring.metricWriter --condition=None >/dev/null

say "Appendix A runtime identity facts (uniqueId is a STRING)"
gcloud iam service-accounts describe "$RUNTIME_EMAIL" --project "$PROJECT" --format='json(email,uniqueId)'

say "KMS key version resource names for the BFF env"
for KEY in "$ASSERTION_KEY" "$BRIDGE_KEY"; do
  gcloud kms keys versions list --key "$KEY" --keyring "$KEYRING" --location "$REGION" --project "$PROJECT" \
    --filter="state=ENABLED" --format="value(name)" | head -1
done

cat <<EOF

Next (not done by this script):
  - Cloud Run service 'bff-dev' with --service-account=$RUNTIME_EMAIL, min instances 0
    (stateless; NOT one instance), env per infra/gcp/connected/README section
    "connected env", secrets mounted from Secret Manager, --ingress all,
    domain mapping bff-dev.refi.trading after Search Console verification.
  - Daniel binds $RUNTIME_EMAIL + uniqueId (his step 4) — Appendix A packet.
EOF
