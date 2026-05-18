variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "secrets" {
  type        = map(string)
  description = "Map of secret name to initial value. Set value to null to create the secret without an initial version."
  sensitive   = true
}

variable "accessor_service_accounts" {
  type        = list(string)
  description = "Service account emails granted secretmanager.secretAccessor."
  default     = []
}
