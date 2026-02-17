#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# NVIDIA Remote Stream (NVRS) - Deployment Verification Script
#
# Performs a comprehensive health check of a deployed NVRS environment.
#
# Usage:
#   ./verify-deployment.sh --host <GATEWAY_IP> --key <SSH_KEY_PATH>
#
# Options:
#   --host HOST    Gateway IP address or hostname (required)
#   --key PATH     Path to SSH private key (required)
#   --domain DOMAIN  Custom domain (if set, checks TLS for domain)
#   --user USER    SSH user (default: ubuntu)
#   --quiet        Only print failures and summary
#   --help         Show this help
##############################################################################

# ---------------------------------------------------------------------------
# Color output
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
HOST=""
SSH_KEY=""
DOMAIN=""
SSH_USER="ubuntu"
QUIET=false

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --host)    HOST="$2"; shift 2 ;;
        --key)     SSH_KEY="$2"; shift 2 ;;
        --domain)  DOMAIN="$2"; shift 2 ;;
        --user)    SSH_USER="$2"; shift 2 ;;
        --quiet)   QUIET=true; shift ;;
        --help|-h)
            head -18 "$0" | tail -14
            exit 0 ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1 ;;
    esac
done

if [[ -z "$HOST" || -z "$SSH_KEY" ]]; then
    echo "Usage: $0 --host <GATEWAY_IP> --key <SSH_KEY_PATH>" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log_check() {
    if [[ "$QUIET" != "true" ]]; then
        echo -e "  ${CYAN}[CHECK]${NC} $*"
    fi
}

pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo -e "  ${GREEN}[PASS]${NC}  $*"
}

fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo -e "  ${RED}[FAIL]${NC}  $*"
}

warn() {
    WARN_COUNT=$((WARN_COUNT + 1))
    echo -e "  ${YELLOW}[WARN]${NC}  $*"
}

gateway_ssh() {
    ssh -o StrictHostKeyChecking=no \
        -o ConnectTimeout=10 \
        -o BatchMode=yes \
        -i "$SSH_KEY" \
        "${SSH_USER}@${HOST}" \
        "$@" 2>/dev/null
}

API_BASE="https://${DOMAIN:-$HOST}"

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${CYAN}NVRS Deployment Verification${NC}"
echo -e "${CYAN}Host: ${HOST}  |  $(date -u +"%Y-%m-%d %H:%M:%S UTC")${NC}"
echo ""

# ===========================================================================
# 1. SSH Connectivity
# ===========================================================================
echo -e "${BOLD}1. SSH Connectivity${NC}"
log_check "Connecting to ${HOST} via SSH..."

if gateway_ssh "echo ok" &>/dev/null; then
    pass "SSH connection successful."
else
    fail "Cannot connect to ${HOST} via SSH."
    echo ""
    echo -e "${RED}Cannot proceed without SSH access. Verify:${NC}"
    echo "  - Gateway IP is correct"
    echo "  - SSH key path is correct"
    echo "  - Security group allows SSH from your IP"
    exit 1
fi

# ===========================================================================
# 2. Docker Services
# ===========================================================================
echo ""
echo -e "${BOLD}2. Docker Services${NC}"

log_check "Checking Docker daemon..."
if gateway_ssh "sudo docker info" &>/dev/null; then
    pass "Docker daemon is running."
else
    fail "Docker daemon is not running."
fi

log_check "Checking running containers..."
CONTAINERS=$(gateway_ssh "sudo docker ps --format '{{.Names}}:{{.Status}}'" 2>/dev/null || echo "")

for expected in nvrs-api nvrs-postgres nvrs-redis nvrs-nginx; do
    if echo "$CONTAINERS" | grep -q "^${expected}:"; then
        status=$(echo "$CONTAINERS" | grep "^${expected}:" | cut -d: -f2-)
        if echo "$status" | grep -qi "healthy\|Up"; then
            pass "Container ${expected}: ${status}"
        else
            warn "Container ${expected}: ${status}"
        fi
    else
        fail "Container ${expected} is not running."
    fi
