##############################################################################
# NVIDIA Remote Stream (NVRS) - Database Module Outputs
##############################################################################

output "instance_ip" {
  description = "Private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.main.private_ip_address
}

output "connection_name" {
  description = "Cloud SQL connection name (project:region:instance)"
  value       = google_sql_database_instance.main.connection_name
}

output "database_name" {
  description = "Name of the database"
  value       = google_sql_database.main.name
}

output "user_name" {
  description = "Database username"
  value       = google_sql_user.main.name
}

output "user_password" {
  description = "Database user password"
  value       = random_password.db_password.result
  sensitive   = true
}
