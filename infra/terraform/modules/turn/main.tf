##############################################################################
# NVRemote — TURN Relay Module
# GCE instance running coturn for TURN/STUN relay fallback.
#
# Uses HMAC-based ephemeral credentials (RFC 5766 long-term auth with
# shared secret) so the API can generate time-limited TURN credentials
# without coturn needing database access.
##############################################################################

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

# -----------------------------------------------------------------------------
# Service Account
# -----------------------------------------------------------------------------
resource "google_service_account" "turn" {
  account_id   = "${local.name_prefix}-turn-sa"
  display_name = "NVRemote TURN Server SA (${var.environment})"
  project      = var.project_id
}

# -----------------------------------------------------------------------------
# Static External IP
# -----------------------------------------------------------------------------
resource "google_compute_address" "turn" {
  name    = "${local.name_prefix}-turn-ip"
  project = var.project_id
  region  = var.region
}

# -----------------------------------------------------------------------------
# Firewall Rules
# -----------------------------------------------------------------------------

# Allow TURN/STUN UDP traffic (primary port + relay port range)
resource "google_compute_firewall" "turn_udp" {
  name    = "${local.name_prefix}-allow-turn-udp"
  project = var.project_id
  network = var.network

  direction = "INGRESS"
  priority  = 1000

  allow {
    protocol = "udp"
    ports    = ["${var.turn_port}", "${var.turn_min_port}-${var.turn_max_port}"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["nvremote-turn"]
}

# Allow TURN TCP traffic (primary port + TLS port)
resource "google_compute_firewall" "turn_tcp" {
  name    = "${local.name_prefix}-allow-turn-tcp"
  project = var.project_id
  network = var.network

  direction = "INGRESS"
  priority  = 1000

  allow {
    protocol = "tcp"
    ports    = ["${var.turn_port}", "${var.turn_tls_port}"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["nvremote-turn"]
}

# -----------------------------------------------------------------------------
# GCE Instance
# -----------------------------------------------------------------------------
resource "google_compute_instance" "turn" {
  name         = "${local.name_prefix}-turn"
  project      = var.project_id
  zone         = var.zone
  machine_type = var.machine_type

  tags = ["nvremote-turn"]

  labels = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
    role        = "turn-relay"
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
      nat_ip = google_compute_address.turn.address
    }
  }

  service_account {
    email  = google_service_account.turn.email
    scopes = ["cloud-platform"]
  }

  metadata = var.ssh_public_key != "" ? {
    ssh-keys = "ubuntu:${var.ssh_public_key}"
  } : {}

  metadata_startup_script = templatefile("${path.module}/templates/userdata.sh.tftpl", {
    turn_port     = var.turn_port
    turn_tls_port = var.turn_tls_port
    turn_min_port = var.turn_min_port
    turn_max_port = var.turn_max_port
    turn_realm    = var.turn_realm
    turn_secret   = var.turn_secret
    external_ip   = google_compute_address.turn.address
  })

  allow_stopping_for_update = true

  lifecycle {
    ignore_changes = [metadata_startup_script]
  }
}
