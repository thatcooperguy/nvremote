variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "region" {
  description = "GCP region for Cloud Run domain mappings"
  type        = string
}

variable "domain_name" {
  description = "Root domain name (e.g., crazystream.gg)"
  type        = string
}

variable "website_cloud_run_service" {
  description = "Name of the Cloud Run service for the website"
  type        = string
}

variable "api_cloud_run_service" {
  description = "Name of the Cloud Run service for the API"
  type        = string
}
