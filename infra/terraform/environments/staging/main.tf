module "registry" {
  source        = "../../modules/artifact-registry"
  project_id    = var.project_id
  region        = var.region
  repository_id = "refi-us-staging"
  description   = "ReFi.Trading US staging container images"
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
    session-secret         = null
    ip-hash-secret         = null
    eligibility-jwt-secret = null
    refi-data-adapter      = "live"
  }
  accessor_service_accounts = [module.web.runner_service_account_email]
}

module "web" {
  source       = "../../modules/cloud-run-service"
  service_name = "refi-us-web-staging"
  project_id   = var.project_id
  region       = var.region
  image        = var.web_image
  min_instances = 0
  max_instances = 5
  cpu           = "1"
  memory        = "512Mi"
  allow_public  = true

  env_vars = {
    NEXT_PUBLIC_REFI_ENV              = "staging"
    NEXT_PUBLIC_API_BASE_URL          = var.api_base_url
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = var.walletconnect_project_id
    NEXT_PUBLIC_POSTHOG_KEY           = var.posthog_key
    NEXT_PUBLIC_POSTHOG_HOST          = "https://app.posthog.com"
    NEXT_PUBLIC_SENTRY_DSN            = var.sentry_dsn
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
