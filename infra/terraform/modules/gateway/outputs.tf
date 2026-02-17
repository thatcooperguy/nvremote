##############################################################################
# NVIDIA Remote Stream (NVRS) - Gateway Module Outputs
##############################################################################

output "public_ip" {
  description = "Static public IP address of the gateway"
  value       = google_compute_address.gateway.address
}

output "instance_name" {
  description = "Name of the gateway GCE instance"
  value       = google_compute_instance.gateway.name
}

output "service_account_email" {
  description = "Email of the gateway service account"
  value       = google_service_account.gateway.email
}
