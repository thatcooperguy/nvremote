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
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ---------------------------------------------------------------------------
# Root module invocation
# ---------------------------------------------------------------------------
module "nvrs" {
  source = "../../"

  # Core settings
  region       = var.region
  environment  = "dev"
  project_name = var.project_name

  # Gateway
  gateway_instance_type = var.gateway_instance_type
  ssh_key_name          = var.ssh_key_name
  allowed_ssh_cidrs     = var.allowed_ssh_cidrs

  # Database
  db_instance_class = var.db_instance_class

  # WireGuard
  wireguard_port = var.wireguard_port

  # Optional domain
  domain_name = var.domain_name
}
