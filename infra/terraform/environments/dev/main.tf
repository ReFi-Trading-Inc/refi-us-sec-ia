module "web" {
  source       = "../../modules/cloud-run-service"
  service_name = "refi-us-web-dev"
  project_id   = var.project_id
  region       = var.region
  image        = var.web_image
  min_instances = 0
  max_instances = 2
  allow_public  = true

  env_vars = {
    NEXT_PUBLIC_REFI_ENV              = "dev"
    NEXT_PUBLIC_API_BASE_URL          = var.api_base_url
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = var.walletconnect_project_id
    NEXT_PUBLIC_POSTHOG_KEY           = ""
    NEXT_PUBLIC_POSTHOG_HOST          = "https://app.posthog.com"
    NEXT_PUBLIC_SENTRY_DSN            = ""
    SESSION_SECRET                    = "dev-session-secret-not-for-production"
    IP_HASH_SECRET                    = "dev-ip-hash-secret-not-for-production"
    ELIGIBILITY_JWT_SECRET            = "dev-eligibility-jwt-secret-not-for-production"
    REFI_DATA_ADAPTER                 = "mock"
  }
}
