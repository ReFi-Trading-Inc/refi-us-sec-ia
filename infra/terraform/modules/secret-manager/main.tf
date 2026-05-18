resource "google_secret_manager_secret" "this" {
  for_each  = var.secrets
  secret_id = each.key
  project   = var.project_id

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "this" {
  for_each    = { for k, v in var.secrets : k => v if v != null }
  secret      = google_secret_manager_secret.this[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each  = { for entry in local.accessor_bindings : "${entry.secret_key}:${entry.sa}" => entry }
  project   = var.project_id
  secret_id = google_secret_manager_secret.this[each.value.secret_key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value.sa}"
}

locals {
  accessor_bindings = flatten([
    for secret_key in keys(var.secrets) : [
      for sa in var.accessor_service_accounts : {
        secret_key = secret_key
        sa         = sa
      }
    ]
  ])
}
