output "workload_identity_provider" {
  description = "Full resource name of the WIF provider (used in GitHub Actions auth step)."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account_email" {
  description = "Email of the GitHub Actions deployer service account."
  value       = google_service_account.deployer.email
}
