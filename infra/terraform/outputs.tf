##############################################################################
# NVIDIA Remote Stream (NVRS) - Root Outputs
##############################################################################

output "gateway_public_ip" {
  description = "Public IP address of the WireGuard gateway"
  value       = module.gateway.public_ip
}

output "api_url" {
  description = "URL for the NVRS API endpoint"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${module.gateway.public_ip}:443"
}

output "db_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)"
  value       = module.database.db_endpoint
}

output "wireguard_endpoint" {
  description = "WireGuard VPN connection endpoint (ip:port)"
  value       = "${module.gateway.public_ip}:${var.wireguard_port}"
}
