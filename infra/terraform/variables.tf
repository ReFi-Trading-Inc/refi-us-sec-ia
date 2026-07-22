variable "project_id" {
  type        = string
  description = "GCP project ID that will host the Firestore database and app service account."
}

variable "region" {
  type        = string
  description = "Default GCP region for regional resources."
  default     = "us-central1"
}

variable "firestore_location_id" {
  type        = string
  description = <<-EOT
    Firestore location. Use a US multi-region (nam5) or US region to keep
    investor books-and-records data in-US for SEC data-residency posture.
  EOT
  default     = "nam5"
}

variable "database_name" {
  type        = string
  description = "Firestore database id. '(default)' is the standard single database."
  default     = "(default)"
}

variable "app_service_account_id" {
  type        = string
  description = "Account id (local part) for the app's Firestore service account."
  default     = "refi-us-web"
}

variable "create_sa_key" {
  type        = bool
  description = <<-EOT
    Whether Terraform should mint a service-account key (needed by hosts without
    workload identity, e.g. Vercel). WARNING: the private key is written to
    Terraform state — only enable this with a remote, encrypted backend, and
    prefer `gcloud iam service-accounts keys create` or workload identity where
    possible. Cloud Run does NOT need this (it uses the attached SA via ADC).
  EOT
  default     = false
}
