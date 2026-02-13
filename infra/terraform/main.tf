##############################################################################
# NVIDIA Remote Stream (NVRS) - Root Module
##############################################################################

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# -----------------------------------------------------------------------------
# Networking Module
# -----------------------------------------------------------------------------
module "networking" {
  source = "./modules/networking"

  project_name      = var.project_name
  environment       = var.environment
  region            = var.region
  allowed_ssh_cidrs = var.allowed_ssh_cidrs
  wireguard_port    = var.wireguard_port
}

# -----------------------------------------------------------------------------
# Gateway Module
# -----------------------------------------------------------------------------
module "gateway" {
  source = "./modules/gateway"

  project_name          = var.project_name
  environment           = var.environment
  instance_type         = var.gateway_instance_type
  ssh_key_name          = var.ssh_key_name
  wireguard_port        = var.wireguard_port
  subnet_id             = module.networking.public_subnet_id
  vpc_id                = module.networking.vpc_id
  gateway_sg_id         = module.networking.gateway_sg_id
  api_sg_id             = module.networking.api_sg_id
  db_endpoint           = module.database.db_endpoint
  db_name               = module.database.db_name
  db_secret_arn         = module.database.db_secret_arn
}

# -----------------------------------------------------------------------------
# Database Module
# -----------------------------------------------------------------------------
module "database" {
  source = "./modules/database"

  project_name       = var.project_name
  environment        = var.environment
  instance_class     = var.db_instance_class
  vpc_id             = module.networking.vpc_id
  private_subnet_ids = module.networking.private_subnet_ids
  db_sg_id           = module.networking.db_sg_id
}