done

# ===========================================================================
# 3. API Health Check
# ===========================================================================
echo ""
echo -e "${BOLD}3. API Health${NC}"

log_check "Checking API health endpoint (${API_BASE}/api/v1/health)..."
HEALTH_RESPONSE=$(curl -sk --connect-timeout 10 --max-time 15 "${API_BASE}/api/v1/health" 2>/dev/null || echo "TIMEOUT")

if echo "$HEALTH_RESPONSE" | grep -qi "ok\|healthy\|status"; then
    pass "API health endpoint responded: ${HEALTH_RESPONSE}"
else
    # Try directly through the container
    DIRECT_HEALTH=$(gateway_ssh "curl -s http://localhost:3001/api/v1/health" 2>/dev/null || echo "")
    if [[ -n "$DIRECT_HEALTH" ]]; then
        warn "API responds locally but not through Nginx. Response: ${DIRECT_HEALTH}"
    else
        fail "API health endpoint failed. Response: ${HEALTH_RESPONSE}"
    fi
fi

log_check "Checking Swagger docs availability..."
SWAGGER_STATUS=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 10 "${API_BASE}/api/docs" 2>/dev/null || echo "000")
if [[ "$SWAGGER_STATUS" == "200" || "$SWAGGER_STATUS" == "301" || "$SWAGGER_STATUS" == "302" ]]; then
    pass "Swagger docs accessible (HTTP ${SWAGGER_STATUS})."
else
    warn "Swagger docs returned HTTP ${SWAGGER_STATUS}."
fi

# ===========================================================================
# 4. Database Connectivity
# ===========================================================================
echo ""
echo -e "${BOLD}4. Database${NC}"

log_check "Checking PostgreSQL connectivity..."
if gateway_ssh "sudo docker exec nvrs-postgres pg_isready -U nvrs -d nvrs" &>/dev/null; then
    pass "PostgreSQL is accepting connections."
else
    fail "PostgreSQL is not accepting connections."
fi

log_check "Checking Prisma migration status..."
MIGRATION_STATUS=$(gateway_ssh "sudo docker exec nvrs-api npx prisma migrate status 2>&1" 2>/dev/null || echo "UNKNOWN")
if echo "$MIGRATION_STATUS" | grep -qi "applied\|up to date\|no pending"; then
    pass "Database migrations are up to date."
elif echo "$MIGRATION_STATUS" | grep -qi "pending"; then
    warn "There are pending database migrations."
else
    warn "Could not determine migration status."
fi

# ===========================================================================
# 5. Redis
# ===========================================================================
echo ""
echo -e "${BOLD}5. Redis${NC}"

log_check "Checking Redis connectivity..."
REDIS_PING=$(gateway_ssh "sudo docker exec nvrs-redis redis-cli ping" 2>/dev/null || echo "")
if [[ "$REDIS_PING" == "PONG" ]]; then
    pass "Redis is responding (PONG)."
else
    fail "Redis is not responding. Got: ${REDIS_PING}"
fi

# ===========================================================================
# 6. WireGuard
# ===========================================================================
echo ""
echo -e "${BOLD}6. WireGuard VPN${NC}"

log_check "Checking WireGuard interface..."
WG_STATUS=$(gateway_ssh "sudo wg show" 2>/dev/null || echo "")
if echo "$WG_STATUS" | grep -q "interface"; then
    pass "WireGuard interface is active."
    WG_PORT=$(echo "$WG_STATUS" | grep "listening port" | awk '{print $NF}')
    if [[ -n "$WG_PORT" ]]; then
        pass "WireGuard listening on port ${WG_PORT}."
    fi
else
    fail "WireGuard interface is not active."
fi

log_check "Checking IP forwarding..."
IP_FWD=$(gateway_ssh "cat /proc/sys/net/ipv4/ip_forward" 2>/dev/null || echo "0")
if [[ "$IP_FWD" == "1" ]]; then
    pass "IP forwarding is enabled."
