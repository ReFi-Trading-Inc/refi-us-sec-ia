# Separate state and ownership from backend Terraform and the existing demo.
terraform {
  required_version = ">= 1.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  backend "gcs" {
    bucket = "refinity-dev-frontend-tfstate"
    prefix = "connected-dev"
  }
}

provider "google" {
  project = "refinity-dev"
  region  = "us-west1"
}

variable "image" {
  type        = string
  default     = null
  description = "Immutable frontend image digest. Null bootstraps dependencies only."
  validation {
    condition     = var.image == null ? true : can(regex("^us-west1-docker.pkg.dev/refinity-dev/refi-frontend/web@sha256:[a-f0-9]{64}$", var.image))
    error_message = "Only an immutable image in the dedicated frontend repository is allowed."
  }
}

locals {
  project = "refinity-dev"
  region  = "us-west1"
  name    = "refi-frontend-integration"
  origin  = "https://refi-frontend-integration-182665799543.us-west1.run.app"
  secrets = {
    SESSION_SECRET         = "refi-frontend-session"
    SESSION_JWT_SECRET     = "refi-frontend-session-jwt"
    ELIGIBILITY_JWT_SECRET = "refi-frontend-eligibility"
    IP_HASH_SECRET         = "refi-frontend-ip-hash"
  }
}

resource "google_service_account" "runtime" {
  account_id   = "refi-frontend-runtime"
  display_name = "Refi Trading isolated connected Dev frontend runtime"
}

resource "google_service_account" "build" {
  account_id   = "refi-frontend-build"
  display_name = "Refi Trading isolated frontend build and deployment"
}

resource "google_artifact_registry_repository" "images" {
  location      = local.region
  repository_id = "refi-frontend"
  format        = "DOCKER"
  docker_config { immutable_tags = true }
}

resource "google_artifact_registry_repository_iam_member" "builder" {
  location   = local.region
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.build.email}"
}

resource "google_project_iam_member" "build_logs" {
  project = local.project
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.build.email}"
}

resource "google_storage_bucket" "build_source" {
  name                        = "refinity-dev-frontend-build-source"
  location                    = local.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
}

resource "google_storage_bucket_iam_member" "build_source" {
  bucket = google_storage_bucket.build_source.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.build.email}"
}

resource "google_firestore_database" "frontend" {
  name                    = local.name
  location_id             = local.region
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"
}

resource "google_project_iam_member" "database" {
  project = local.project
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.runtime.email}"
  condition {
    title      = "frontend-database-only"
    expression = "resource.name == 'projects/${local.project}/databases/${local.name}'"
  }
}

resource "google_kms_key_ring" "frontend" {
  name     = "refi-frontend"
  location = local.region
}

resource "google_kms_crypto_key" "signing" {
  for_each = toset(["investor-assertion", "identity-bridge"])
  name     = each.key
  key_ring = google_kms_key_ring.frontend.id
  purpose  = "ASYMMETRIC_SIGN"
  version_template {
    algorithm        = "EC_SIGN_P256_SHA256"
    protection_level = "SOFTWARE"
  }
  lifecycle { prevent_destroy = true }
}

resource "google_kms_crypto_key_iam_member" "signing" {
  for_each      = google_kms_crypto_key.signing
  crypto_key_id = each.value.id
  role          = "roles/cloudkms.signerVerifier"
  member        = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_kms_crypto_key_iam_member" "public_keys" {
  for_each      = google_kms_crypto_key.signing
  crypto_key_id = each.value.id
  role          = "roles/cloudkms.publicKeyViewer"
  member        = "serviceAccount:${google_service_account.runtime.email}"
}

