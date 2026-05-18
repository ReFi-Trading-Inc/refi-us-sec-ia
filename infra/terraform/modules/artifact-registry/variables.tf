variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "Registry region."
}

variable "repository_id" {
  type        = string
  description = "Repository name (e.g. refi-us)."
}

variable "description" {
  type        = string
  description = "Human-readable description."
  default     = ""
}
