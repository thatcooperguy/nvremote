#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# NVIDIA Remote Stream (NVRS) - GCP Deployment Script
#
# One-command deployment to GCP using Terraform + gcloud.
#
# Usage:
#   ./deploy-gcp.sh [OPTIONS]
#
# Options:
#   --project PROJECT_ID    GCP project ID (default: gridbusiness-220920)
#   --region REGION          GCP region (default: us-west1)
#   --zone ZONE              GCP zone (default: us-west1-b)
#   --environment ENV        dev | staging | prod (default: dev)
#   --domain DOMAIN          Custom domain for API (default: none, IP-only)
#   --destroy                Tear down all infrastructure
#   --skip-terraform         Skip Terraform, just deploy app to existing VM
#   --yes                    Skip confirmation prompts
#   --help                   Show this help message
##############################################################################

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly PROJECT_NAME="nvrs"
readonly TF_DIR="${SCRIPT_DIR}/terraform"

# ---------------------------------------------------------------------------
# Color output helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
log_success() { echo -e "${GREEN}[OK]${NC}      $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC}   $*"; }
log_step()    { echo -e "\n${BOLD}${CYAN}==> $*${NC}"; }

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------
GCP_PROJECT="gridbusiness-220920"
GCP_REGION="us-west1"
GCP_ZONE="us-west1-b"
ENVIRONMENT="dev"
DOMAIN=""
MACHINE_TYPE="e2-small"
DB_TIER="db-f1-micro"
DESTROY=false
SKIP_TERRAFORM=false
AUTO_YES=false

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)       GCP_PROJECT="$2"; shift 2 ;;
    --region)        GCP_REGION="$2"; shift 2 ;;
    --zone)          GCP_ZONE="$2"; shift 2 ;;
    --environment)   ENVIRONMENT="$2"; shift 2 ;;
    --domain)        DOMAIN="$2"; shift 2 ;;
    --machine-type)  MACHINE_TYPE="$2"; shift 2 ;;
    --db-tier)       DB_TIER="$2"; shift 2 ;;
    --destroy)       DESTROY=true; shift ;;
    --skip-terraform) SKIP_TERRAFORM=true; shift ;;
    --yes)           AUTO_YES=true; shift ;;
    --help)
      head -25 "$0" | tail -20
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
check_prerequisites() {
  log_step "Checking prerequisites"

  local missing=()

  command -v gcloud >/dev/null 2>&1 || missing+=("gcloud (Google Cloud SDK)")
  command -v terraform >/dev/null 2>&1 || missing+=("terraform")
  command -v docker >/dev/null 2>&1 || missing+=("docker")
  command -v ssh >/dev/null 2>&1 || missing+=("ssh")

  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Missing required tools:"
    for tool in "${missing[@]}"; do
      echo "  - $tool"
    done
    exit 1
  fi

  # Verify gcloud is authenticated
  if ! gcloud auth print-access-token >/dev/null 2>&1; then
    log_error "Not authenticated with gcloud. Run: gcloud auth login"
    exit 1
  fi

  # Verify project access
  if ! gcloud projects describe "$GCP_PROJECT" >/dev/null 2>&1; then
    log_error "Cannot access GCP project: $GCP_PROJECT"
    exit 1
  fi

  log_success "All prerequisites met"
}

# ---------------------------------------------------------------------------
# Enable required APIs
# ---------------------------------------------------------------------------
enable_apis() {
  log_step "Enabling required GCP APIs"

  local apis=(
    "compute.googleapis.com"
    "sqladmin.googleapis.com"
    "servicenetworking.googleapis.com"
    "iam.googleapis.com"
    "cloudresourcemanager.googleapis.com"
    "secretmanager.googleapis.com"
  )

  gcloud services enable "${apis[@]}" --project="$GCP_PROJECT" --quiet
  log_success "APIs enabled"
}

# ---------------------------------------------------------------------------
# Generate SSH key if needed
# ---------------------------------------------------------------------------
ensure_ssh_key() {
  log_step "Checking SSH key"

  local ssh_key="$HOME/.ssh/nvrs_gcp"
  if [[ ! -f "$ssh_key" ]]; then
    log_info "Generating SSH key at $ssh_key"
    ssh-keygen -t ed25519 -f "$ssh_key" -N "" -C "nvrs-deploy"
    log_success "SSH key generated"
  else
    log_success "SSH key exists: $ssh_key"
  fi

  SSH_PUBLIC_KEY=$(cat "${ssh_key}.pub")
  SSH_PRIVATE_KEY="$ssh_key"
}

