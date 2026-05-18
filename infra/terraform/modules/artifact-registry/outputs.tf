output "repository_url" {
  description = "Base URL for pushing images (e.g. us-central1-docker.pkg.dev/project/refi-us)."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.repository_id}"
}
