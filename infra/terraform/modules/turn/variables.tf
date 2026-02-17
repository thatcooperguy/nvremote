##############################################################################
# NVRemote — TURN Relay Module Variables
##############################################################################

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "zone" {
  description = "GCP zone for the TURN server instance"
  type        = string
}

variable "machine_type" {
  description = "GCE machine type for the TURN server"
  type        = string
  default     = "e2-medium"
}

variable "network" {
  description = "Self link of the VPC network"
  type        = string
}

variable "subnetwork" {
  description = "Self link of the subnetwork"
  type        = string
}

variable "turn_port" {
  description = "Primary TURN/STUN listening port (UDP+TCP)"
  type        = number
  default     = 3478
}

variable "turn_tls_port" {
  description = "TURN over TLS listening port"
  type        = number
  default     = 5349
}

variable "turn_min_port" {
  description = "Minimum relay port for TURN allocations"
  type        = number
  default     = 49152
}

variable "turn_max_port" {
  description = "Maximum relay port for TURN allocations"
  type        = number
  default     = 65535
}

variable "turn_realm" {
  description = "TURN server realm (used in HMAC credential generation)"
  type        = string
  default     = "nvremote.com"
}

variable "turn_secret" {
  description = "Shared secret for HMAC-based TURN credential generation"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "SSH public key for access to the TURN server instance"
  type        = string
  default     = ""
}
