##############################################################################
# NVRemote — Website Module Variables
##############################################################################

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

variable "region" {
  description = "GCP region for the storage bucket"
  type        = string
}

variable "enable_cdn" {
  description = "Enable Cloud CDN with HTTPS load balancer (recommended for production)"
  type        = bool
  default     = false
}
