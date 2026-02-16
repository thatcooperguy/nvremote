##############################################################################
# NVIDIA Remote Stream (NVRS) - Root Variables
##############################################################################

variable "project_id" {
  description = "GCP project ID"
  type        = string
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

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "project_name" {
  description = "Project name used for resource naming and labeling"
  type        = string
  default     = "nvrs"
}

variable "gateway_machine_type" {
  description = "GCE machine type for the WireGuard gateway"
  type        = string
  default     = "e2-small"
}

variable "db_tier" {
  description = "Cloud SQL instance tier for PostgreSQL"
  type        = string
  default     = "db-f1-micro"
}

variable "domain_name" {
  description = "Optional custom domain name for the API endpoint"
  type        = string
  default     = ""
}

variable "ssh_public_key" {
  description = "SSH public key for access to the gateway instance"
  type        = string
}

variable "allowed_ssh_cidrs" {
  description = "List of CIDR blocks allowed to SSH into the gateway"
  type        = list(string)
  default     = []
}

variable "wireguard_port" {
  description = "UDP port for WireGuard VPN"
  type        = number
  default     = 51820
}

# ---------------------------------------------------------------------------
# TURN Relay
# ---------------------------------------------------------------------------

variable "turn_machine_type" {
  description = "GCE machine type for the TURN relay server"
  type        = string
  default     = "e2-medium"
}

variable "turn_secret" {
  description = "Shared secret for HMAC-based TURN credential generation"
  type        = string
  sensitive   = true
  default     = ""
}

variable "turn_realm" {
  description = "TURN server realm"
  type        = string
  default     = "nvremote.com"
}

variable "enable_turn" {
  description = "Whether to deploy the TURN relay server"
  type        = bool
  default     = false
}
