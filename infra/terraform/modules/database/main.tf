##############################################################################
# NVIDIA Remote Stream (NVRS) - Database Module
# Cloud SQL PostgreSQL instance with private networking.
##############################################################################

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  db_name     = "${replace(var.project_name, "-", "_")}_${var.environment}"
}

# -----------------------------------------------------------------------------
# Random Password
# -----------------------------------------------------------------------------
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# -----------------------------------------------------------------------------
# Cloud SQL PostgreSQL Instance
# -----------------------------------------------------------------------------
resource "google_sql_database_instance" "main" {
  name                = "${local.name_prefix}-postgres"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_15"
  deletion_protection = false

  settings {
    tier              = var.tier
    disk_size         = 10
    disk_type         = "PD_SSD"
    disk_autoresize   = true
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.network_id
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = var.environment == "prod" ? true : false
      transaction_log_retention_days = var.environment == "prod" ? 7 : 3
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_statement"
      value = "ddl"
    }

    user_labels = {
      project     = var.project_name
      environment = var.environment
      managed_by  = "terraform"
    }
  }
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------
resource "google_sql_database" "main" {
  name     = local.db_name
  project  = var.project_id
  instance = google_sql_database_instance.main.name
}

# -----------------------------------------------------------------------------
# Database User
# -----------------------------------------------------------------------------
resource "google_sql_user" "main" {
  name     = "nvrs_admin"
  project  = var.project_id
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}
