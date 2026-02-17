#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# NVIDIA Remote Stream (NVRS) - Gateway Deployment Script
#
# One-command deployment: takes a bare AWS account and produces a running
# gateway + control plane.
#
# Usage:
#   ./deploy.sh [OPTIONS]
#
# Options:
#   --region REGION         AWS region (default: us-east-1)
#   --environment ENV       dev | staging | prod (default: dev)
#   --domain DOMAIN         Custom domain for API (default: none, IP-only)
#   --instance-type TYPE    EC2 instance type (default: t3.micro for dev)
#   --db-instance-class CLS RDS instance class (default: db.t3.micro for dev)
#   --destroy               Tear down all infrastructure
#   --skip-deploy           Run Terraform only, skip app deployment
#   --yes                   Skip confirmation prompts
#   --help                  Show this help message
##############################################################################

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly PROJECT_NAME="nvrs"
readonly TF_DIR="${SCRIPT_DIR}/terraform"
readonly DEPLOY_COMPOSE="${SCRIPT_DIR}/deploy-compose.yml"
readonly NGINX_CONF="${SCRIPT_DIR}/nginx.conf"
readonly SETUP_TLS="${SCRIPT_DIR}/setup-tls.sh"
readonly VERIFY_SCRIPT="${SCRIPT_DIR}/verify-deployment.sh"

# ---------------------------------------------------------------------------
# Color output helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}      $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $*" >&2; }
log_step()    { echo -e "\n${BOLD}${CYAN}==>${NC} ${BOLD}$*${NC}"; }
log_substep() { echo -e "    ${CYAN}->$NC $*"; }

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------
REGION="us-east-1"
ENVIRONMENT="dev"
DOMAIN=""
INSTANCE_TYPE=""
DB_INSTANCE_CLASS=""
DESTROY=false
SKIP_DEPLOY=false
AUTO_YES=false

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --region)
                REGION="$2"; shift 2 ;;
            --environment)
                ENVIRONMENT="$2"; shift 2 ;;
            --domain)
                DOMAIN="$2"; shift 2 ;;
            --instance-type)
                INSTANCE_TYPE="$2"; shift 2 ;;
            --db-instance-class)
                DB_INSTANCE_CLASS="$2"; shift 2 ;;
            --destroy)
                DESTROY=true; shift ;;
            --skip-deploy)
                SKIP_DEPLOY=true; shift ;;
            --yes|-y)
                AUTO_YES=true; shift ;;
            --help|-h)
                head -30 "$0" | tail -20
                exit 0 ;;
            *)
                log_error "Unknown option: $1"
                exit 1 ;;
        esac
    done

    # Apply environment-specific defaults
    if [[ -z "$INSTANCE_TYPE" ]]; then
        case "$ENVIRONMENT" in
            prod)    INSTANCE_TYPE="t3.small" ;;
            staging) INSTANCE_TYPE="t3.micro" ;;
            *)       INSTANCE_TYPE="t3.micro" ;;
        esac
    fi
    if [[ -z "$DB_INSTANCE_CLASS" ]]; then
        case "$ENVIRONMENT" in
            prod)    DB_INSTANCE_CLASS="db.t3.small" ;;
            staging) DB_INSTANCE_CLASS="db.t3.micro" ;;
            *)       DB_INSTANCE_CLASS="db.t3.micro" ;;
        esac
    fi
}

# ---------------------------------------------------------------------------
# Confirmation prompt
# ---------------------------------------------------------------------------
confirm() {
    local msg="$1"
    if [[ "$AUTO_YES" == "true" ]]; then
        return 0
    fi
    echo -en "${YELLOW}$msg [y/N]:${NC} "
    read -r answer
    case "$answer" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

# ---------------------------------------------------------------------------
# Cleanup handler
# ---------------------------------------------------------------------------
CLEANUP_ACTIONS=()

cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        echo ""
        log_error "Deployment failed with exit code $exit_code."
        log_error "Review the output above for details."
        echo ""
        log_info "To retry, run the same deploy command again (the script is idempotent)."
        log_info "To tear down, run: ./deploy.sh --environment $ENVIRONMENT --destroy"
    fi
    for action in "${CLEANUP_ACTIONS[@]:-}"; do
        eval "$action" 2>/dev/null || true
    done
}

