#!/usr/bin/env bash
# Run from the frontend checkout. Never changes global gcloud or Git settings.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
readonly project=refinity-dev
readonly region=us-west1
readonly tfdir=infra/terraform/connected-dev
if [[ "$(git branch --show-current)" != integration/refinity-dev ]]; then
  echo 'Switch to integration/refinity-dev before operating this deployment.' >&2
  exit 1
fi
case "${1:-}" in
  build)
    if [[ -n "$(git status --porcelain)" ]]; then
      echo 'Commit the reviewed source before building an immutable image.' >&2
      exit 1
    fi
    source_sha="$(git rev-parse HEAD)"
    gcloud builds submit . --project "$project" --region "$region" \
      --config infra/cloudrun/cloudbuild.connected.yaml \
      --gcs-source-staging-dir gs://refinity-dev-frontend-build-source/source \
      --substitutions "_SOURCE_SHA=$source_sha" --async
    ;;
  init|plan|apply)
    # An active user login can outlive local ADC reauthentication. This token is
    # process-local, never logged, saved in configuration, or given to the app.
    export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
    if [[ "$1" == init ]]; then
      terraform -chdir="$tfdir" init -input=false
    elif [[ "$1" == plan ]]; then
      release=()
      [[ ! -f "$tfdir/release.tfvars" ]] || release=(-var-file=release.tfvars)
      terraform -chdir="$tfdir" plan -input=false "${release[@]}" -out=deployment.tfplan
    else
      # Apply the previously inspected plan; do not silently create a fresh one.
      terraform -chdir="$tfdir" apply -input=false deployment.tfplan
    fi
    ;;
  initialize-secrets)
    for secret in refi-frontend-session refi-frontend-session-jwt refi-frontend-eligibility refi-frontend-ip-hash; do
      existing="$(gcloud secrets versions list "$secret" --project "$project" --format='value(name)' --limit=1)"
      if [[ -z "$existing" ]]; then
        openssl rand -hex 32 | gcloud secrets versions add "$secret" --project "$project" --data-file=-
      else
        echo "$secret already has a version; left unchanged."
      fi
    done
    ;;
  check)
    gcloud run jobs execute refi-frontend-runtime-check --project "$project" --region "$region" --wait
    gcloud run jobs execute refi-frontend-runtime-check --project "$project" --region "$region" \
      --args=/app/runtime-probe.cjs,read --wait
    ;;
  *)
    echo 'Usage: bash infra/cloudrun/connected-dev.sh {init|plan|apply|initialize-secrets|build|check}' >&2
    exit 2
    ;;
esac
