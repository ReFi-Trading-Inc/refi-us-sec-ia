variable "service_name" {
  type        = string
  description = "Cloud Run service name."
}

variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "Deployment region."
}

variable "image" {
  type        = string
  description = "Container image URI (Artifact Registry)."
}

variable "min_instances" {
  type        = number
  description = "Minimum number of instances."
  default     = 0
}

variable "max_instances" {
  type        = number
  description = "Maximum number of instances."
  default     = 10
}

variable "cpu" {
  type        = string
  description = "CPU allocation per instance."
  default     = "1"
}

variable "memory" {
  type        = string
  description = "Memory allocation per instance."
  default     = "512Mi"
}

variable "allow_public" {
  type        = bool
  description = "Allow unauthenticated public access."
  default     = true
}

variable "deletion_protection" {
  type        = bool
  description = "Prevent accidental deletion."
  default     = false
}

variable "env_vars" {
  type        = map(string)
  description = "Plain environment variables."
  default     = {}
}

variable "secret_env_vars" {
  type = map(object({
    secret_name = string
    version     = string
  }))
  description = "Environment variables sourced from Secret Manager."
  default     = {}
}
