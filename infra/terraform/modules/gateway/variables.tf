##############################################################################
# NVIDIA Remote Stream (NVRS) - Gateway Module Variables
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
  description = "GCP zone for the gateway instance"
  type        = string
}

variable "machine_type" {
  description = "GCE machine type for the gateway"
  type        = string
  default     = "e2-small"
}

variable "network" {
  description = "Self link of the VPC network"
  type        = string
}

variable "subnetwork" {
  description = "Self link of the subnetwork"
  type        = string
}

variable "db_host" {
  description = "Cloud SQL database private IP address"
  type        = string
}

variable "db_name" {
  description = "Name of the database"
  type        = string
}

variable "db_user" {
  description = "Database username"
  type        = string
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "wireguard_port" {
  description = "UDP port for WireGuard VPN"
  type        = number
  default     = 51820
}

variable "ssh_public_key" {
  description = "SSH public key for access to the gateway instance"
  type        = string
}