trap cleanup EXIT

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
check_prerequisites() {
    log_step "Step 0/10: Checking prerequisites"
    local missing=0

    # AWS CLI
    if command -v aws &>/dev/null; then
        local aws_ver
        aws_ver=$(aws --version 2>&1 | head -1)
        log_success "AWS CLI: $aws_ver"
    else
        log_error "AWS CLI is not installed. Install from https://aws.amazon.com/cli/"
        missing=1
    fi

    # AWS credentials
    if aws sts get-caller-identity &>/dev/null; then
        local account_id caller_arn
        account_id=$(aws sts get-caller-identity --query 'Account' --output text)
        caller_arn=$(aws sts get-caller-identity --query 'Arn' --output text)
        log_success "AWS Account: $account_id ($caller_arn)"
    else
        log_error "AWS credentials not configured. Run 'aws configure' or set AWS_PROFILE."
        missing=1
    fi

    # Terraform
    if command -v terraform &>/dev/null; then
        local tf_ver
        tf_ver=$(terraform version -json 2>/dev/null | jq -r '.terraform_version' 2>/dev/null || terraform version | head -1)
        log_success "Terraform: $tf_ver"
    else
        log_error "Terraform is not installed. Install from https://developer.hashicorp.com/terraform/install"
        missing=1
    fi

    # Docker (optional for deploy -- the VM has its own Docker)
    if command -v docker &>/dev/null; then
        log_success "Docker: $(docker --version 2>/dev/null | head -1)"
    else
        log_warn "Docker not found locally. Image builds will happen on the gateway VM."
    fi

    # ssh-keygen
    if command -v ssh-keygen &>/dev/null; then
        log_success "ssh-keygen: available"
    else
        log_error "ssh-keygen is not available. Install OpenSSH."
        missing=1
    fi

    # jq
    if command -v jq &>/dev/null; then
        log_success "jq: $(jq --version 2>/dev/null)"
    else
        log_error "jq is not installed. Install from https://jqlang.github.io/jq/"
        missing=1
    fi

    if [[ $missing -ne 0 ]]; then
        log_error "Missing prerequisites. Install the tools above and retry."
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Step 1: SSH Key Pair
# ---------------------------------------------------------------------------
setup_ssh_key() {
    log_step "Step 1/10: Setting up SSH key pair"

    local key_name="${PROJECT_NAME}-${ENVIRONMENT}-key"
    local key_path="$HOME/.ssh/${PROJECT_NAME}-${ENVIRONMENT}.pem"

    # Check if key pair already exists in AWS
    if aws ec2 describe-key-pairs --key-names "$key_name" --region "$REGION" &>/dev/null; then
        log_success "EC2 key pair '$key_name' already exists in AWS."
        if [[ -f "$key_path" ]]; then
            log_success "Private key found at $key_path"
        else
            log_warn "Private key not found at $key_path."
            log_warn "If you lost the key, delete the AWS key pair and rerun:"
            log_warn "  aws ec2 delete-key-pair --key-name $key_name --region $REGION"
        fi
        SSH_KEY_NAME="$key_name"
        SSH_KEY_PATH="$key_path"
        return 0
    fi

    log_info "Generating new SSH key pair: $key_name"
    mkdir -p "$HOME/.ssh"

    # Generate the key locally
    if [[ -f "$key_path" ]]; then
        log_info "Local key file already exists at $key_path, reusing it."
    else
        ssh-keygen -t ed25519 -f "$key_path" -N "" -C "${PROJECT_NAME}-${ENVIRONMENT}" -q
        chmod 600 "$key_path"
        log_success "Private key saved to $key_path"
    fi

    # Import the public key to AWS
    aws ec2 import-key-pair \
        --key-name "$key_name" \
        --public-key-material "fileb://${key_path}.pub" \
        --region "$REGION" \
        --output text &>/dev/null

    log_success "EC2 key pair '$key_name' imported to AWS ($REGION)."

    SSH_KEY_NAME="$key_name"
    SSH_KEY_PATH="$key_path"
}

# ---------------------------------------------------------------------------
# Step 2: Terraform state backend (S3 for prod, local for dev)
# ---------------------------------------------------------------------------
setup_tf_backend() {
    log_step "Step 2/10: Configuring Terraform state backend"

    if [[ "$ENVIRONMENT" == "dev" ]]; then
        log_info "Using local Terraform state for dev environment."
        return 0
    fi

    local bucket_name="${PROJECT_NAME}-terraform-state-${ENVIRONMENT}"
    local dynamo_table="${PROJECT_NAME}-terraform-locks-${ENVIRONMENT}"

    # Create S3 bucket if it does not exist
    if aws s3api head-bucket --bucket "$bucket_name" --region "$REGION" 2>/dev/null; then
        log_success "S3 state bucket '$bucket_name' already exists."
    else
        log_info "Creating S3 bucket: $bucket_name"
        if [[ "$REGION" == "us-east-1" ]]; then
            aws s3api create-bucket \
                --bucket "$bucket_name" \
                --region "$REGION"
        else
            aws s3api create-bucket \
                --bucket "$bucket_name" \
                --region "$REGION" \
                --create-bucket-configuration LocationConstraint="$REGION"
        fi
        aws s3api put-bucket-versioning \
            --bucket "$bucket_name" \
            --versioning-configuration Status=Enabled
        aws s3api put-bucket-encryption \
            --bucket "$bucket_name" \
            --server-side-encryption-configuration \
            '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
        aws s3api put-public-access-block \
            --bucket "$bucket_name" \
            --public-access-block-configuration \
            "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
        log_success "Created S3 bucket: $bucket_name"
    fi

    # Create DynamoDB lock table if it does not exist
    if aws dynamodb describe-table --table-name "$dynamo_table" --region "$REGION" &>/dev/null; then
        log_success "DynamoDB lock table '$dynamo_table' already exists."
    else
        log_info "Creating DynamoDB table: $dynamo_table"
        aws dynamodb create-table \
            --table-name "$dynamo_table" \
            --attribute-definitions AttributeName=LockID,AttributeType=S \
            --key-schema AttributeName=LockID,KeyType=HASH \
            --billing-mode PAY_PER_REQUEST \
            --region "$REGION" \
            --output text &>/dev/null
        aws dynamodb wait table-exists --table-name "$dynamo_table" --region "$REGION"
        log_success "Created DynamoDB table: $dynamo_table"
    fi
}

# ---------------------------------------------------------------------------
# Step 3: Generate secrets
# ---------------------------------------------------------------------------
generate_secrets() {
    log_step "Step 3/10: Generating deployment secrets"

    # JWT secret
    if [[ -z "${JWT_SECRET:-}" ]]; then
        JWT_SECRET=$(openssl rand -hex 32)
        log_success "Generated JWT_SECRET"
    else
        log_info "Using JWT_SECRET from environment"
    fi

    # Gateway token
    if [[ -z "${GATEWAY_TOKEN:-}" ]]; then
        GATEWAY_TOKEN=$(openssl rand -hex 32)
        log_success "Generated GATEWAY_TOKEN"
    else
        log_info "Using GATEWAY_TOKEN from environment"
    fi

    # Google OAuth
    if [[ -z "${GOOGLE_CLIENT_ID:-}" ]]; then
        log_warn "GOOGLE_CLIENT_ID is not set."
        if [[ "$AUTO_YES" == "true" ]]; then
            GOOGLE_CLIENT_ID="placeholder-configure-later"
            GOOGLE_CLIENT_SECRET="placeholder-configure-later"
            log_warn "Using placeholders. Set GOOGLE_CLIENT_ID/SECRET environment variables and redeploy."
        else
            echo -en "  Enter GOOGLE_CLIENT_ID (or press Enter to skip): "
            read -r GOOGLE_CLIENT_ID
            if [[ -z "$GOOGLE_CLIENT_ID" ]]; then
                GOOGLE_CLIENT_ID="placeholder-configure-later"
                GOOGLE_CLIENT_SECRET="placeholder-configure-later"
                log_warn "Using placeholders. Google OAuth will not work until configured."
            else
                echo -en "  Enter GOOGLE_CLIENT_SECRET: "
                read -rs GOOGLE_CLIENT_SECRET
                echo ""
            fi
        fi
    else
        log_info "Using GOOGLE_CLIENT_ID from environment"
    fi

    # DB password for the compose-local postgres (dev single-node mode)
    if [[ -z "${DB_PASSWORD:-}" ]]; then
        DB_PASSWORD=$(openssl rand -hex 16)
        log_success "Generated DB_PASSWORD for local PostgreSQL"
    else
        log_info "Using DB_PASSWORD from environment"
    fi
}

# ---------------------------------------------------------------------------
# Step 4: Write terraform.tfvars
# ---------------------------------------------------------------------------
write_tfvars() {
    log_step "Step 4/10: Writing Terraform variables"

    local env_dir="${TF_DIR}/environments/${ENVIRONMENT}"
    mkdir -p "$env_dir"

    # Detect caller IP for SSH CIDR
    local my_ip
    my_ip=$(curl -s --connect-timeout 5 https://checkip.amazonaws.com 2>/dev/null || echo "")
    local ssh_cidr="0.0.0.0/0"
    if [[ -n "$my_ip" ]]; then
        ssh_cidr="${my_ip}/32"
        log_info "Detected your public IP: $my_ip"
    else
        log_warn "Could not detect public IP. SSH will be open to 0.0.0.0/0."
    fi

    local tfvars_file="${env_dir}/terraform.tfvars"
    cat > "$tfvars_file" <<EOF
# Auto-generated by deploy.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Environment: ${ENVIRONMENT}

region                = "${REGION}"
ssh_key_name          = "${SSH_KEY_NAME}"
allowed_ssh_cidrs     = ["${ssh_cidr}"]
domain_name           = "${DOMAIN}"
gateway_instance_type = "${INSTANCE_TYPE}"
db_instance_class     = "${DB_INSTANCE_CLASS}"
wireguard_port        = 51820
EOF

    log_success "Wrote $tfvars_file"
}

# ---------------------------------------------------------------------------
# Step 5: Run Terraform
# ---------------------------------------------------------------------------
run_terraform() {
    log_step "Step 5/10: Running Terraform"

    local env_dir="${TF_DIR}/environments/${ENVIRONMENT}"
    cd "$env_dir"

    # Initialize
    log_substep "terraform init"
    terraform init -input=false -upgrade 2>&1 | while IFS= read -r line; do
        echo "    $line"
    done
    log_success "Terraform initialized."

    # Plan
    log_substep "terraform plan"
    terraform plan -input=false -out=plan.tfplan 2>&1 | while IFS= read -r line; do
        echo "    $line"
    done
    log_success "Terraform plan complete."

    # Confirm
    if ! confirm "Apply the Terraform plan above?"; then
        log_info "Aborted by user."
        exit 0
    fi

    # Apply
    log_substep "terraform apply"
    terraform apply -input=false plan.tfplan 2>&1 | while IFS= read -r line; do
        echo "    $line"
    done
    log_success "Terraform apply complete."

    # Clean up plan file
    rm -f plan.tfplan

    cd "$SCRIPT_DIR"
}

# ---------------------------------------------------------------------------
# Step 6: Extract Terraform outputs
# ---------------------------------------------------------------------------
extract_outputs() {
    log_step "Step 6/10: Extracting Terraform outputs"

    local env_dir="${TF_DIR}/environments/${ENVIRONMENT}"
    cd "$env_dir"

    GATEWAY_IP=$(terraform output -raw gateway_public_ip 2>/dev/null || echo "")
    API_URL=$(terraform output -raw api_url 2>/dev/null || echo "")
    DB_ENDPOINT=$(terraform output -raw db_endpoint 2>/dev/null || echo "")
    WIREGUARD_ENDPOINT=$(terraform output -raw wireguard_endpoint 2>/dev/null || echo "")

    cd "$SCRIPT_DIR"

    if [[ -z "$GATEWAY_IP" ]]; then
        log_error "Failed to retrieve gateway_public_ip from Terraform outputs."
        exit 1
    fi

    log_success "Gateway IP:          $GATEWAY_IP"
    log_success "API URL:             $API_URL"
    log_success "DB Endpoint:         $DB_ENDPOINT"
    log_success "WireGuard Endpoint:  $WIREGUARD_ENDPOINT"
}

# ---------------------------------------------------------------------------
# Step 7: Wait for gateway to be reachable
# ---------------------------------------------------------------------------
wait_for_gateway() {
    log_step "Step 7/10: Waiting for gateway EC2 instance"

    local max_attempts=40
    local attempt=0
    local delay=15

    log_info "Waiting for SSH on ${GATEWAY_IP}:22 (timeout: $((max_attempts * delay))s)..."

    while [[ $attempt -lt $max_attempts ]]; do
        attempt=$((attempt + 1))
        if ssh -o StrictHostKeyChecking=no \
               -o ConnectTimeout=5 \
               -o BatchMode=yes \
               -i "$SSH_KEY_PATH" \
               "ubuntu@${GATEWAY_IP}" \
               "echo ready" &>/dev/null; then
            log_success "Gateway is reachable via SSH (attempt $attempt)."
            return 0
        fi
        printf "    Attempt %d/%d -- retrying in %ds...\r" "$attempt" "$max_attempts" "$delay"
        sleep "$delay"
    done

    log_error "Gateway did not become reachable within $((max_attempts * delay)) seconds."
    log_info "The instance may still be running user-data. Check CloudWatch logs:"
    log_info "  /nvrs/${ENVIRONMENT}/gateway"
    exit 1
}

# ---------------------------------------------------------------------------
# Helper: run a command on the gateway via SSH
# ---------------------------------------------------------------------------
gateway_ssh() {
    ssh -o StrictHostKeyChecking=no \
        -o ConnectTimeout=10 \
        -o ServerAliveInterval=15 \
        -o ServerAliveCountMax=3 \
        -i "$SSH_KEY_PATH" \
        "ubuntu@${GATEWAY_IP}" \
        "$@"
}

gateway_scp() {
    scp -o StrictHostKeyChecking=no \
        -o ConnectTimeout=10 \
        -i "$SSH_KEY_PATH" \
        "$@"
}

# ---------------------------------------------------------------------------
# Step 8: Deploy control plane to the gateway VM
# ---------------------------------------------------------------------------
deploy_control_plane() {
    log_step "Step 8/10: Deploying control plane to gateway"

    local remote_dir="/opt/nvrs"

    # Ensure remote directory exists
    gateway_ssh "sudo mkdir -p ${remote_dir} && sudo chown ubuntu:ubuntu ${remote_dir}"

    # Determine the callback URL for Google OAuth
    local callback_base
    if [[ -n "$DOMAIN" ]]; then
        callback_base="https://${DOMAIN}"
    else
        callback_base="https://${GATEWAY_IP}"
    fi

    # Determine the CORS origins
    local cors_origins="${callback_base}"

    # Write the .env file for production containers
    log_substep "Writing .env file"
    local env_content
    env_content=$(cat <<ENVEOF
# Auto-generated by deploy.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
NODE_ENV=production
PORT=3001
ENVIRONMENT=${ENVIRONMENT}

# Database (RDS)
DATABASE_URL=postgresql://nvrs:${DB_PASSWORD}@postgres:5432/nvrs?schema=public

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY_DAYS=7

# Google OAuth
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_CALLBACK_URL=${callback_base}/api/v1/auth/google/callback

# Gateway
GATEWAY_TOKEN=${GATEWAY_TOKEN}
WG_GATEWAY_ENDPOINT=${GATEWAY_IP}:51820

# CORS
CORS_ORIGIN=${cors_origins}

# DB Password (used by postgres container)
DB_PASSWORD=${DB_PASSWORD}
ENVEOF
)
    echo "$env_content" | gateway_ssh "cat > ${remote_dir}/.env && chmod 600 ${remote_dir}/.env"
    log_success ".env file written to gateway."

    # Copy docker-compose file
    log_substep "Copying docker-compose and nginx configuration"
    gateway_scp "$DEPLOY_COMPOSE" "ubuntu@${GATEWAY_IP}:${remote_dir}/docker-compose.yml"
    gateway_scp "$NGINX_CONF" "ubuntu@${GATEWAY_IP}:${remote_dir}/nginx.conf"
    gateway_scp "$SETUP_TLS" "ubuntu@${GATEWAY_IP}:${remote_dir}/setup-tls.sh"

    # Make TLS script executable and run it
    log_substep "Setting up TLS certificates"
    gateway_ssh "chmod +x ${remote_dir}/setup-tls.sh && sudo ${remote_dir}/setup-tls.sh '${DOMAIN}'"

    # Pull images and start services
    log_substep "Starting containers with docker compose"
    gateway_ssh "cd ${remote_dir} && sudo docker compose -f docker-compose.yml pull --ignore-pull-failures 2>&1 || true"
    gateway_ssh "cd ${remote_dir} && sudo docker compose -f docker-compose.yml up -d 2>&1"
    log_success "Control plane containers started."

    # Wait for API container to be healthy
    log_substep "Waiting for server-api container to be healthy"
    local health_attempts=0
    local health_max=30
    while [[ $health_attempts -lt $health_max ]]; do
        health_attempts=$((health_attempts + 1))
        local container_status
        container_status=$(gateway_ssh "sudo docker inspect --format='{{.State.Health.Status}}' nvrs-api 2>/dev/null" || echo "not_found")
        if [[ "$container_status" == "healthy" ]]; then
            log_success "server-api container is healthy."
            break
        fi
        if [[ $health_attempts -eq $health_max ]]; then
            log_warn "server-api did not become healthy within $((health_max * 10))s."
            log_info "Container status: $container_status"
            log_info "Check logs with: ssh -i $SSH_KEY_PATH ubuntu@$GATEWAY_IP 'sudo docker logs nvrs-api'"
            break
        fi
        printf "    Health check %d/%d (status: %s)...\r" "$health_attempts" "$health_max" "$container_status"
        sleep 10
    done
}

# ---------------------------------------------------------------------------
# Step 9: Run database migrations
# ---------------------------------------------------------------------------
run_migrations() {
    log_step "Step 9/10: Running database migrations"

    log_substep "Waiting for PostgreSQL to accept connections"
    local pg_attempts=0
    local pg_max=20
    while [[ $pg_attempts -lt $pg_max ]]; do
        pg_attempts=$((pg_attempts + 1))
        if gateway_ssh "sudo docker exec nvrs-postgres pg_isready -U nvrs -d nvrs" &>/dev/null; then
            log_success "PostgreSQL is ready."
            break
        fi
        if [[ $pg_attempts -eq $pg_max ]]; then
            log_error "PostgreSQL did not become ready."
            exit 1
        fi
        sleep 5
    done

    log_substep "Running Prisma migrations"
    gateway_ssh "sudo docker exec nvrs-api npx prisma migrate deploy 2>&1" | while IFS= read -r line; do
        echo "    $line"
    done
    log_success "Database migrations complete."
}

# ---------------------------------------------------------------------------
# Step 10: Verify deployment
# ---------------------------------------------------------------------------
verify_deployment() {
    log_step "Step 10/10: Verifying deployment"

    local api_base
    if [[ -n "$DOMAIN" ]]; then
        api_base="https://${DOMAIN}"
    else
        api_base="https://${GATEWAY_IP}"
    fi

    # Health check
    log_substep "Checking API health endpoint"
    local health_response
    health_response=$(curl -sk --connect-timeout 10 --max-time 15 "${api_base}/api/v1/health" 2>/dev/null || echo "FAILED")
    if echo "$health_response" | grep -qi "ok\|healthy\|status"; then
        log_success "API health check passed: $health_response"
    else
        log_warn "API health check returned: $health_response"
        log_info "The API may still be starting. Try again in a few moments."
    fi

    # WireGuard status
    log_substep "Checking WireGuard interface"
    local wg_status
    wg_status=$(gateway_ssh "sudo wg show 2>/dev/null" || echo "NOT RUNNING")
    if echo "$wg_status" | grep -q "interface"; then
        log_success "WireGuard interface is up."
    else
        log_warn "WireGuard status: $wg_status"
    fi

    # Container status
    log_substep "Checking container status"
    gateway_ssh "sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'" 2>/dev/null | while IFS= read -r line; do
        echo "    $line"
    done
}

# ---------------------------------------------------------------------------
# Print deployment summary
# ---------------------------------------------------------------------------
print_summary() {
    local api_base
    if [[ -n "$DOMAIN" ]]; then
        api_base="https://${DOMAIN}"
    else
        api_base="https://${GATEWAY_IP}"
    fi

    echo ""
    echo -e "${GREEN}${BOLD}============================================================${NC}"
    echo -e "${GREEN}${BOLD}  NVRS Deployment Complete${NC}"
    echo -e "${GREEN}${BOLD}============================================================${NC}"
    echo ""
    echo -e "  ${BOLD}Environment:${NC}         ${ENVIRONMENT}"
    echo -e "  ${BOLD}Region:${NC}              ${REGION}"
    echo -e "  ${BOLD}Gateway IP:${NC}          ${GATEWAY_IP}"
    echo -e "  ${BOLD}API URL:${NC}             ${api_base}"
    echo -e "  ${BOLD}Swagger Docs:${NC}        ${api_base}/api/docs"
    echo -e "  ${BOLD}WireGuard Endpoint:${NC}  ${WIREGUARD_ENDPOINT}"
    echo -e "  ${BOLD}DB Endpoint:${NC}         ${DB_ENDPOINT}"
    echo ""
    echo -e "  ${BOLD}SSH Access:${NC}"
    echo -e "    ssh -i ${SSH_KEY_PATH} ubuntu@${GATEWAY_IP}"
    echo ""
    echo -e "  ${BOLD}View Logs:${NC}"
    echo -e "    ssh -i ${SSH_KEY_PATH} ubuntu@${GATEWAY_IP} 'sudo docker compose -f /opt/nvrs/docker-compose.yml logs -f'"
    echo ""
    echo -e "  ${BOLD}Verify Deployment:${NC}"
    echo -e "    ./verify-deployment.sh --host ${GATEWAY_IP} --key ${SSH_KEY_PATH}"
    echo ""
    echo -e "  ${BOLD}Destroy Infrastructure:${NC}"
    echo -e "    ./deploy.sh --environment ${ENVIRONMENT} --region ${REGION} --destroy"
    echo ""
    echo -e "${GREEN}${BOLD}============================================================${NC}"
}

# ---------------------------------------------------------------------------
# Destroy infrastructure
# ---------------------------------------------------------------------------
destroy_infrastructure() {
    log_step "Destroying NVRS infrastructure (${ENVIRONMENT})"

    local env_dir="${TF_DIR}/environments/${ENVIRONMENT}"

    if [[ ! -d "$env_dir" ]]; then
        log_error "Environment directory not found: $env_dir"
        exit 1
    fi

    echo ""
    log_warn "This will PERMANENTLY DESTROY all ${ENVIRONMENT} infrastructure:"
    log_warn "  - EC2 gateway instance"
    log_warn "  - RDS PostgreSQL database"
    log_warn "  - VPC, subnets, security groups"
    log_warn "  - All data on these resources"
    echo ""

    if ! confirm "Are you sure you want to destroy the ${ENVIRONMENT} environment?"; then
        log_info "Destroy cancelled."
        exit 0
    fi

    cd "$env_dir"

    terraform init -input=false 2>&1 | while IFS= read -r line; do
        echo "    $line"
    done

    terraform destroy -auto-approve 2>&1 | while IFS= read -r line; do
        echo "    $line"
    done

    cd "$SCRIPT_DIR"

    log_success "Infrastructure destroyed."

    # Optionally remove the SSH key pair from AWS
    local key_name="${PROJECT_NAME}-${ENVIRONMENT}-key"
    if confirm "Remove EC2 key pair '${key_name}' from AWS?"; then
        aws ec2 delete-key-pair --key-name "$key_name" --region "$REGION" 2>/dev/null || true
        log_success "Removed key pair: $key_name"
    fi
}

# ===========================================================================
# Main
# ===========================================================================
main() {
    echo ""
    echo -e "${BOLD}${CYAN}NVIDIA Remote Stream (NVRS) - Deployment${NC}"
    echo -e "${CYAN}$(date -u +"%Y-%m-%d %H:%M:%S UTC")${NC}"
    echo ""

    parse_args "$@"

    log_info "Environment:    ${ENVIRONMENT}"
    log_info "Region:         ${REGION}"
    log_info "Domain:         ${DOMAIN:-<none -- IP-only mode>}"
    log_info "Instance Type:  ${INSTANCE_TYPE}"
    log_info "DB Class:       ${DB_INSTANCE_CLASS}"
    echo ""

    # Handle destroy mode
    if [[ "$DESTROY" == "true" ]]; then
        check_prerequisites
        destroy_infrastructure
        exit 0
    fi

    check_prerequisites          # Step 0
    setup_ssh_key                # Step 1
    setup_tf_backend             # Step 2
    generate_secrets             # Step 3
    write_tfvars                 # Step 4
    run_terraform                # Step 5
    extract_outputs              # Step 6

    if [[ "$SKIP_DEPLOY" == "true" ]]; then
        log_info "Skipping app deployment (--skip-deploy)."
        print_summary
        exit 0
    fi

    wait_for_gateway             # Step 7
    deploy_control_plane         # Step 8
    run_migrations               # Step 9
    verify_deployment            # Step 10

    print_summary
}

main "$@"