# Secret values are generated directly into Secret Manager, never Terraform state.
resource "google_secret_manager_secret" "session" {
  for_each  = local.secrets
  secret_id = each.value
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each  = google_secret_manager_secret.session
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service" "frontend" {
  count               = var.image == null ? 0 : 1
  name                = local.name
  location            = local.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  # Cloud Run materializes this service-level block even at zero. Record it
  # explicitly so refresh does not propose a perpetual no-effect removal.
  scaling {
    min_instance_count = 0
  }
  labels = {
    environment = "dev"
    owner       = "refi-frontend"
    workstream  = "integration"
  }
  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = 40
    timeout                          = "300s"
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
    containers {
      image = var.image
      ports { container_port = 3000 }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      startup_probe {
        http_get { path = "/api/health" }
        period_seconds    = 5
        failure_threshold = 24
      }
      dynamic "env" {
        for_each = {
          NODE_ENV                               = "production"
          REFI_ENV                               = "staging"
          REFI_DATA_ADAPTER                      = "live"
          REFI_RELEASE_STAGE                     = "automated_alpha"
          REFI_INVESTOR_API_MODE                 = "client"
          REFI_INVESTOR_API_ASSERTION_MODE       = "mint"
          REFI_INVESTOR_API_CREDENTIAL_MODE      = "native-cloud-run"
          REFI_INVESTOR_API_ALLOW_REMOTE         = "0"
          REFI_INVESTOR_API_BASE_URL             = "https://investor-api-74kl57biwa-uw.a.run.app"
          REFI_IDENTITY_CCID_BASE_URL            = "https://identity-ccid-74kl57biwa-uw.a.run.app"
          REFI_INVESTOR_API_GOOGLE_AUDIENCE      = "https://investor-api.dev.refi.internal"
          REFI_IDENTITY_CCID_GOOGLE_AUDIENCE     = "https://identity-ccid.dev.refi.internal"
          REFI_CONNECTED_STORE_BACKING           = "durable"
          REFI_CONNECTED_STORE_NAMESPACE         = "refinity-dev-frontend"
          GCP_PROJECT_ID                         = local.project
          FIRESTORE_DATABASE_ID                  = google_firestore_database.frontend.name
          REFI_BACKING__ACKNOWLEDGMENT_CHALLENGE = "durable"
          REFI_BACKING__ATTESTATION_SUBMISSION   = "durable"
          REFI_BACKING__ALPHA_APPLICATION        = "durable"
          REFI_BACKING__ALPHA_HANDOFF_JTI        = "durable"
          REFI_AUTH_PROVIDER                     = "unconfigured"
          REFI_KYC_PROVIDER                      = "unconfigured"
          REFI_KYC_MOCK_CONTROLS                 = "0"
          BFF_ASSERTION_SIGNER                   = "kms"
          BFF_ASSERTION_KMS_KEY_VERSION          = "${google_kms_crypto_key.signing["investor-assertion"].id}/cryptoKeyVersions/1"
          BFF_ASSERTION_KID                      = "refi-dev-investor-20260911-1"
          BFF_ASSERTION_ISSUER                   = "urn:refinity:bff:dev"
          INVESTOR_API_AUDIENCE                  = "urn:refinity:investor-api:dev"
          BFF_ASSERTION_ALLOW_EPHEMERAL_KEY      = "0"
          BRIDGE_ASSERTION_SIGNER                = "kms"
          BRIDGE_ASSERTION_KMS_KEY_VERSION       = "${google_kms_crypto_key.signing["identity-bridge"].id}/cryptoKeyVersions/1"
          BRIDGE_ASSERTION_KID                   = "refi-dev-bridge-20260911-1"
          BRIDGE_ASSERTION_ISSUER                = local.origin
          IDENTITY_CCID_UPSTREAM_AUDIENCE        = "urn:refinity:identity-bridge:dev"
          IDENTITY_CCID_JWKS_URL                 = "https://identity-ccid-74kl57biwa-uw.a.run.app/.well-known/jwks.json"
          REFI_AUTH_CALLBACK_URL                 = "${local.origin}/us/auth/callback"
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.session[env.key].secret_id
              version = "1"
            }
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.runtime]
  # CI owns releases; Terraform owns runtime configuration and IAM.
  lifecycle {
    ignore_changes = [template[0].containers[0].image, traffic]
  }
}

# Only the isolated frontend entry is public. Application authentication remains
# fail-closed; this does not grant access to the backend or enable cohort trading.
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.image == null ? 0 : 1
  location = local.region
  name     = google_cloud_run_v2_service.frontend[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "runtime_identity" {
  value = { email = google_service_account.runtime.email, unique_id = google_service_account.runtime.unique_id }
}
output "origin" { value = local.origin }
output "service_uri" { value = try(google_cloud_run_v2_service.frontend[0].uri, null) }
output "database" { value = google_firestore_database.frontend.id }

# On-demand, unscheduled check with the SAME runtime identity and image.
# It accesses only isolated probe documents and signing/metadata boundaries.
resource "google_cloud_run_v2_job" "runtime_probe" {
  count               = var.image == null ? 0 : 1
  name                = "refi-frontend-runtime-check"
  location            = local.region
  deletion_protection = false
  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image]
  }
  template {
    template {
      service_account = google_service_account.runtime.email
      timeout         = "120s"
      max_retries     = 0
      containers {
        image   = var.image
        command = ["node"]
        args    = ["/app/runtime-probe.cjs", "write"]
        resources { limits = { cpu = "1", memory = "512Mi" } }
      }
    }
  }
}
