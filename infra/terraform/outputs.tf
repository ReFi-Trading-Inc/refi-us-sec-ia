output "service_account_email" {
  description = "App service account with roles/datastore.user. Attach to Cloud Run, or mint a key for Vercel."
  value       = google_service_account.app.email
}

output "firestore_database_name" {
  description = "Firestore database id backing the durable store."
  value       = google_firestore_database.default.name
}

output "firestore_location" {
  description = "Firestore location (data residency)."
  value       = google_firestore_database.default.location_id
}

# The full service-account key JSON, ready to paste into the Vercel env var
# GCP_SERVICE_ACCOUNT_KEY. Only produced when create_sa_key = true. Sensitive:
# do not print or commit; prefer a remote encrypted backend.
output "gcp_service_account_key_json" {
  description = "Service-account key JSON for GCP_SERVICE_ACCOUNT_KEY (only when create_sa_key = true)."
  value       = var.create_sa_key ? base64decode(google_service_account_key.app[0].private_key) : null
  sensitive   = true
}
