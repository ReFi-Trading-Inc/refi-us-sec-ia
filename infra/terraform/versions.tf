terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # Recommended: use a remote, encrypted backend (GCS) rather than local state,
  # because the optional service-account key output would otherwise live in a
  # local state file in plaintext. Configure per environment, e.g.:
  #
  # backend "gcs" {
  #   bucket = "refi-tfstate-<env>"
  #   prefix = "refi-us-sec-ia/firestore"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
