variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "GCP region."
  default     = "us-central1"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository (owner/repo)."
  default     = "ReFi-Trading-Inc/refi-us-sec-ia"
}

variable "web_image" {
  type        = string
  description = "Container image URI for the web service."
}

variable "api_base_url" {
  type        = string
  description = "ReFi API base URL."
}

variable "walletconnect_project_id" {
  type        = string
  description = "WalletConnect project ID."
  sensitive   = true
}

variable "posthog_key" {
  type        = string
  description = "PostHog project API key."
  sensitive   = true
}

variable "sentry_dsn" {
  type        = string
  description = "Sentry DSN for error tracking."
  sensitive   = true
}
