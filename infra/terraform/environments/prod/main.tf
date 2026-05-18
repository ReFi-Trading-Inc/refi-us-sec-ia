module "registry" {
  source        = "../../modules/artifact-registry"
  project_id    = var.project_id
  region        = var.region
  repository_id = "refi-us"
  description   = "ReFi.Trading US production container images"
}

module "workload_identity" {
  source      = "../../modules/workload-identity"
  project_id  = var.project_id
  github_repo = var.github_repo
}

module "secrets" {
  source     = "../../modules/secret-manager"
  project_id = var.project_id
  secrets = {
    session-secret          = null
    ip-hash-secret          = null
    eligibility-jwt-secret  = null
    refi-data-adapter       = "live"
  }
  accessor_service_accounts = [module.web.runner_service_account_email]
}

module "web" {
  source         = "../../modules/cloud-run-service"
  service_name   = "refi-us-web"
  project_id     = var.project_id
  region         = var.region
  image          = var.web_image
  min_instances  = 1
  max_instances  = 20
  cpu            = "1"
  memory         = "1Gi"
  allow_public   = true
  deletion_protection = true

  env_vars = {
    NEXT_PUBLIC_REFI_ENV              = "prod"
    NEXT_PUBLIC_API_BASE_URL          = var.api_base_url
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = var.walletconnect_project_id
    NEXT_PUBLIC_POSTHOG_KEY           = var.posthog_key
    NEXT_PUBLIC_POSTHOG_HOST          = "https://app.posthog.com"
    NEXT_PUBLIC_SENTRY_DSN            = var.sentry_dsn
    OTEL_EXPORTER_OTLP_ENDPOINT       = "https://cloudtrace.googleapis.com/v1/traces"
  }

  secret_env_vars = {
    SESSION_SECRET = {
      secret_name = "session-secret"
      version     = "latest"
    }
    IP_HASH_SECRET = {
      secret_name = "ip-hash-secret"
      version     = "latest"
    }
    ELIGIBILITY_JWT_SECRET = {
      secret_name = "eligibility-jwt-secret"
      version     = "latest"
    }
    REFI_DATA_ADAPTER = {
      secret_name = "refi-data-adapter"
      version     = "latest"
    }
  }
}
