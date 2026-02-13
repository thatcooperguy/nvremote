##############################################################################
# NVIDIA Remote Stream (NVRS) - Dev Environment Variables
##############################################################################

variable "region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "nvrs"
}

variable "gateway_instance_type" {
  description = "EC2 instance type for the WireGuard gateway (dev default: t3.micro)"
  type        = string
  default     = "t3.micro"
}

variable "db_instance_class" {
  description = "RDS instance class for PostgreSQL (dev default: db.t3.micro)"
  type        = string
  default     = "db.t3.micro"
}

variable "ssh_key_name" {
  description = "Name of the EC2 key pair for SSH access to the gateway"
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
