output "nameservers" {
  description = "Cloud DNS nameservers — point your registrar to these"
  value       = google_dns_managed_zone.gridstreamer.name_servers
}

output "zone_name" {
  description = "Cloud DNS zone name"
  value       = google_dns_managed_zone.gridstreamer.name
}

output "website_domain" {
  description = "Website custom domain"
  value       = var.domain_name
}

output "api_domain" {
  description = "API custom domain"
  value       = "api.${var.domain_name}"
}
