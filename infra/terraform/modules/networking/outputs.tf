##############################################################################
# NVIDIA Remote Stream (NVRS) - Networking Module Outputs
##############################################################################

output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_id" {
  description = "ID of the public subnet (gateway)"
  value       = aws_subnet.public.id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets (database)"
  value       = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

output "gateway_sg_id" {
  description = "Security group ID for the WireGuard gateway"
  value       = aws_security_group.gateway.id
}

output "db_sg_id" {
  description = "Security group ID for the RDS database"
  value       = aws_security_group.database.id
}

output "api_sg_id" {
  description = "Security group ID for the API service"
  value       = aws_security_group.api.id
}

output "internet_gateway_id" {
  description = "ID of the Internet Gateway"
  value       = aws_internet_gateway.main.id
}

output "nat_gateway_id" {
  description = "ID of the NAT Gateway"
  value       = aws_nat_gateway.main.id
}
