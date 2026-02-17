# NVIDIA Remote Stream -- Getting Started

A step-by-step guide to setting up NVRS for development and deployment.

---

## Table of Contents

1. [What is NVRS?](#what-is-nvrs)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites](#prerequisites)
4. [Local Development Setup](#local-development-setup)
5. [Managed Service](#managed-service)
6. [Self-Hosted Deployment](#self-hosted-deployment)
7. [Host Machine Setup](#host-machine-setup)
8. [End-to-End: Your First Stream](#end-to-end-your-first-stream)
9. [Troubleshooting](#troubleshooting)

---

## What is NVRS?

NVRemote provides secure cloud connectivity for GPU remote streaming, so you can
stream from any machine to any machine over the internet without opening firewall
ports.

The system uses a **WireGuard overlay network** routed through a cloud gateway.
The client connects to the gateway, the host connects to the gateway, and traffic
flows through the tunnel. No inbound firewall rules needed on either end.

**Connection flow:**

```
1. User signs in with Google
2. Clicks "Connect" on a host card
3. Client generates a WireGuard keypair locally (private key never leaves the machine)
4. Client sends only the PUBLIC key to the server
5. Server registers the client as a WireGuard peer on the cloud gateway
6. Server notifies the host agent via WebSocket
7. Client establishes WireGuard tunnel to the gateway
8. Client connects to the host via the tunnel
9. Streaming begins through the encrypted tunnel
```

---

## Architecture Overview

```
apps/
  server-api/       NestJS + Prisma + PostgreSQL    (control plane)
  client-desktop/   Electron + React + Vite         (Windows desktop app)
  host-agent/       Go Windows service              (runs on streaming machine)
  gateway/          Go + wgctrl                     (cloud WireGuard relay)

infra/
  docker/           Local dev docker-compose (PostgreSQL, Redis, API, Gateway)
  terraform/        Self-hosted infrastructure (GCP or AWS)
  deploy.sh         One-command self-hosted deployment (AWS)
  deploy-gcp.sh     One-command self-hosted deployment (GCP)
  deploy-compose.yml Production docker-compose (self-hosted)
  nginx.conf        Reverse proxy + TLS (self-hosted)

docs/               Architecture, security, data model docs
```

**WireGuard IP ranges:**
- Gateway: `10.100.0.1`
- Hosts: `10.100.0.2` - `10.100.255.254` (allocated on registration)
- Clients: `10.101.0.1` - `10.101.255.254` (allocated per session, released on disconnect)

---

## Prerequisites

### Required

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 20+ | https://nodejs.org/ |
| **npm** | 10+ | Ships with Node.js |
| **Go** | 1.22+ | https://go.dev/dl/ |
| **Docker Desktop** | 24+ | https://docs.docker.com/get-docker/ |
| **Git** | 2.40+ | https://git-scm.com/ |
| **WireGuard** | Latest | https://www.wireguard.com/install/ |

### For Self-Hosted Deployment (optional)

| Tool | Version | Install |
|------|---------|---------|
| **Terraform** | 1.7+ | https://developer.hashicorp.com/terraform/install |
| **gcloud CLI** or **AWS CLI** | Latest | Depends on your cloud provider |

### Accounts

| Account | Purpose | Setup |
|---------|---------|-------|
| **Google Cloud** | OAuth sign-in (required for all setups) | Create OAuth 2.0 Client ID at https://console.cloud.google.com/apis/credentials |
| **GCP** or **AWS** | Self-hosted deployment (optional) | https://cloud.google.com/ or https://aws.amazon.com/ |

### Verify Your Environment

```bash
node --version          # v20.x.x+
npm --version           # 10.x.x+
go version              # go1.22+
docker --version        # 24.x+
docker compose version  # v2.x+
wg --version            # wireguard-tools
git --version           # 2.40+
```

---

## Local Development Setup

### Step 1: Clone and install

```bash
git clone https://github.com/thatcooperguy/nvremote.git
cd nvremote
npm install
```

This installs dependencies for both `apps/server-api` and `apps/client-desktop`
via npm workspaces.

### Step 2: Start PostgreSQL and Redis

```bash
npm run docker:up
```

This runs `docker compose -f infra/docker/docker-compose.yml up -d`, which starts:

| Service | Container | Port | Credentials |
|---------|-----------|------|-------------|
| PostgreSQL 16 | nvrs-postgres | localhost:5432 | `nvrs` / `nvrs_dev_password` / db: `nvrs` |
| Redis 7 | nvrs-redis | localhost:6379 | (no auth) |
| Adminer | nvrs-adminer | localhost:8081 | (web UI for DB) |

Verify they're healthy:

```bash
docker ps
```

### Step 3: Configure the Server API

```bash
cd apps/server-api
cp .env.example .env
```

Edit `apps/server-api/.env`:

```bash
# Server
PORT=3001
CORS_ORIGIN=http://localhost:5173

# PostgreSQL
DATABASE_URL=postgresql://nvrs:nvrs_dev_password@localhost:5432/nvrs?schema=public

# JWT
JWT_SECRET=any-long-random-string-for-dev
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY_DAYS=7

# Google OAuth2 (get these from Google Cloud Console)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback

# WireGuard Gateway (leave defaults for local dev without gateway)
GATEWAY_URL=http://localhost:8080
GATEWAY_TOKEN=dev-gateway-token
GATEWAY_PUBLIC_KEY=
GATEWAY_ENDPOINT=
```

### Step 4: Run database migrations

```bash
cd apps/server-api
npx prisma generate
npx prisma migrate dev
```

This creates all tables defined in `prisma/schema.prisma`: User, Org, OrgMember,
Host, Session, AuditLog, RefreshToken.

### Step 5: Start the Server API

```bash
# From the repo root:
npm run dev:api
```

The NestJS server starts on `http://localhost:3001`. You should see:

```
[Nest] LOG [NestFactory] Starting Nest application...
[Nest] LOG [NestApplication] Nest application successfully started
```

### Step 6: Start the Client Desktop App

```bash
# From the repo root (in a new terminal):
npm run dev:client
```

This starts Vite + Electron in dev mode. The Electron window opens with the
NVIDIA-themed login screen (dark background #1A1A1A, green accent #76B900).

### Step 7: Set up Google OAuth (required for sign-in to work)

1. Go to https://console.cloud.google.com/apis/credentials
2. Create an **OAuth 2.0 Client ID** (type: Web Application)
3. Add authorized redirect URI: `http://localhost:3001/api/v1/auth/google/callback`
4. Copy the Client ID and Client Secret into your `.env`
5. Restart the server API

---

## Managed Service

The easiest way to use NVRemote is the managed service at **nvremote.com**. The
control plane (API, database, website) is hosted for you -- there's nothing to
deploy. You just install the host agent on your streaming machine and sign in
from any client.

**What's managed for you:**
- Control plane API (`api.nvremote.com`)
- PostgreSQL database
- Website and dashboard (`nvremote.com`)
- OAuth authentication

**What you provide:**
- A Windows PC with an NVIDIA GPU running the host agent
- A client device (Windows, macOS, Android, or browser)

Skip to [Host Machine Setup](#host-machine-setup) to get started.

---

## Self-Hosted Deployment

If you want to run the entire NVRemote stack on your own infrastructure (for
privacy, compliance, or air-gapped environments), you can deploy the control
plane, database, and gateway yourself.

Two deployment scripts are provided:

### Option A: GCP (recommended)

```bash
cd infra
chmod +x deploy-gcp.sh
./deploy-gcp.sh --environment dev --region us-west1
```

`deploy-gcp.sh` handles everything:
1. Enables required GCP APIs
2. Runs Terraform (creates VPC, Compute Engine VM, Cloud SQL)
3. Deploys the app via Docker Compose on the VM
4. Runs database migrations
5. Sets up TLS (Let's Encrypt or self-signed)

Add `--domain your-domain.com` if you have a domain pointed at the VM's IP.

### Option B: AWS

```bash
cd infra
chmod +x deploy.sh
./deploy.sh --environment dev --region us-west-2
```

`deploy.sh` handles everything:
1. Checks prerequisites (AWS CLI, Terraform, Docker, SSH keys)
2. Runs Terraform (creates VPC, EC2, RDS, Elastic IP)
3. SSHs into the EC2 instance and deploys the app via `deploy-compose.yml`
4. Runs database migrations
5. Sets up TLS (Let's Encrypt or self-signed)

### Option C: Manual Terraform

```bash
cd infra/terraform/environments/dev
cp ../../terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings

terraform init
terraform plan
terraform apply
```

### Estimated Self-Hosted Costs

| Resource | Purpose | GCP Cost | AWS Cost |
|----------|---------|----------|----------|
| VM (e2-small / t3.small) | Gateway + API server | ~$15/mo | ~$15/mo |
| Static IP | WireGuard endpoint | ~$3/mo | ~$4/mo |
| Managed PostgreSQL | Database | ~$10/mo | ~$15/mo |
| **Total** | | **~$28-35/mo** | **~$35-50/mo** |

### After deployment

The deploy script outputs:
- **API URL**: `https://<static-ip>` or `https://your-domain.com`
- **Gateway Endpoint**: `<static-ip>:51820`
- **Gateway Public Key**: (WireGuard public key)

You'll need these values for the host agent config and client `.env`.

> **Note:** When self-hosting, point your host agent's `control_plane_url` to
> your own API URL instead of `api.nvremote.com`.

---

## Host Machine Setup

The host machine is the Windows PC running **nvremote-host.exe** that you want to
stream from. It needs:

1. An NVIDIA GPU (GTX/RTX series, Kepler or newer)
2. Latest NVIDIA display drivers
3. WireGuard for Windows installed
4. NvFBC enabled
5. The NVRS host agent

### Step 1: Enable NvFBC (NVIDIA Frame Buffer Capture)

NVRemote host requires NvFBC to capture the screen. Two methods:

**Method A (no restart):**
```
NvFBCEnable.exe -enable
```

**Method B (registry key, requires restart):**
Run `EnableFBC.reg`, then restart.

> **Note:** Installing or updating display drivers may reset the NvFBC flag.
> You may need to re-enable it after driver updates.

### Step 2: Stop conflicting services

If GeForce Experience (GFE) is installed, stop NvContainer services:

```powershell
sc stop NvContainerLocalSystem
```

Or disable GameStream in GFE's UI. NVRemote host and GFE's GameStream cannot run
simultaneously.

### Step 3: Install NvVAD (Virtual Audio Driver)

Required for audio streaming. Use the bundled installer from the NVRemote host
package, or install a virtual audio driver separately.

### Step 4: Verify nvremote-host.exe runs

Before installing the agent, verify nvremote-host works standalone:

```
nvremote-host.exe --log-level debug --show-pii-in-logs --log -
```

If you see errors about device context, add `--cuda`:

```
nvremote-host.exe --cuda --log-level debug --show-pii-in-logs --log -
```

Note the IP address it reports. On a system with no physical monitor (headless),
you'll need a virtual display (ForceDisp or VNC with virtual monitor).

> **Important:** Allow nvremote-host.exe through Windows Firewall when prompted.
> (With NVRS, traffic goes through the WireGuard tunnel, but local firewall
> still needs to allow loopback/tunnel-interface traffic.)

### Step 5: Install the NVRS Host Agent

**Option A: PowerShell installer (recommended)**

```powershell
# Run as Administrator
.\scripts\install.ps1 -ControlPlaneURL "https://your-api-url" -BootstrapToken "your-token"
```

This:
1. Copies the agent to `C:\ProgramData\NVRemoteStream\`
2. Writes the config file
3. Installs as a Windows service (`NVRemoteStreamAgent`)
4. Starts the service
5. Registers with the control plane

**Option B: Manual**

```bash
cd apps/host-agent
go build -o nvrs-agent.exe ./cmd/agent

# Copy config
cp internal/config/config.yaml.example C:\ProgramData\NVRemoteStream\agent.yaml
# Edit agent.yaml with your control_plane_url and bootstrap_token

# Install as service
.\nvrs-agent.exe --install

# Start
Start-Service NVRemoteStreamAgent
```

### Step 6: Verify host registration

After the agent starts, it:
1. Registers with the control plane using the bootstrap token
2. Receives a host ID and WireGuard tunnel IP (e.g., `10.100.0.3`)
3. Establishes a WireGuard tunnel to the cloud gateway
4. Starts sending heartbeats every 30 seconds
5. Detects nvremote-host.exe and GPU info

Check registration:

```powershell
Get-Content C:\ProgramData\NVRemoteStream\registration.json
# Should show: host_id, tunnel_ip
```

Check the service:

```powershell
Get-Service NVRemoteStreamAgent
# Should show: Running
```

The host should now appear as **ONLINE** in the client dashboard.

---

## End-to-End: Your First Stream

With everything deployed:

1. **Open the NVRS client app**
2. **Sign in with Google**
3. **See your host** in the dashboard (green ONLINE badge, GPU info, latency)
4. **Click "Connect"**

Behind the scenes:
- Client generates X25519 keypair (private key stays local)
- Client sends public key to `POST /hosts/:id/connect`
- Server allocates a client tunnel IP (e.g., `10.101.0.5`)
- Server registers the peer with the gateway
- Server notifies the host agent via WebSocket
- Client establishes WireGuard tunnel to the gateway
- Client connects to `10.100.0.3` (the host's tunnel IP) via the streaming viewer

5. **Streaming begins** -- you should see the host's desktop
6. **Click "Disconnect"** to end the session

The overlay shows connection status, latency, and a disconnect button.

---

## Troubleshooting

### Server API won't start

| Symptom | Fix |
|---------|-----|
| `ECONNREFUSED` on port 5432 | PostgreSQL not running. Run `npm run docker:up` |
| `ECONNREFUSED` on port 6379 | Redis not running. Run `npm run docker:up` |
| Prisma errors | Run `npx prisma generate && npx prisma migrate dev` in `apps/server-api` |
| Google OAuth redirect fails | Check `GOOGLE_CALLBACK_URL` matches Google Cloud Console redirect URI |

### Client won't connect

| Symptom | Fix |
|---------|-----|
| "Sign in" button does nothing | Check `GOOGLE_CLIENT_ID` in client environment |
| Hosts don't appear | Check API is running and CORS_ORIGIN matches Vite dev server URL |
| WireGuard tunnel fails | Run client as Administrator. Check WireGuard is installed. |

### Host agent issues

| Symptom | Fix |
|---------|-----|
| Registration fails | Bootstrap token expired (24h). Generate a new one. |
| "Service failed to start" | Run as Administrator. Check `agent.yaml` has correct URLs. |
| nvremote-host not detected | Verify `streamer_path` in `agent.yaml`. Run nvremote-host manually first. |
| NvFBC errors | Run `NvFBCEnable.exe -enable`. May need to re-run after driver updates. |

### Gateway / WireGuard

| Symptom | Fix |
|---------|-----|
| Tunnel won't establish | Check gateway firewall allows UDP 51820 inbound (GCP firewall rule or AWS security group) |
| Peers not routing | Check `net.ipv4.ip_forward=1` is set on the gateway VM |
| High latency | Gateway should be in the same region as users. Check `wg show` for handshake times. |

### NVRemote host troubleshooting

| Symptom | Fix |
|---------|-----|
| Missing `qwave.dll` (Windows Server) | Install "Quality Windows Audio Video Experience" feature, enable QWAVE service |
| No sound card | Install virtual audio (NvVAD) or disable audio: `general.featureFlags: 5` in client config |
| Input not working | Check "Input mode" in nvremote-host log. If non-zero, run `DisableVirtualHidDevices.reg` and restart nvremote-host |
| Remote Desktop blocks nvremote-host | Use VNC instead of RDP to access the host machine |
| Black screen on headless machine | Use ForceDisp to create a virtual monitor |
| Laptop co-proc errors | Add `--cuda` flag to nvremote-host command line |

### Useful commands

```bash
# Check docker services
docker ps

# View API logs
npm run dev:api

# Open database browser
open http://localhost:8081  # Adminer

# Open Prisma Studio
cd apps/server-api && npx prisma studio

# Check WireGuard tunnel status
wg show

# View host agent logs (Windows)
Get-Content C:\ProgramData\NVRemoteStream\agent.log -Tail 50

# Build host agent from source
cd apps/host-agent && go build -o nvrs-agent.exe ./cmd/agent

# Build gateway from source
cd apps/gateway && go build -o gateway ./src/...
```

---

## Repo Quick Reference

| Command | What it does |
|---------|-------------|
| `npm install` | Install all workspace dependencies |
| `npm run docker:up` | Start PostgreSQL + Redis + Adminer |
| `npm run docker:down` | Stop local Docker services |
| `npm run dev:api` | Start NestJS server (watch mode) |
| `npm run dev:client` | Start Electron + Vite client (watch mode) |
| `npm run build:all` | Build both API and client |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:generate` | Generate Prisma client |
| `npm run lint` | Run ESLint across all workspaces |
| `npm run format` | Run Prettier across all workspaces |
| `./infra/deploy-gcp.sh` | Self-hosted deploy to GCP |
| `./infra/deploy.sh` | Self-hosted deploy to AWS |
