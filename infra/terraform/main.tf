# ReFi US SEC IA — durable store (Cloud Firestore) infrastructure.
#
# Provisions the Firestore database that backs the BFF's compliance-relevant,
# books-and-records-adjacent entities (starting with the alpha funnel:
# alpha-application, alpha-handoff-jti), plus the app service account and the
# least-privilege IAM it needs. Provider-portable HCL: the app code selects
# this backing per entity via REFI_BACKING__<ENTITY>=durable.

resource "google_project_service" "firestore" {
  project            = var.project_id
  service            = "firestore.googleapis.com"
  disable_on_destroy = false
}

resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = var.database_name
  location_id = var.firestore_location_id
  type        = "FIRESTORE_NATIVE"

  # Books-and-records posture: protect the DB from accidental deletion and
  # keep point-in-time recovery on (Rule 204-2 retention support).
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
  deletion_policy                   = "ABANDON"

  depends_on = [google_project_service.firestore]
}

resource "google_service_account" "app" {
  project      = var.project_id
  account_id   = var.app_service_account_id
  display_name = "ReFi US SEC IA web app (Firestore access)"
}

# Least privilege: read/write documents only. Not roles/datastore.owner
# (no index/admin management from the app runtime).
resource "google_project_iam_member" "app_datastore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.app.email}"
}

# Optional key for hosts without workload identity (e.g. Vercel). Off by
# default; see var.create_sa_key for the state-secret warning.
resource "google_service_account_key" "app" {
  count              = var.create_sa_key ? 1 : 0
  service_account_id = google_service_account.app.name
}
