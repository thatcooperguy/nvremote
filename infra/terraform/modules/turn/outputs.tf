##############################################################################
# NVRemote — TURN Relay Module Outputs
##############################################################################

output "turn_external_ip" {
  description = "External IP address of the TURN server"
  value       = google_compute_address.turn.address
}

output "turn_url" {
  description = "TURN server URI for client configuration"
  value       = "turn:${google_compute_address.turn.address}:${var.turn_port}"
}

output "turns_url" {
  description = "TURN over TLS server URI for client configuration"
  value       = "turns:${google_compute_address.turn.address}:${var.turn_tls_port}"
}

output "stun_url" {
  description = "STUN server URI (coturn also serves STUN)"
  value       = "stun:${google_compute_address.turn.address}:${var.turn_port}"
}

output "turn_realm" {
  description = "TURN realm for credential generation"
  value       = var.turn_realm
}

output "instance_name" {
  description = "Name of the TURN server GCE instance"
  value       = google_compute_instance.turn.name
}
