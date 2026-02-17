#!/usr/bin/env bash
#
# NVRemote - Gateway VM Setup Script
#
# This script prepares a cloud VM to run as an NVRemote gateway node.
# It installs WireGuard, generates keys, configures the overlay network,
# sets up iptables rules, and installs the gateway service.
#
# Usage: sudo ./setup.sh [OPTIONS]
#   --public-ip IP       Public IP of this gateway VM (auto-detected if omitted)
#   --subnet CIDR        Tunnel subnet (default: 10.100.0.0/16)
#   --gateway-ip IP      Gateway address within the tunnel (default: 10.100.0.1/16)
#   --wg-port PORT       WireGuard listen port (default: 51820)
#   --api-port PORT      Gateway API listen port (default: 8080)

set -euo pipefail

# -------------------------------------------------------------------
# Default configuration
# -------------------------------------------------------------------
WG_INTERFACE="wg0"
WG_PORT="51820"
API_PORT="8080"
TUNNEL_SUBNET="10.100.0.0/16"
GATEWAY_TUNNEL_IP="10.100.0.1/16"
PUBLIC_IP=""
SERVICE_USER="nvremote"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/nvremote-gateway"
WG_CONFIG_DIR="/etc/wireguard"

# -------------------------------------------------------------------
# Parse arguments
# -------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --public-ip)
            PUBLIC_IP="$2"
            shift 2
            ;;
        --subnet)
            TUNNEL_SUBNET="$2"
            shift 2
            ;;
        --gateway-ip)
            GATEWAY_TUNNEL_IP="$2"
            shift 2
            ;;
        --wg-port)
            WG_PORT="$2"
            shift 2
            ;;
        --api-port)
            API_PORT="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# -------------------------------------------------------------------
# Preflight checks
# -------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    echo "Error: This script must be run as root."
    exit 1
fi

