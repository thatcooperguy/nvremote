##############################################################################
# NVIDIA Remote Stream (NVRS) - Dev Environment Outputs
##############################################################################

output "gateway_public_ip" {
  description = "Public IP address of the dev gateway instance"
  value       = module.nvrs.gateway_public_ip
}

output "api_url" {
  description = "URL of the dev NVRS API endpoint (HTTPS)"
  value       = module.nvrs.api_url
}

output "db_connection_name" {
  description = "Cloud SQL connection name for the dev database"
  value       = module.nvrs.db_connection_name
}

output "db_ip" {
  description = "Cloud SQL private IP address for the dev database"
  value       = module.nvrs.db_ip
  sensitive   = true
}

output "wireguard_endpoint" {
  description = "WireGuard VPN connection endpoint (ip:port) for dev"
  value       = module.nvrs.wireguard_endpoint
}

output "ssh_command" {
  description = "SSH command to connect to the dev gateway"
  value       = module.nvrs.ssh_command
}
