##############################################################################
# NVIDIA Remote Stream (NVRS) - Dev Environment Variables
##############################################################################

variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "gridbusiness-220920"
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-west1"
}

variable "zone" {
  description = "GCP zone for zonal resources"
  type        = string
  default     = "us-west1-b"
}

variable "project_name" {
  description = "Project name used for resource naming and labeling"
  type        = string
  default     = "nvrs"
}

variable "gateway_machine_type" {
  description = "GCE machine type for the WireGuard gateway (dev default: e2-small)"
  type        = string
  default     = "e2-small"
}

variable "db_tier" {
  description = "Cloud SQL instance tier for PostgreSQL (dev default: db-f1-micro)"
  type        = string
  default     = "db-f1-micro"
}

variable "ssh_public_key" {
  description = "SSH public key for access to the gateway instance"
  type        = string
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed to SSH into the gateway (dev default: open)"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "wireguard_port" {
  description = "UDP port for WireGuard VPN"
  type        = number
  default     = 51820
}

variable "domain_name" {
  description = "Optional custom domain name for the API endpoint (leave empty for IP-only)"
  type        = string
  default     = ""
}
