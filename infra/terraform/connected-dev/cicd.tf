# Existing frontend targets only. No project-wide Cloud Run write permission.
# Deploy authority implies code execution as this frontend runtime: branch write
# access is therefore deployment authority. No Terraform-state access for CI.
resource "google_cloud_run_v2_service_iam_member" "deploy" {
  count    = var.image == null ? 0 : 1
  location = local.region
  name     = google_cloud_run_v2_service.frontend[0].name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.build.email}"
}

resource "google_cloud_run_v2_job_iam_member" "deploy_probe" {
  count    = var.image == null ? 0 : 1
  location = local.region
  name     = google_cloud_run_v2_job.runtime_probe[0].name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.build.email}"
}

resource "google_service_account_iam_member" "deploy_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.build.email}"
}

# Poll operation status/build creation time without project-wide write access.
resource "google_project_iam_custom_role" "deploy_status" {
  role_id     = "refiFrontendDeploymentStatus"
  title       = "Frontend deployment operation status"
  permissions = ["cloudbuild.builds.get", "run.operations.get", "run.executions.get"]
}

resource "google_project_iam_member" "deploy_status" {
  project = local.project
  role    = google_project_iam_custom_role.deploy_status.name
  member  = "serviceAccount:${google_service_account.build.email}"
}

# Generation-guarded deployment lock and release receipts, not Terraform state.
resource "google_storage_bucket" "releases" {
  name                        = "refinity-dev-frontend-releases"
  location                    = local.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  versioning { enabled = true }
}

resource "google_storage_bucket_iam_member" "releases" {
  bucket = google_storage_bucket.releases.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.build.email}"
}

# Browser-authorized connection is managed outside Terraform so OAuth tokens
# never enter state. Only the linked repository and exact push trigger are IaC.
resource "google_cloudbuildv2_repository" "frontend" {
  name              = "refi-us-sec-ia"
  location          = local.region
  parent_connection = "projects/refinity-dev/locations/us-west1/connections/refi-frontend-github"
  remote_uri        = "https://github.com/ReFi-Trading-Inc/refi-us-sec-ia.git"
}

resource "google_cloudbuild_trigger" "frontend" {
  name            = "refi-frontend-integration"
  location        = local.region
  description     = "Frontend integration branch only: test, build, verify candidate and promote in refinity-dev"
  service_account = google_service_account.build.id
  filename        = "infra/cloudrun/cloudbuild.connected-cicd.yaml"
  # Documentation-only commits do not rebuild/deploy. Runtime/config/test edits do.
  ignored_files = ["**/*.md", "infra/terraform/**"]
  repository_event_config {
    repository = google_cloudbuildv2_repository.frontend.id
    push { branch = "^integration/refinity-dev$" }
  }
  depends_on = [
    google_cloud_run_v2_service_iam_member.deploy,
    google_cloud_run_v2_job_iam_member.deploy_probe,
    google_service_account_iam_member.deploy_runtime,
    google_project_iam_member.deploy_status,
    google_storage_bucket_iam_member.releases,
  ]
}
