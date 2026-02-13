##############################################################################
# NVIDIA Remote Stream (NVRS) - Gateway Module
# EC2 instance running WireGuard VPN and the NVRS gateway service.
##############################################################################

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Module = "gateway"
  }
}

# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------

# Look up the latest Ubuntu 22.04 LTS AMI from Canonical
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

data "aws_region" "current" {}

# -----------------------------------------------------------------------------
# IAM Role and Instance Profile (SSM + CloudWatch access)
# -----------------------------------------------------------------------------
resource "aws_iam_role" "gateway" {
  name = "${local.name_prefix}-gateway-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "gateway_ssm" {
  role       = aws_iam_role.gateway.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "gateway_cloudwatch" {
  role       = aws_iam_role.gateway.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# Allow the gateway to read the database secret from Secrets Manager
resource "aws_iam_role_policy" "gateway_secrets" {
  name = "${local.name_prefix}-gateway-secrets"
  role = aws_iam_role.gateway.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [var.db_secret_arn]
      }
    ]
  })
}

resource "aws_iam_instance_profile" "gateway" {
  name = "${local.name_prefix}-gateway-profile"
  role = aws_iam_role.gateway.name

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "gateway" {
  name              = "/nvrs/${var.environment}/gateway"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# -----------------------------------------------------------------------------
# EC2 Instance
# -----------------------------------------------------------------------------
resource "aws_instance" "gateway" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.ssh_key_name
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.gateway_sg_id, var.api_sg_id]
  iam_instance_profile   = aws_iam_instance_profile.gateway.name

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2
    http_put_response_hop_limit = 1
  }

  user_data = base64encode(templatefile("${path.module}/templates/userdata.sh.tftpl", {
    wireguard_port    = var.wireguard_port
    wireguard_address = "10.100.0.1/16"
    wireguard_iface   = "wg0"
    db_endpoint       = var.db_endpoint
    db_name           = var.db_name
    db_secret_arn     = var.db_secret_arn
    aws_region        = data.aws_region.current.name
    log_group         = aws_cloudwatch_log_group.gateway.name
    project_name      = var.project_name
    environment       = var.environment
  }))

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-gateway"
  })

  lifecycle {
    ignore_changes = [ami]
  }
}

# -----------------------------------------------------------------------------
# Elastic IP
# -----------------------------------------------------------------------------
resource "aws_eip" "gateway" {
  instance = aws_instance.gateway.id
  domain   = "vpc"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-gateway-eip"
  })
}