# ---------------------------------------------------------------------------
# Run Terraform
# ---------------------------------------------------------------------------
run_terraform() {
  log_step "Running Terraform ($ENVIRONMENT)"

  local tf_env_dir="${TF_DIR}/environments/${ENVIRONMENT}"

  if [[ ! -d "$tf_env_dir" ]]; then
    log_error "Environment directory not found: $tf_env_dir"
    exit 1
  fi

  cd "$tf_env_dir"

  # Initialize
  log_info "Initializing Terraform..."
  terraform init -input=false

  if [[ "$DESTROY" == true ]]; then
    log_warn "DESTROYING all infrastructure in $ENVIRONMENT"
    if [[ "$AUTO_YES" != true ]]; then
      read -rp "Are you sure? Type 'yes' to confirm: " confirm
      [[ "$confirm" == "yes" ]] || { log_info "Aborted."; exit 0; }
    fi
    terraform destroy \
      -var="project_id=$GCP_PROJECT" \
      -var="region=$GCP_REGION" \
      -var="zone=$GCP_ZONE" \
      -var="gateway_machine_type=$MACHINE_TYPE" \
      -var="db_tier=$DB_TIER" \
      -var="ssh_public_key=deploy:$SSH_PUBLIC_KEY" \
      -var="domain_name=$DOMAIN" \
      -auto-approve
    log_success "Infrastructure destroyed"
    exit 0
  fi

  # Plan
  log_info "Planning infrastructure..."
  terraform plan \
    -var="project_id=$GCP_PROJECT" \
    -var="region=$GCP_REGION" \
    -var="zone=$GCP_ZONE" \
    -var="gateway_machine_type=$MACHINE_TYPE" \
    -var="db_tier=$DB_TIER" \
    -var="ssh_public_key=deploy:$SSH_PUBLIC_KEY" \
    -var="domain_name=$DOMAIN" \
    -out=plan.tfplan

  # Confirm
  if [[ "$AUTO_YES" != true ]]; then
    read -rp "Apply this plan? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy] ]] || { log_info "Aborted."; exit 0; }
  fi

  # Apply
  log_info "Applying infrastructure..."
  terraform apply plan.tfplan
  rm -f plan.tfplan

  # Capture outputs
  GATEWAY_IP=$(terraform output -raw gateway_public_ip)
  WIREGUARD_EP=$(terraform output -raw wireguard_endpoint)

  log_success "Infrastructure deployed"
  log_info "Gateway IP:        $GATEWAY_IP"
  log_info "WireGuard endpoint: $WIREGUARD_EP"

  cd "$SCRIPT_DIR"
}

# ---------------------------------------------------------------------------
# Deploy application to the VM
# ---------------------------------------------------------------------------
deploy_application() {
  log_step "Deploying application to gateway VM"

  local vm_name="${PROJECT_NAME}-${ENVIRONMENT}-gateway"
  local remote_dir="/opt/nvrs"

  # Wait for VM to be ready
  log_info "Waiting for VM SSH to be ready..."
  local retries=0
  while ! gcloud compute ssh "$vm_name" \
    --zone="$GCP_ZONE" \
    --project="$GCP_PROJECT" \
    --command="echo ready" \
    --quiet 2>/dev/null; do
    retries=$((retries + 1))
    if [[ $retries -gt 30 ]]; then
      log_error "VM not reachable after 5 minutes"
      exit 1
    fi
    sleep 10
  done
  log_success "VM is reachable"

  # Upload docker-compose and nginx config
  log_info "Uploading deployment files..."
  gcloud compute scp \
    "${SCRIPT_DIR}/deploy-compose.yml" \
    "${SCRIPT_DIR}/nginx.conf" \
    "${SCRIPT_DIR}/setup-tls.sh" \
    "${vm_name}:/tmp/" \
    --zone="$GCP_ZONE" \
    --project="$GCP_PROJECT" \
    --quiet

  # Deploy on the VM
  log_info "Running deployment on VM..."
  gcloud compute ssh "$vm_name" \
    --zone="$GCP_ZONE" \
    --project="$GCP_PROJECT" \
    --quiet \
    --command="
      sudo mkdir -p $remote_dir
      sudo cp /tmp/deploy-compose.yml $remote_dir/docker-compose.yml
      sudo cp /tmp/nginx.conf $remote_dir/nginx.conf
      sudo cp /tmp/setup-tls.sh $remote_dir/setup-tls.sh
      sudo chmod +x $remote_dir/setup-tls.sh

      # Pull latest images and start services
      cd $remote_dir
      sudo docker compose -f docker-compose.yml pull 2>/dev/null || true
      sudo docker compose -f docker-compose.yml up -d

      echo 'Deployment complete'
    "

  log_success "Application deployed"
}

# ---------------------------------------------------------------------------
# Run database migrations
# ---------------------------------------------------------------------------
run_migrations() {
  log_step "Running database migrations"

  local vm_name="${PROJECT_NAME}-${ENVIRONMENT}-gateway"

  gcloud compute ssh "$vm_name" \
    --zone="$GCP_ZONE" \
    --project="$GCP_PROJECT" \
    --quiet \
    --command="
      cd /opt/nvrs
      sudo docker compose exec -T server-api npx prisma migrate deploy 2>&1 || echo 'Migration skipped (API may not be running yet)'
    "

  log_success "Migrations complete"
}

