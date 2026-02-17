#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# NVIDIA Remote Stream (NVRS) - TLS Certificate Setup
#
# Usage:
#   sudo ./setup-tls.sh [DOMAIN]
#
# If DOMAIN is provided and non-empty, uses certbot for Let's Encrypt.
# If DOMAIN is empty or not provided, generates a self-signed certificate.
#
# Certificates are stored in /opt/nvrs/certs/ and symlinked/mounted
# into the Nginx container.
##############################################################################

DOMAIN="${1:-}"
CERTS_DIR="/opt/nvrs/certs"
CERTBOT_WEBROOT="/var/www/certbot"

log_info()    { echo "[INFO]  $*"; }
log_success() { echo "[OK]    $*"; }
log_warn()    { echo "[WARN]  $*"; }
log_error()   { echo "[ERROR] $*" >&2; }

mkdir -p "$CERTS_DIR"
chmod 700 "$CERTS_DIR"

# ---------------------------------------------------------------------------
# Check if valid certificates already exist
# ---------------------------------------------------------------------------
certs_valid() {
    if [[ -f "${CERTS_DIR}/fullchain.pem" && -f "${CERTS_DIR}/privkey.pem" ]]; then
        # Check if cert expires in more than 7 days
        if openssl x509 -in "${CERTS_DIR}/fullchain.pem" -noout -checkend 604800 2>/dev/null; then
            return 0
        fi
    fi
    return 1
}

if certs_valid; then
    log_info "Valid TLS certificates already exist in ${CERTS_DIR}."
    log_info "Skipping certificate generation. Delete certs to force regeneration."
    exit 0
fi

# ---------------------------------------------------------------------------
# Let's Encrypt (if domain is provided)
# ---------------------------------------------------------------------------
if [[ -n "$DOMAIN" && "$DOMAIN" != "placeholder-configure-later" ]]; then
    log_info "Setting up Let's Encrypt certificate for domain: ${DOMAIN}"

    # Install certbot if not present
    if ! command -v certbot &>/dev/null; then
        log_info "Installing certbot..."
        apt-get update -y -qq
        apt-get install -y -qq certbot
    fi

    mkdir -p "$CERTBOT_WEBROOT"

    # Attempt to obtain certificate
    log_info "Requesting certificate from Let's Encrypt..."
    if certbot certonly \
        --webroot \
        --webroot-path "$CERTBOT_WEBROOT" \
        --domain "$DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "admin@${DOMAIN}" \
        --no-eff-email \
        --keep-until-expiring \
        --quiet; then

        # Copy certificates to our certs directory
        local le_dir="/etc/letsencrypt/live/${DOMAIN}"
        cp "${le_dir}/fullchain.pem" "${CERTS_DIR}/fullchain.pem"
        cp "${le_dir}/privkey.pem" "${CERTS_DIR}/privkey.pem"
        chmod 600 "${CERTS_DIR}/privkey.pem"
        chmod 644 "${CERTS_DIR}/fullchain.pem"

        log_success "Let's Encrypt certificate installed for ${DOMAIN}."

        # Set up auto-renewal cron
        setup_auto_renewal "$DOMAIN"
        exit 0
    else
        log_warn "Let's Encrypt certificate request failed."
        log_warn "This can happen if the domain does not point to this server yet."
        log_warn "Falling back to self-signed certificate."
    fi
fi

# ---------------------------------------------------------------------------
# Self-signed certificate (fallback or no domain)
# ---------------------------------------------------------------------------
generate_self_signed() {
    log_info "Generating self-signed TLS certificate..."

    local cn="${DOMAIN:-nvrs-gateway}"
    local san="DNS:${cn},DNS:localhost,IP:127.0.0.1"

    # If we have a public IP, add it to the SAN
    local public_ip
    public_ip=$(curl -s --connect-timeout 5 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")
    if [[ -n "$public_ip" ]]; then
        san="${san},IP:${public_ip}"
    fi

    openssl req -x509 -nodes \
        -days 365 \
        -newkey rsa:2048 \
        -keyout "${CERTS_DIR}/privkey.pem" \
        -out "${CERTS_DIR}/fullchain.pem" \
        -subj "/C=US/ST=CA/L=Santa Clara/O=NVRS/OU=Gateway/CN=${cn}" \
        -addext "subjectAltName=${san}" \
        2>/dev/null

    chmod 600 "${CERTS_DIR}/privkey.pem"
    chmod 644 "${CERTS_DIR}/fullchain.pem"

    log_success "Self-signed certificate generated (valid for 365 days)."
    log_warn "Browsers will show a security warning for self-signed certificates."
    log_info "To use a real certificate, re-run with a domain: ./setup-tls.sh yourdomain.com"
}

# ---------------------------------------------------------------------------
# Auto-renewal cron for Let's Encrypt
# ---------------------------------------------------------------------------
setup_auto_renewal() {
    local domain="$1"
    local cron_script="/etc/cron.d/nvrs-certbot-renew"

    cat > "$cron_script" <<CRONEOF
# NVRS - Auto-renew Let's Encrypt certificate
# Runs twice daily as recommended by Let's Encrypt
0 0,12 * * * root certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/${domain}/fullchain.pem ${CERTS_DIR}/fullchain.pem && cp /etc/letsencrypt/live/${domain}/privkey.pem ${CERTS_DIR}/privkey.pem && docker exec nvrs-nginx nginx -s reload" >> /var/log/nvrs-certbot-renew.log 2>&1
CRONEOF

    chmod 644 "$cron_script"
    log_success "Auto-renewal cron job installed at ${cron_script}."
}

generate_self_signed