# Auto-detect public IP if not provided.
if [[ -z "$PUBLIC_IP" ]]; then
    echo "Auto-detecting public IP..."
    PUBLIC_IP=$(curl -s --max-time 5 https://ifconfig.me || curl -s --max-time 5 https://api.ipify.org || true)
    if [[ -z "$PUBLIC_IP" ]]; then
        echo "Error: Could not detect public IP. Provide it with --public-ip."
        exit 1
    fi
    echo "Detected public IP: $PUBLIC_IP"
fi

echo "============================================="
echo " NVRemote - Gateway Setup"
echo "============================================="
echo " Public IP:       $PUBLIC_IP"
echo " WireGuard Port:  $WG_PORT"
echo " API Port:        $API_PORT"
echo " Tunnel Subnet:   $TUNNEL_SUBNET"
echo " Gateway IP:      $GATEWAY_TUNNEL_IP"
echo "============================================="
echo ""

# -------------------------------------------------------------------
# Step 1: Install WireGuard
# -------------------------------------------------------------------
echo "[1/7] Installing WireGuard..."

if command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq wireguard wireguard-tools
elif command -v dnf &>/dev/null; then
    dnf install -y -q wireguard-tools
elif command -v yum &>/dev/null; then
    yum install -y -q epel-release
    yum install -y -q wireguard-tools
elif command -v apk &>/dev/null; then
    apk add --quiet wireguard-tools
else
    echo "Error: Unsupported package manager. Install wireguard-tools manually."
    exit 1
fi

echo "  WireGuard installed."

# -------------------------------------------------------------------
# Step 2: Generate server keypair
# -------------------------------------------------------------------
echo "[2/7] Generating WireGuard server keypair..."

mkdir -p "$WG_CONFIG_DIR"
chmod 700 "$WG_CONFIG_DIR"

PRIVATE_KEY_FILE="$WG_CONFIG_DIR/${WG_INTERFACE}_private.key"
PUBLIC_KEY_FILE="$WG_CONFIG_DIR/${WG_INTERFACE}_public.key"

if [[ -f "$PRIVATE_KEY_FILE" ]]; then
    echo "  Keypair already exists, skipping generation."
else
    wg genkey | tee "$PRIVATE_KEY_FILE" | wg pubkey > "$PUBLIC_KEY_FILE"
    chmod 600 "$PRIVATE_KEY_FILE"
    chmod 644 "$PUBLIC_KEY_FILE"
    echo "  Keypair generated."
fi

SERVER_PRIVATE_KEY=$(cat "$PRIVATE_KEY_FILE")
SERVER_PUBLIC_KEY=$(cat "$PUBLIC_KEY_FILE")
echo "  Server public key: $SERVER_PUBLIC_KEY"

# -------------------------------------------------------------------
# Step 3: Create WireGuard interface configuration
# -------------------------------------------------------------------
echo "[3/7] Creating WireGuard interface configuration..."

WG_CONF_FILE="$WG_CONFIG_DIR/${WG_INTERFACE}.conf"

cat > "$WG_CONF_FILE" <<EOF
[Interface]
Address = $GATEWAY_TUNNEL_IP
ListenPort = $WG_PORT
PrivateKey = $SERVER_PRIVATE_KEY
SaveConfig = false

# Peers are managed dynamically by the gateway service.
# Do not add static peer entries here.

# NAT and forwarding rules applied via PostUp/PostDown.
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
EOF

chmod 600 "$WG_CONF_FILE"
echo "  WireGuard config written to $WG_CONF_FILE"

# -------------------------------------------------------------------
# Step 4: Enable IP forwarding
# -------------------------------------------------------------------
echo "[4/7] Enabling IP forwarding..."

sysctl -w net.ipv4.ip_forward=1 >/dev/null

# Make it persistent across reboots.
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

echo "  IP forwarding enabled."

# -------------------------------------------------------------------
# Step 5: Configure iptables for NAT and inter-peer forwarding
# -------------------------------------------------------------------
echo "[5/7] Configuring iptables rules..."

# Allow WireGuard UDP traffic.
iptables -A INPUT -p udp --dport "$WG_PORT" -j ACCEPT 2>/dev/null || true

# Allow API port traffic.
iptables -A INPUT -p tcp --dport "$API_PORT" -j ACCEPT 2>/dev/null || true

# Allow forwarding between WireGuard peers.
iptables -A FORWARD -i "$WG_INTERFACE" -o "$WG_INTERFACE" -j ACCEPT 2>/dev/null || true

echo "  iptables rules configured."

# -------------------------------------------------------------------
# Step 6: Start WireGuard interface
# -------------------------------------------------------------------
echo "[6/7] Starting WireGuard interface..."

# Bring down the interface first if it exists.
wg-quick down "$WG_INTERFACE" 2>/dev/null || true

wg-quick up "$WG_INTERFACE"

# Enable WireGuard to start on boot.
if command -v systemctl &>/dev/null; then
    systemctl enable "wg-quick@${WG_INTERFACE}" 2>/dev/null || true
fi

echo "  WireGuard interface $WG_INTERFACE is up."
wg show "$WG_INTERFACE"

# -------------------------------------------------------------------
# Step 7: Install and start gateway service
# -------------------------------------------------------------------
echo "[7/7] Installing gateway service..."

# Create service user if it does not exist.
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
    echo "  Created service user: $SERVICE_USER"
fi

# Create config directory.
mkdir -p "$CONFIG_DIR"

# Write default gateway config if none exists.
if [[ ! -f "$CONFIG_DIR/config.yaml" ]]; then
    cat > "$CONFIG_DIR/config.yaml" <<CFGEOF
listen_addr: ":${API_PORT}"
wireguard_interface: "${WG_INTERFACE}"
wireguard_port: ${WG_PORT}
tunnel_subnet: "${TUNNEL_SUBNET}"
public_ip: "${PUBLIC_IP}"
# Set these values after registering the gateway with the control plane:
# control_plane_url: "https://api.nvremote.example.com"
# gateway_token: "your-gateway-token"
# gateway_id: "your-gateway-id"
CFGEOF
    echo "  Default config written to $CONFIG_DIR/config.yaml"
fi

chown -R "$SERVICE_USER":"$SERVICE_USER" "$CONFIG_DIR"

# Install systemd service file if systemd is available.
if command -v systemctl &>/dev/null; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "$SCRIPT_DIR/nvremote-gateway.service" ]]; then
        cp "$SCRIPT_DIR/nvremote-gateway.service" /etc/systemd/system/nvremote-gateway.service
        systemctl daemon-reload
        systemctl enable nvremote-gateway
        systemctl start nvremote-gateway
        echo "  Gateway service installed and started."
    else
        echo "  Warning: nvremote-gateway.service not found. Copy it to /etc/systemd/system/ manually."
    fi
fi

echo ""
echo "============================================="
echo " Gateway setup complete!"
echo "============================================="
echo " Public IP:         $PUBLIC_IP"
echo " WireGuard Port:    $WG_PORT"
echo " Server Public Key: $SERVER_PUBLIC_KEY"
echo " API Port:          $API_PORT"
echo " Config File:       $CONFIG_DIR/config.yaml"
echo ""
echo " Next steps:"
echo "   1. Register this gateway with the control plane"
echo "   2. Set gateway_token and gateway_id in $CONFIG_DIR/config.yaml"
echo "   3. Restart the service: systemctl restart nvremote-gateway"
echo "============================================="