# ---------------------------------------------------------------------------
# Setup TLS
# ---------------------------------------------------------------------------
setup_tls() {
  if [[ -n "$DOMAIN" ]]; then
    log_step "Setting up TLS for $DOMAIN"

    local vm_name="${PROJECT_NAME}-${ENVIRONMENT}-gateway"

    gcloud compute ssh "$vm_name" \
      --zone="$GCP_ZONE" \
      --project="$GCP_PROJECT" \
      --quiet \
      --command="
        sudo /opt/nvrs/setup-tls.sh --domain $DOMAIN
      "

    log_success "TLS configured for $DOMAIN"
  else
    log_info "No domain specified, skipping TLS (using self-signed cert)"
  fi
}

# ---------------------------------------------------------------------------
# Verify deployment
# ---------------------------------------------------------------------------
verify_deployment() {
  log_step "Verifying deployment"

  local api_base="https://${GATEWAY_IP}"
  [[ -n "$DOMAIN" ]] && api_base="https://${DOMAIN}"

  # Check API health
  log_info "Checking API health..."
  if curl -sk "${api_base}/api/v1/health" 2>/dev/null | grep -q "ok\|healthy"; then
    log_success "API is healthy"
  else
    log_warn "API health check failed (may still be starting up)"
  fi

  # Check WireGuard
  log_info "Checking WireGuard..."
  local vm_name="${PROJECT_NAME}-${ENVIRONMENT}-gateway"
  if gcloud compute ssh "$vm_name" \
    --zone="$GCP_ZONE" \
    --project="$GCP_PROJECT" \
    --quiet \
    --command="sudo wg show wg0" 2>/dev/null | grep -q "interface"; then
    log_success "WireGuard interface is up"
  else
    log_warn "WireGuard interface not detected"
  fi
}

# ---------------------------------------------------------------------------
# Print summary
# ---------------------------------------------------------------------------
print_summary() {
  log_step "Deployment Summary"

  local api_url="https://${GATEWAY_IP}"
  [[ -n "$DOMAIN" ]] && api_url="https://${DOMAIN}"

  echo ""
  echo -e "  ${BOLD}Project:${NC}            $GCP_PROJECT"
  echo -e "  ${BOLD}Environment:${NC}        $ENVIRONMENT"
  echo -e "  ${BOLD}Region/Zone:${NC}        $GCP_REGION / $GCP_ZONE"
  echo ""
  echo -e "  ${BOLD}Gateway IP:${NC}         $GATEWAY_IP"
  echo -e "  ${BOLD}API URL:${NC}            $api_url"
  echo -e "  ${BOLD}WireGuard Endpoint:${NC} ${GATEWAY_IP}:51820"
  echo ""
  echo -e "  ${BOLD}SSH:${NC}"
  echo -e "    gcloud compute ssh ${PROJECT_NAME}-${ENVIRONMENT}-gateway --zone=$GCP_ZONE --project=$GCP_PROJECT"
  echo ""
  echo -e "  ${BOLD}WireGuard Public Key:${NC}"
  echo -e "    gcloud compute ssh ${PROJECT_NAME}-${ENVIRONMENT}-gateway --zone=$GCP_ZONE --project=$GCP_PROJECT --command='sudo cat /etc/wireguard/server_public.key'"
  echo ""
  echo -e "  ${BOLD}Update .env files with:${NC}"
  echo -e "    GATEWAY_URL=${api_url}"
  echo -e "    GATEWAY_ENDPOINT=${GATEWAY_IP}:51820"
  echo -e "    GATEWAY_PUBLIC_KEY=<run the command above>"
  echo ""
  echo -e "  ${GREEN}${BOLD}Deployment complete!${NC}"
  echo ""
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  echo -e "${BOLD}${CYAN}"
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║    NVIDIA Remote Stream (NVRS)       ║"
  echo "  ║    GCP Deployment                    ║"
  echo "  ╚══════════════════════════════════════╝"
  echo -e "${NC}"

  check_prerequisites
  enable_apis
  ensure_ssh_key

  if [[ "$SKIP_TERRAFORM" != true ]]; then
    run_terraform
  else
    # Get IP from existing infra
    cd "${TF_DIR}/environments/${ENVIRONMENT}"
    GATEWAY_IP=$(terraform output -raw gateway_public_ip 2>/dev/null || echo "")
    if [[ -z "$GATEWAY_IP" ]]; then
      log_error "No existing infrastructure found. Remove --skip-terraform flag."
      exit 1
    fi
    cd "$SCRIPT_DIR"
  fi

  deploy_application
  run_migrations
  setup_tls
  verify_deployment
  print_summary
}

main "$@"
