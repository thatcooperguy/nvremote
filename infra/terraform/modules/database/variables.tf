##############################################################################
# NVIDIA Remote Stream (NVRS) - Database Module Variables
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
  description = "GCP region"
  type        = string
}

variable "tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-f1-micro"
}

variable "network_id" {
  description = "ID of the VPC network for private IP access"
  type        = string
}
