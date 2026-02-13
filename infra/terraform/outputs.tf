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

output "db_connection_name" {
  description = "Cloud SQL connection name"
  value       = module.database.connection_name
}

output "db_ip" {
  description = "Cloud SQL private IP address"
  value       = module.database.instance_ip
  sensitive   = true
}

output "wireguard_endpoint" {
  description = "WireGuard VPN connection endpoint (ip:port)"
  value       = "${module.gateway.public_ip}:${var.wireguard_port}"
}

output "ssh_command" {
  description = "SSH command to connect to the gateway instance"
  value       = "ssh ubuntu@${module.gateway.public_ip}"
}
