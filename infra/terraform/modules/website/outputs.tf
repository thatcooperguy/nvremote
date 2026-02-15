##############################################################################
# NVRemote — Website Module Outputs
##############################################################################

output "website_url" {
  description = "Public URL of the NVRemote website"
  value       = "https://storage.googleapis.com/${google_storage_bucket.website.name}/index.html"
}

output "website_bucket" {
  description = "GCS bucket name for the website"
  value       = google_storage_bucket.website.name
}

output "artifacts_bucket" {
  description = "GCS bucket name for release artifacts"
  value       = google_storage_bucket.artifacts.name
}

output "artifacts_url" {
  description = "Base URL for release artifact downloads"
  value       = "https://storage.googleapis.com/${google_storage_bucket.artifacts.name}"
}
