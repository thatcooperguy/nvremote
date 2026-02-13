##############################################################################
# NVIDIA Remote Stream (NVRS) - Gateway Module
# GCE instance running WireGuard VPN and the NVRS gateway service.
##############################################################################

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# -----------------------------------------------------------------------------
# Service Account
# -----------------------------------------------------------------------------
resource "google_service_account" "gateway" {
  account_id   = "${local.name_prefix}-gateway-sa"
  display_name = "NVRS Gateway Service Account (${var.environment})"
  project      = var.project_id
}

# -----------------------------------------------------------------------------
# Static External IP
# -----------------------------------------------------------------------------
resource "google_compute_address" "gateway" {
  name    = "${local.name_prefix}-gateway-ip"
  project = var.project_id
  region  = var.region
}

# -----------------------------------------------------------------------------
# GCE Instance
# -----------------------------------------------------------------------------
resource "google_compute_instance" "gateway" {
  name         = "${local.name_prefix}-gateway"
  project      = var.project_id
  zone         = var.zone
  machine_type = var.machine_type

  tags = ["nvrs-gateway"]

  labels = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 20
      type  = "pd-ssd"
    }
  }

  network_interface {
    network    = var.network
    subnetwork = var.subnetwork

    access_config {
      nat_ip = google_compute_address.gateway.address
    }
  }

  service_account {
    email  = google_service_account.gateway.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    ssh-keys = "ubuntu:${var.ssh_public_key}"
  }

  metadata_startup_script = templatefile("${path.module}/templates/userdata.sh.tftpl", {
    wireguard_port    = var.wireguard_port
    wireguard_address = "10.100.0.1/16"
    wireguard_iface   = "wg0"
    db_host           = var.db_host
    db_name           = var.db_name
    db_user           = var.db_user
    db_password       = var.db_password
    project_name      = var.project_name
    environment       = var.environment
  })

  allow_stopping_for_update = true

  lifecycle {
    ignore_changes = [metadata_startup_script]
  }
}
