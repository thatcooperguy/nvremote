##############################################################################
# NVIDIA Remote Stream (NVRS) - Prod Environment
# Uses GCS backend for remote state with locking.
##############################################################################

terraform {
  required_version = ">= 1.5"

  backend "gcs" {
    bucket = "nvrs-terraform-state-prod"
    prefix = "prod/terraform.tfstate"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

module "nvrs" {
  source = "../../"

  # Core settings
  project_id   = var.project_id
  region       = var.region
  zone         = var.zone
  environment  = "prod"
  project_name = "nvrs"

  # Gateway (production-sized instances)
  gateway_machine_type = var.gateway_machine_type
  ssh_public_key       = var.ssh_public_key
  allowed_ssh_cidrs    = var.allowed_ssh_cidrs

  # Database (production-sized instances)
  db_tier = var.db_tier

  # WireGuard
  wireguard_port = var.wireguard_port

  # Domain
  domain_name = var.domain_name
}

# ---------------------------------------------------------------------------
# Variables (prod-specific defaults)
# ---------------------------------------------------------------------------
variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "gridbusiness-220920"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-west1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-west1-b"
}

variable "gateway_machine_type" {
  description = "GCE machine type for the gateway"
  type        = string
  default     = "e2-medium"
}

variable "db_tier" {
  description = "Cloud SQL instance tier for PostgreSQL"
  type        = string
  default     = "db-g1-small"
}

variable "ssh_public_key" {
  description = "SSH public key for access to the gateway instance"
  type        = string
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed to SSH into the gateway (restrict in production)"
  type        = list(string)
  default     = []
}

variable "wireguard_port" {
  description = "UDP port for WireGuard VPN"
  type        = number
  default     = 51820
}

variable "domain_name" {
  description = "Custom domain name for the API endpoint"
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------
output "gateway_public_ip" {
  description = "Public IP of the prod gateway"
  value       = module.nvrs.gateway_public_ip
}

output "api_url" {
  description = "URL of the prod API"
  value       = module.nvrs.api_url
}

output "db_connection_name" {
  description = "Prod Cloud SQL connection name"
  value       = module.nvrs.db_connection_name
}

output "db_ip" {
  description = "Prod Cloud SQL private IP"
  value       = module.nvrs.db_ip
  sensitive   = true
}

output "wireguard_endpoint" {
  description = "Prod WireGuard endpoint"
  value       = module.nvrs.wireguard_endpoint
}

output "ssh_command" {
  description = "SSH command to connect to the prod gateway"
  value       = module.nvrs.ssh_command
}
