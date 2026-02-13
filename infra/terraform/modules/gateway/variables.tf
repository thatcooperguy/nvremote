##############################################################################
# NVIDIA Remote Stream (NVRS) - Gateway Module Variables
##############################################################################

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for the gateway"
  type        = string
  default     = "t3.micro"
}

variable "ssh_key_name" {
  description = "Name of the EC2 key pair for SSH access"
  type        = string
}

variable "wireguard_port" {
  description = "UDP port for WireGuard VPN"
  type        = number
  default     = 51820
}

variable "subnet_id" {
  description = "ID of the public subnet for the gateway instance"
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC"
  type        = string
}

variable "gateway_sg_id" {
  description = "Security group ID for the gateway"
  type        = string
}

variable "api_sg_id" {
  description = "Security group ID for the API"
  type        = string
}

variable "db_endpoint" {
  description = "RDS database endpoint (host:port)"
  type        = string
}

variable "db_name" {
  description = "Name of the database"
  type        = string
}

variable "db_secret_arn" {
  description = "ARN of the Secrets Manager secret containing DB credentials"
  type        = string
}

variable "log_retention_days" {
  description = "Number of days to retain CloudWatch logs"
  type        = number
  default     = 30
}
