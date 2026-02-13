##############################################################################
# CrazyStream — Website Hosting Module (GCS + Cloud CDN)
#
# Hosts the static Next.js export on Google Cloud Storage with
# optional Cloud CDN via a global HTTPS load balancer.
##############################################################################

# ---------------------------------------------------------------------------
# GCS Bucket for static site files
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "website" {
  name          = "${var.project_name}-website-${var.environment}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  # Serve as a static website
  website {
    main_page_suffix = "index.html"
    not_found_page   = "404.html"
  }

  # CORS for font/asset loading
  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Cache-Control"]
    max_age_seconds = 3600
  }

  # Uniform bucket-level access (no per-object ACLs)
  uniform_bucket_level_access = true

  # Auto-delete old versions after 30 days
  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  force_destroy = var.environment == "dev" ? true : false

  labels = {
    project     = var.project_name
    environment = var.environment
    component   = "website"
  }
}

# ---------------------------------------------------------------------------
# Make the bucket publicly readable
# ---------------------------------------------------------------------------
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.website.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# ---------------------------------------------------------------------------
# GCS Bucket for release artifacts (installers)
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "artifacts" {
  name          = "${var.project_name}-releases-${var.environment}"
  project       = var.project_id
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  force_destroy = var.environment == "dev" ? true : false

  labels = {
    project     = var.project_name
    environment = var.environment
    component   = "releases"
  }
}

# Make artifacts publicly readable (download links)
resource "google_storage_bucket_iam_member" "artifacts_public_read" {
  bucket = google_storage_bucket.artifacts.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# ---------------------------------------------------------------------------
# Backend bucket for Cloud CDN (optional, for production)
# ---------------------------------------------------------------------------
resource "google_compute_backend_bucket" "website_backend" {
  count = var.enable_cdn ? 1 : 0

  name        = "${var.project_name}-website-backend-${var.environment}"
  project     = var.project_id
  bucket_name = google_storage_bucket.website.name
  enable_cdn  = true

  cdn_policy {
    cache_mode                   = "CACHE_ALL_STATIC"
    default_ttl                  = 3600
    max_ttl                      = 86400
    serve_while_stale            = 86400
    negative_caching             = true
  }
}

# ---------------------------------------------------------------------------
# URL map for HTTPS load balancer (optional, for production)
# ---------------------------------------------------------------------------
resource "google_compute_url_map" "website" {
  count = var.enable_cdn ? 1 : 0

  name            = "${var.project_name}-website-urlmap-${var.environment}"
  project         = var.project_id
  default_service = google_compute_backend_bucket.website_backend[0].self_link
}
