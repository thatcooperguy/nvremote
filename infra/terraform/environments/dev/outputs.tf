##############################################################################
# NVIDIA Remote Stream (NVRS) - Dev Environment Outputs
##############################################################################

output "gateway_public_ip" {
  description = "Public Elastic IP address of the dev gateway instance"
  value       = module.nvrs.gateway_public_ip
}

output "api_url" {
  description = "URL of the dev NVRS API endpoint (HTTPS)"
  value       = module.nvrs.api_url
}

output "db_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port) for the dev database"
  value       = module.nvrs.db_endpoint
}

output "wireguard_endpoint" {
  description = "WireGuard VPN connection endpoint (ip:port) for dev"
  value       = module.nvrs.wireguard_endpoint
}
