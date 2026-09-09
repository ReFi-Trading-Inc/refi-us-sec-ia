#!/usr/bin/env bash
# Deploy the demo-tier image to Cloud Run as ONE always-on instance.
#
# Why one instance: the demo tier keeps its walkthrough state in-process (the
# demo world) and on local disk (the prototype store). Any horizontally scaled
# host splits that state across instances and a walkthrough silently loses
# steps (observed on Vercel 2026-09-08). min=max=1 makes every request see the
# same process; one instance serves a demo audience comfortably.
#
# Usage:
#   infra/cloudrun/deploy-demo.sh <dotenv-file> [image-tag]
#
# <dotenv-file> is the demo Vercel project's Production env (`vercel env pull`):
# REFI_ENV=demo, the four secrets, REFI_KYC_*, the demo handoff keys,
# FLAG_ALPHA_CLAIM_ROUTE=on. It is read by gcloud only — never printed.
set -euo pipefail
ENV_FILE="${1:?dotenv file required}"
TAG="${2:-latest}"
PROJECT=refi-game-prod
REGION=us-central1
SERVICE=demo-web
IMAGE="us-central1-docker.pkg.dev/${PROJECT}/refi/demo-web:${TAG}"

# dotenv -> YAML for --env-vars-file. NEXT_PUBLIC_* are build-time (skipped);
# the prototype store is pinned to the container's tmp.
YAML="$(mktemp)"
trap 'rm -f "$YAML"' EXIT
{
  echo 'REFI_PROTOTYPE_STORE_DIR: "/tmp/refi-prototype-store"'
  # Cloud Run's front end owns Host/X-Forwarded-Proto; see lib/bff/origin.ts.
  echo 'REFI_TRUST_PROXY_HOST: "1"'
  grep -E '^[A-Z0-9_]+=' "$ENV_FILE" \
    | grep -vE '^(NEXT_PUBLIC_|REFI_PROTOTYPE_STORE_DIR=|VERCEL)' \
    | python3 -c '
import sys, json
for line in sys.stdin:
    k, _, v = line.rstrip("\n").partition("=")
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'"'"'":
        v = v[1:-1]
    print(f"{k}: {json.dumps(v)}")
'
} > "$YAML"

gcloud run deploy "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" \
  --platform managed \
  --allow-unauthenticated \
  --port 3000 \
  --min-instances 1 --max-instances 1 \
  --concurrency 80 \
  --cpu 1 --memory 1Gi \
  --no-cpu-throttling \
  --timeout 300 \
  --env-vars-file "$YAML"

gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --format="value(status.url)"
