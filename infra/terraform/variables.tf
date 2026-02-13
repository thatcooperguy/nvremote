##############################################################################
# NVIDIA Remote Stream (NVRS) - Root Variables
##############################################################################

variable "region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
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
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "nvrs"
}

variable "gateway_instance_type" {
  description = "EC2 instance type for the WireGuard gateway"
  type        = string
  default     = "t3.micro"
}

variable "db_instance_class" {
  description = "RDS instance class for PostgreSQL"
  type        = string
  default     = "db.t3.micro"
}

variable "domain_name" {
  description = "Optional custom domain name for the API endpoint"
  type        = string
  default     = ""
}

variable "ssh_key_name" {
  description = "Name of the EC2 key pair for SSH access to the gateway"
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
