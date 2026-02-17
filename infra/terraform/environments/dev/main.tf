##############################################################################
# NVIDIA Remote Stream (NVRS) - Dev Environment
#
# Uses a local state backend for simplicity during development.
# Variables and outputs are defined in their own files.
#
# Usage:
#   terraform init
#   terraform plan -out=plan.tfplan
#   terraform apply plan.tfplan
##############################################################################

terraform {
  required_version = ">= 1.5"

  # Local backend for dev -- state is stored on disk
  backend "local" {
    path = "terraform.tfstate"
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

# ---------------------------------------------------------------------------
# Root module invocation
# ---------------------------------------------------------------------------
module "nvrs" {
  source = "../../"

  # Core settings
  project_id   = var.project_id
  region       = var.region
  zone         = var.zone
  environment  = "dev"
  project_name = var.project_name

  # Gateway
  gateway_machine_type = var.gateway_machine_type
  ssh_public_key       = var.ssh_public_key
  allowed_ssh_cidrs    = var.allowed_ssh_cidrs

  # Database
  db_tier = var.db_tier

  # WireGuard
  wireguard_port = var.wireguard_port

  # Optional domain
  domain_name = var.domain_name
}
