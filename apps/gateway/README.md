# NVIDIA Remote Stream - Cloud Gateway

The cloud gateway service runs on a cloud VM alongside WireGuard to manage the overlay network that connects hosts and clients. It exposes an HTTP API that the control plane uses to dynamically add and remove WireGuard peers as streaming sessions are created and destroyed.

## Architecture

The gateway sits between the control plane and the WireGuard overlay network:

```
Control Plane (server-api)
        |
        | HTTPS (peer management, heartbeat)
        v
   Cloud Gateway (this service)
        |
        | WireGuard UDP tunnel
        v
  Host Agents / Client Apps
```

## Prerequisites

- Linux VM with a public IP address (Ubuntu 22.04+, Debian 12+, or Alpine)
- WireGuard kernel module or userspace implementation
- Root or CAP_NET_ADMIN capability for WireGuard management

## Quick Start

### Automated Setup

Run the setup script on a fresh VM:

```bash
sudo ./scripts/setup.sh --public-ip <YOUR_PUBLIC_IP>
```

This will install WireGuard, generate keys, configure the network interface, enable IP forwarding, and install the gateway as a systemd service.

### Manual Setup

1. Build the binary:

```bash
make build
```

2. Copy to the gateway VM:

```bash
scp bin/nvrs-gateway user@gateway-vm:/usr/local/bin/
```

3. Create the configuration file at `/etc/nvrs-gateway/config.yaml`:

```yaml
listen_addr: ":8080"
wireguard_interface: "wg0"
wireguard_port: 51820
tunnel_subnet: "10.100.0.0/16"
public_ip: "203.0.113.10"
control_plane_url: "https://api.nvrs.example.com"
gateway_token: "your-gateway-token"
gateway_id: "gw-us-east-1"
```

4. Start the service:

```bash
systemctl start nvrs-gateway
```

## Configuration

Configuration is loaded from `/etc/nvrs-gateway/config.yaml` and can be overridden with environment variables:

| Config Key            | Env Variable              | Default          | Description                           |
|-----------------------|---------------------------|------------------|---------------------------------------|
| listen_addr           | NVRS_LISTEN_ADDR          | :8080            | HTTP API listen address               |
| wireguard_interface   | NVRS_WG_INTERFACE         | wg0              | WireGuard interface name              |
| wireguard_port        | NVRS_WG_PORT              | 51820            | WireGuard UDP listen port             |
| control_plane_url     | NVRS_CONTROL_PLANE_URL    |                  | Control plane base URL                |
| gateway_token         | NVRS_GATEWAY_TOKEN        |                  | Bearer token for API authentication   |
| tunnel_subnet         | NVRS_TUNNEL_SUBNET        | 10.100.0.0/16    | WireGuard tunnel CIDR                 |
| public_ip             | NVRS_PUBLIC_IP            |                  | Public IP of this gateway             |
| gateway_id            | NVRS_GATEWAY_ID           |                  | Unique gateway identifier             |
| heartbeat_interval    | NVRS_HEARTBEAT_INTERVAL   | 30               | Seconds between control plane pings   |

## API Endpoints

All endpoints except `/api/health` require a `Bearer` token in the `Authorization` header.

| Method | Path                          | Description                    |
|--------|-------------------------------|--------------------------------|
| POST   | /api/peers                    | Add a WireGuard peer           |
| DELETE | /api/peers/{publicKey}        | Remove a WireGuard peer        |
| GET    | /api/peers                    | List all peers with status     |
| GET    | /api/peers/{publicKey}/status | Get detailed peer status       |
| GET    | /api/health                   | Health check (no auth needed)  |

## Docker

Build and run in a container:

```bash
make docker-build
docker run -d \
  --cap-add NET_ADMIN \
  --sysctl net.ipv4.ip_forward=1 \
  -p 8080:8080 \
  -p 51820:51820/udp \
  -v /etc/nvrs-gateway:/etc/nvrs-gateway:ro \
  nvrs-gateway:latest
```

## Development

```bash
make build-local   # Build for current platform
make test          # Run tests
make lint          # Run linters
make fmt           # Format code
```
