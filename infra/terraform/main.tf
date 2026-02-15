##############################################################################
# NVRemote — Root Module
##############################################################################

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# -----------------------------------------------------------------------------
# Networking Module
# -----------------------------------------------------------------------------
module "networking" {
  source = "./modules/networking"

  project_name      = var.project_name
  project_id        = var.project_id
  environment       = var.environment
  region            = var.region
  allowed_ssh_cidrs = var.allowed_ssh_cidrs
  wireguard_port    = var.wireguard_port
}

# -----------------------------------------------------------------------------
# Database Module
# -----------------------------------------------------------------------------
module "database" {
  source = "./modules/database"

  project_name = var.project_name
  project_id   = var.project_id
  environment  = var.environment
  region       = var.region
  tier         = var.db_tier
  network_id   = module.networking.network_id
}

# -----------------------------------------------------------------------------
# Gateway Module
# -----------------------------------------------------------------------------
module "gateway" {
  source = "./modules/gateway"

  project_name   = var.project_name
  project_id     = var.project_id
  environment    = var.environment
  region         = var.region
  zone           = var.zone
  machine_type   = var.gateway_machine_type
  network        = module.networking.network_self_link
  subnetwork     = module.networking.public_subnet_self_link
  db_host        = module.database.instance_ip
  db_name        = module.database.database_name
  db_user        = module.database.user_name
  db_password    = module.database.user_password
  wireguard_port = var.wireguard_port
  ssh_public_key = var.ssh_public_key
}

# -----------------------------------------------------------------------------
# DNS Module (conditional — only when domain_name is set)
# -----------------------------------------------------------------------------
module "dns" {
  source = "./modules/dns"
  count  = var.domain_name != "" ? 1 : 0

  project_id                = var.project_id
  project_name              = var.project_name
  region                    = var.region
  domain_name               = var.domain_name
  website_cloud_run_service = "crazystream-website"
  api_cloud_run_service     = "crazystream-api"
}
