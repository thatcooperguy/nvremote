##############################################################################
# NVIDIA Remote Stream (NVRS) - Gateway Module Outputs
##############################################################################

output "instance_id" {
  description = "EC2 instance ID of the gateway"
  value       = aws_instance.gateway.id
}

output "public_ip" {
  description = "Elastic IP address of the gateway"
  value       = aws_eip.gateway.public_ip
}

output "private_ip" {
  description = "Private IP address of the gateway"
  value       = aws_instance.gateway.private_ip
}

output "iam_role_arn" {
  description = "ARN of the gateway IAM role"
  value       = aws_iam_role.gateway.arn
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group name for the gateway"
  value       = aws_cloudwatch_log_group.gateway.name
}