else
    fail "IP forwarding is disabled."
fi

# ===========================================================================
# 7. TLS Certificate
# ===========================================================================
echo ""
echo -e "${BOLD}7. TLS Certificate${NC}"

CHECK_HOST="${DOMAIN:-$HOST}"
log_check "Checking TLS certificate for ${CHECK_HOST}..."

CERT_INFO=$(echo | openssl s_client -connect "${HOST}:443" -servername "$CHECK_HOST" 2>/dev/null | openssl x509 -noout -dates -subject -issuer 2>/dev/null || echo "")

if [[ -n "$CERT_INFO" ]]; then
    CERT_SUBJECT=$(echo "$CERT_INFO" | grep "subject=" | head -1)
    CERT_ISSUER=$(echo "$CERT_INFO" | grep "issuer=" | head -1)
    CERT_NOT_AFTER=$(echo "$CERT_INFO" | grep "notAfter=" | sed 's/notAfter=//')

    if echo "$CERT_ISSUER" | grep -qi "let.s encrypt\|letsencrypt\|R3\|E1"; then
        pass "TLS: Valid Let's Encrypt certificate."
    else
        warn "TLS: Self-signed or unknown CA certificate."
    fi
    pass "TLS: Certificate expires: ${CERT_NOT_AFTER}"

    # Check if cert is valid for at least 7 days
    if echo | openssl s_client -connect "${HOST}:443" -servername "$CHECK_HOST" 2>/dev/null | openssl x509 -noout -checkend 604800 2>/dev/null; then
        pass "TLS: Certificate valid for at least 7 more days."
    else
        warn "TLS: Certificate expires within 7 days. Renew soon."
    fi
else
    fail "TLS: Could not retrieve certificate from ${HOST}:443."
fi

# ===========================================================================
# 8. Disk and Memory
# ===========================================================================
echo ""
echo -e "${BOLD}8. System Resources${NC}"

log_check "Checking disk usage..."
DISK_USAGE=$(gateway_ssh "df -h / | tail -1 | awk '{print \$5}'" 2>/dev/null || echo "")
if [[ -n "$DISK_USAGE" ]]; then
    DISK_PCT=${DISK_USAGE%\%}
    if [[ "$DISK_PCT" -lt 80 ]]; then
        pass "Disk usage: ${DISK_USAGE} (healthy)."
    elif [[ "$DISK_PCT" -lt 90 ]]; then
        warn "Disk usage: ${DISK_USAGE} (getting full)."
    else
        fail "Disk usage: ${DISK_USAGE} (critically full)."
    fi
fi

log_check "Checking memory usage..."
MEM_INFO=$(gateway_ssh "free -m | grep Mem | awk '{printf \"%d/%dMB (%.0f%%)\", \$3, \$2, \$3/\$2*100}'" 2>/dev/null || echo "")
if [[ -n "$MEM_INFO" ]]; then
    pass "Memory usage: ${MEM_INFO}"
fi

# ===========================================================================
# Summary
# ===========================================================================
echo ""
echo -e "${BOLD}============================================================${NC}"

TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))

if [[ $FAIL_COUNT -eq 0 && $WARN_COUNT -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}  ALL CHECKS PASSED: ${PASS_COUNT}/${TOTAL}${NC}"
elif [[ $FAIL_COUNT -eq 0 ]]; then
    echo -e "${YELLOW}${BOLD}  PASSED WITH WARNINGS: ${PASS_COUNT} passed, ${WARN_COUNT} warnings${NC}"
else
    echo -e "${RED}${BOLD}  FAILURES DETECTED: ${PASS_COUNT} passed, ${FAIL_COUNT} failed, ${WARN_COUNT} warnings${NC}"
fi

echo -e "${BOLD}============================================================${NC}"
echo ""

# Exit with non-zero if there are failures
if [[ $FAIL_COUNT -gt 0 ]]; then
    exit 1
fi
exit 0
