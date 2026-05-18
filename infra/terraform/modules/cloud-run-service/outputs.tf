output "service_url" {
  description = "The HTTPS URL of the Cloud Run service."
  value       = google_cloud_run_v2_service.this.uri
}

output "service_name" {
  description = "The name of the Cloud Run service."
  value       = google_cloud_run_v2_service.this.name
}

output "runner_service_account_email" {
  description = "Email of the service account running the Cloud Run service."
  value       = google_service_account.runner.email
}
