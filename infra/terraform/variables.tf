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
    DEPRECATED — do not enable.

    Mints a long-lived service-account key. The private key is written into
    Terraform state, and long-lived keys are not an accepted credential for the
    connected environment: CI uses Workload Identity and Cloud Run uses the
    attached service account via ADC.

    Retained only so an existing state that set it does not break. There is no
    supported reason to turn it on.
  EOT
  default     = false
}
