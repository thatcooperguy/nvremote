##############################################################################
# NVRemote — DNS & Domain Mapping Module
#
# Creates a Cloud DNS managed zone and maps custom domains to Cloud Run
# services. SSL certificates are automatically provisioned by Cloud Run.
##############################################################################

# ---------------------------------------------------------------------------
# Cloud DNS Managed Zone
# ---------------------------------------------------------------------------
resource "google_dns_managed_zone" "nvremote" {
  name        = "${var.project_name}-dns-zone"
  dns_name    = "${var.domain_name}."
  project     = var.project_id
  description = "NVRemote public DNS zone for ${var.domain_name}"
  visibility  = "public"

  labels = {
    project   = var.project_name
    component = "dns"
  }
}

# ---------------------------------------------------------------------------
# Cloud Run Domain Mappings (auto-provisions SSL via Google-managed certs)
# ---------------------------------------------------------------------------

resource "google_cloud_run_domain_mapping" "website" {
  name     = var.domain_name
  location = var.region
  project  = var.project_id

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = var.website_cloud_run_service
  }
}

resource "google_cloud_run_domain_mapping" "api" {
  name     = "api.${var.domain_name}"
  location = var.region
  project  = var.project_id

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = var.api_cloud_run_service
  }
}

# ---------------------------------------------------------------------------
# DNS Records — point domains to Cloud Run via ghs.googlehosted.com
# ---------------------------------------------------------------------------

# CNAME for apex → Cloud Run (via ghs.googlehosted.com)
resource "google_dns_record_set" "apex_cname" {
  name         = google_dns_managed_zone.nvremote.dns_name
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.nvremote.name
  project      = var.project_id

  # Cloud Run domain mapping provides these IPs after verification.
  # Use the IPs from: gcloud run domain-mappings describe --domain=<domain>
  # For now, use Google's global anycast IPs for Cloud Run custom domains.
  rrdatas = ["216.239.32.21", "216.239.34.21", "216.239.36.21", "216.239.38.21"]
}

# CNAME for api subdomain → Cloud Run
resource "google_dns_record_set" "api_cname" {
  name         = "api.${google_dns_managed_zone.nvremote.dns_name}"
  type         = "CNAME"
  ttl          = 300
  managed_zone = google_dns_managed_zone.nvremote.name
  project      = var.project_id
  rrdatas      = ["ghs.googlehosted.com."]
}

# CNAME for www → apex
resource "google_dns_record_set" "www_cname" {
  name         = "www.${google_dns_managed_zone.nvremote.dns_name}"
  type         = "CNAME"
  ttl          = 300
  managed_zone = google_dns_managed_zone.nvremote.name
  project      = var.project_id
  rrdatas      = ["${var.domain_name}."]
}
