##############################################################################
# NVIDIA Remote Stream (NVRS) - Prod Environment
# Uses S3 + DynamoDB backend for remote state with locking.
##############################################################################

terraform {
  required_version = ">= 1.5"

  backend "s3" {
    bucket         = "nvrs-terraform-state-prod"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "nvrs-terraform-locks-prod"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

module "nvrs" {
  source = "../../"

  # Core settings
  region       = var.region
  environment  = "prod"
  project_name = "nvrs"

  # Gateway (production-sized instances)
  gateway_instance_type = var.gateway_instance_type
  ssh_key_name          = var.ssh_key_name
  allowed_ssh_cidrs     = var.allowed_ssh_cidrs

  # Database (production-sized instances)
  db_instance_class = var.db_instance_class

  # WireGuard
  wireguard_port = var.wireguard_port

  # Domain
  domain_name = var.domain_name
}

# ---------------------------------------------------------------------------
# Variables (prod-specific defaults)
# ---------------------------------------------------------------------------
variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "gateway_instance_type" {
  description = "EC2 instance type for the gateway"
  type        = string
  default     = "t3.small"
}

variable "db_instance_class" {
  description = "RDS instance class for PostgreSQL"
  type        = string
  default     = "db.t3.small"
}

variable "ssh_key_name" {
  description = "Name of the EC2 key pair for SSH access"
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

output "db_endpoint" {
  description = "Prod database endpoint"
  value       = module.nvrs.db_endpoint
  sensitive   = true
}

output "wireguard_endpoint" {
  description = "Prod WireGuard endpoint"
  value       = module.nvrs.wireguard_endpoint
}
