##############################################################################
# NVIDIA Remote Stream (NVRS) - Networking Module Outputs
##############################################################################

output "network_self_link" {
  description = "Self link of the VPC network"
  value       = google_compute_network.main.self_link
}

output "network_id" {
  description = "ID of the VPC network"
  value       = google_compute_network.main.id
}

output "public_subnet_self_link" {
  description = "Self link of the public subnet"
  value       = google_compute_subnetwork.public.self_link
}
