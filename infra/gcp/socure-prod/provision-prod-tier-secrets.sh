#!/usr/bin/env bash
# Prod-tier secret CONTAINERS for refi-socure-prod (no versions; founder adds real values). Dry-run unless APPLY=1.
set -euo pipefail
PROJECT="${PROJECT:-refi-socure-prod}"
SA="socure-prod-runtime@${PROJECT}.iam.gserviceaccount.com"
run() { if [ "${APPLY:-0}" = "1" ]; then "$@"; else echo "+ $*"; fi; }
for s in prod-alpha-handoff-public-jwk prod-bff-assertion-private-jwk; do
  run gcloud secrets create "$s" --replication-policy automatic --project "$PROJECT"
  run gcloud secrets add-iam-policy-binding "$s" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor --project "$PROJECT"
done
