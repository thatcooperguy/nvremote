# NVIDIA Remote Stream -- Getting Started

**Version:** 1.0
**Last Updated:** 2026-02-13

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Repository Structure](#repository-structure)
3. [Local Development Setup](#local-development-setup)
4. [Running Components Locally](#running-components-locally)
5. [Deploying to AWS with Terraform](#deploying-to-aws-with-terraform)
6. [First-Time Configuration](#first-time-configuration)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Ensure the following tools are installed and available on your PATH before proceeding.

### Required Software

| Tool | Minimum Version | Purpose | Installation |
|---|---|---|---|
| **Node.js** | 20.x LTS | Control Plane API, Client App build | https://nodejs.org/ or `nvm install 20` |
| **npm** | 10.x | Package management (ships with Node.js) | Included with Node.js |
| **Go** | 1.22+ | Host Agent, Gateway sidecar | https://go.dev/dl/ |
| **Docker** | 24.x+ | Local PostgreSQL, Redis, development containers | https://docs.docker.com/get-docker/ |
| **Docker Compose** | 2.x+ (V2 plugin) | Multi-container local environment | Included with Docker Desktop |
| **AWS CLI** | 2.x | Infrastructure deployment, secrets management | https://aws.amazon.com/cli/ |
| **Terraform** | 1.7+ | Infrastructure as Code | https://developer.hashicorp.com/terraform/install |
| **WireGuard Tools** | Latest | Tunnel management (`wg`, `wg-quick`) | https://www.wireguard.com/install/ |
| **Git** | 2.40+ | Source control | https://git-scm.com/ |

### Optional (Recommended)

| Tool | Purpose | Installation |
|---|---|---|
| **nvm** (Node Version Manager) | Manage multiple Node.js versions | https://github.com/nvm-sh/nvm |
| **Prisma Studio** | Visual database browser | `npx prisma studio` (included with Prisma) |
| **pgAdmin** or **DBeaver** | Database administration GUI | https://www.pgadmin.org/ or https://dbeaver.io/ |
| **Postman** or **Bruno** | API testing | https://www.postman.com/ or https://www.usebruno.com/ |

### Accounts and Credentials

| Credential | Purpose | How to Obtain |
|---|---|---|
| **Google Cloud OAuth 2.0 Client ID** | OIDC authentication for users | Create at https://console.cloud.google.com/apis/credentials |
| **AWS Account** | Infrastructure deployment | https://aws.amazon.com/ |
| **AWS IAM credentials** | Terraform and CLI access | IAM console or `aws configure` |

### Verify Installation

Run the following commands to verify your environment:

```bash
node --version        # Should output v20.x.x or higher
npm --version         # Should output 10.x.x or higher
go version            # Should output go1.22.x or higher
docker --version      # Should output Docker version 24.x.x or higher
docker compose version # Should output Docker Compose version v2.x.x
aws --version         # Should output aws-cli/2.x.x
terraform --version   # Should output Terraform v1.7.x or higher
wg --version          # Should output wireguard-tools vX.X.X
git --version         # Should output git version 2.40.x or higher
```

---

## Repository Structure

```
nvstreamer/
|-- docs/                        # Documentation
|   |-- architecture/
|   |   |-- ARCHITECTURE.md      # System architecture
|   |   |-- DATA_MODEL.md        # Database schema
|   |   +-- UI_WIREFLOW.md       # UI wireflow descriptions
|   |-- security/
|   |   +-- SECURITY.md          # Security model
|   +-- GETTING_STARTED.md       # This file
|
|-- control-plane/               # Control Plane API (Node.js + Fastify)
|   |-- src/
|   |   |-- routes/              # API route handlers
|   |   |-- services/            # Business logic
|   |   |-- middleware/          # Auth, RBAC, validation, rate limiting
|   |   |-- websocket/          # WebSocket handlers (host + client channels)
|   |   |-- models/             # TypeScript types / Zod schemas
|   |   +-- utils/              # Shared utilities
|   |-- prisma/
|   |   |-- schema.prisma       # Database schema
|   |   +-- migrations/         # Database migrations
|   |-- test/                   # Tests
|   |-- package.json
|   |-- tsconfig.json
|   +-- Dockerfile
|
|-- host-agent/                  # Host Agent (Go)
|   |-- cmd/
|   |   +-- agent/
|   |       +-- main.go         # Entry point
|   |-- internal/
|   |   |-- bootstrap/          # Bootstrap registration
|   |   |-- heartbeat/          # Heartbeat loop
|   |   |-- tunnel/             # WireGuard tunnel management
|   |   |-- nvstreamer/         # nvstreamer.exe process management
|   |   +-- config/             # Configuration
|   |-- go.mod
|   |-- go.sum
|   +-- Makefile
|
|-- gateway/                     # Gateway sidecar (Go)
|   |-- cmd/
|   |   +-- gateway/
|   |       +-- main.go         # Entry point
|   |-- internal/
|   |   |-- wireguard/          # WireGuard interface management
|   |   |-- peers/              # Dynamic peer management
|   |   |-- metrics/            # Bandwidth and connection metrics
|   |   +-- config/             # Configuration
|   |-- go.mod
|   |-- go.sum
|   +-- Dockerfile
|
|-- client/                      # Client Desktop App (Electron + React)
|   |-- src/
|   |   |-- main/               # Electron main process
|   |   |-- renderer/           # React UI
|   |   |   |-- components/     # Reusable UI components
|   |   |   |-- pages/          # Page components
|   |   |   |-- hooks/          # Custom React hooks
|   |   |   |-- store/          # State management
|   |   |   +-- styles/         # Tailwind config, global styles
|   |   +-- shared/             # Shared types between main and renderer
|   |-- package.json
|   |-- electron-builder.yml
|   +-- tsconfig.json
|
|-- infra/                       # Infrastructure as Code
|   |-- terraform/
|   |   |-- modules/
|   |   |   |-- control-plane/  # ECS Fargate, ALB, security groups
|   |   |   |-- database/       # RDS PostgreSQL, ElastiCache Redis
|   |   |   |-- gateway/        # EC2 ASG, NLB, WireGuard config
|   |   |   |-- networking/     # VPC, subnets, route tables
|   |   |   +-- dns/            # Route53 records
|   |   |-- environments/
|   |   |   |-- dev/
|   |   |   |-- staging/
|   |   |   +-- production/
|   |   |-- main.tf
|   |   |-- variables.tf
|   |   +-- outputs.tf
|   +-- docker-compose.yml       # Local development environment
|
+-- .github/
    +-- workflows/
        |-- ci.yml               # Build + test on every push
        |-- deploy-staging.yml   # Deploy to staging on merge to main
        +-- deploy-prod.yml      # Deploy to production on release tag
```

---

## Local Development Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/nvstreamer.git
cd nvstreamer
```

### Step 2: Start Infrastructure Services

Start PostgreSQL and Redis using Docker Compose:

```bash
docker compose -f infra/docker-compose.yml up -d
```

This starts:
- **PostgreSQL 15** on `localhost:5432` (user: `nvstream`, password: `nvstream_dev`, database: `nvstream`)
- **Redis 7** on `localhost:6379`

Verify the services are running:

```bash
docker compose -f infra/docker-compose.yml ps
```

Expected output:
```
NAME                    STATUS              PORTS
nvstream-postgres       Up (healthy)        0.0.0.0:5432->5432/tcp
nvstream-redis          Up (healthy)        0.0.0.0:6379->6379/tcp
```

#### Docker Compose File Reference

The `infra/docker-compose.yml` file contents:

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:15-alpine
    container_name: nvstream-postgres
    environment:
      POSTGRES_USER: nvstream
      POSTGRES_PASSWORD: nvstream_dev
      POSTGRES_DB: nvstream
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nvstream"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: nvstream-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### Step 3: Set Up the Control Plane API

```bash
cd control-plane

# Install dependencies
npm install

# Create the .env file for local development
cp .env.example .env
```

Edit `control-plane/.env` with your local settings:

```bash
# Database
DATABASE_URL="postgresql://nvstream:nvstream_dev@localhost:5432/nvstream?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT Signing Keys (generate for local dev)
JWT_PRIVATE_KEY_PATH="./keys/dev-private.pem"
JWT_PUBLIC_KEY_PATH="./keys/dev-public.pem"
JWT_ACCESS_TOKEN_EXPIRY="15m"
JWT_REFRESH_TOKEN_EXPIRY="7d"

# Google OIDC
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/callback"

# Server
PORT=4000
HOST="0.0.0.0"
NODE_ENV="development"
LOG_LEVEL="debug"

# CORS (allow local client app)
CORS_ORIGINS="http://localhost:3000"
```

Generate development JWT signing keys:

```bash
mkdir -p keys
openssl genrsa -out keys/dev-private.pem 2048
openssl rsa -in keys/dev-private.pem -pubout -out keys/dev-public.pem
```

Run database migrations:

```bash
npx prisma migrate dev
```

This creates all database tables, indexes, and enums defined in
`prisma/schema.prisma`.

Optionally, seed the database with sample data:

```bash
npx prisma db seed
```

### Step 4: Set Up the Client Desktop App

```bash
cd client

# Install dependencies
npm install

# Create the .env file for local development
cp .env.example .env
```

Edit `client/.env`:

```bash
# Control Plane API URL
VITE_API_URL="http://localhost:4000/api/v1"
VITE_WS_URL="ws://localhost:4000"

# Google OIDC
VITE_GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
```

### Step 5: Set Up the Host Agent (Optional for UI development)

The Host Agent is only needed if you want to test end-to-end session establishment.

```bash
cd host-agent

# Download Go dependencies
go mod download

# Create configuration file
cp config.example.yaml config.yaml
```

Edit `host-agent/config.yaml`:

```yaml
control_plane:
  api_url: "http://localhost:4000/api/v1"
  ws_url: "ws://localhost:4000/ws/host"

# For local development, skip mTLS and use a bootstrap token
auth:
  mode: "bootstrap"
  bootstrap_token: ""  # Will be generated during first-time setup

host:
  hostname: "DEV-WORKSTATION"
  heartbeat_interval: "30s"

wireguard:
  interface_name: "wg-nvstream"
  listen_port: 51821

logging:
  level: "debug"
  format: "text"
```

### Step 6: Set Up the Gateway (Optional for local development)

For local development, the gateway is typically not needed. The client and host agent
can connect directly over localhost. If you need to test gateway relay functionality:

```bash
cd gateway

# Download Go dependencies
go mod download

# Create configuration file
cp config.example.yaml config.yaml
```

Edit `gateway/config.yaml`:

```yaml
control_plane:
  api_url: "http://localhost:4000/api/v1"
  grpc_url: "localhost:4001"

wireguard:
  interface_name: "wg-gateway"
  listen_port: 51820
  address: "10.100.0.1/16"

logging:
  level: "debug"
  format: "text"
```

---

## Running Components Locally

### Start the Control Plane API

```bash
cd control-plane
npm run dev
```

The API starts on `http://localhost:4000`. You should see:

```
[INFO] Server listening on http://0.0.0.0:4000
[INFO] Database connection established
[INFO] Redis connection established
[INFO] WebSocket server ready
```

Verify with:

```bash
curl http://localhost:4000/api/v1/health
```

Expected response:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected",
  "redis": "connected",
  "uptime": 5
}
```

### Start the Client Desktop App

```bash
cd client
npm run dev
```

This starts the Electron app in development mode with hot reload. The React dev
server runs on `http://localhost:3000` and the Electron window opens automatically.

For development without Electron (browser-only React UI):

```bash
cd client
npm run dev:web
```

This starts just the Vite dev server at `http://localhost:3000`.

### Start the Host Agent

```bash
cd host-agent
go run ./cmd/agent --config config.yaml
```

If the agent has not been bootstrapped yet, it will print:

```
[INFO] Agent not registered. Run with --bootstrap-token to register.
```

See [First-Time Configuration](#first-time-configuration) for bootstrap instructions.

### Start the Gateway (if needed)

```bash
cd gateway

# Requires root/admin for WireGuard interface creation
sudo go run ./cmd/gateway --config config.yaml
```

### Run All Services (Quick Start)

For convenience, you can start all services together. From the repository root:

```bash
# Terminal 1: Infrastructure
docker compose -f infra/docker-compose.yml up -d

# Terminal 2: Control Plane
cd control-plane && npm run dev

# Terminal 3: Client App
cd client && npm run dev

# Terminal 4 (optional): Host Agent
cd host-agent && go run ./cmd/agent --config config.yaml
```

### Running Tests

**Control Plane:**

```bash
cd control-plane

# Unit tests
npm test

# Unit tests with coverage
npm run test:coverage

# Integration tests (requires running PostgreSQL and Redis)
npm run test:integration

# All tests
npm run test:all
```

**Host Agent:**

```bash
cd host-agent

# All tests
go test ./...

# With verbose output
go test -v ./...

# With race detection
go test -race ./...
```

**Gateway:**

```bash
cd gateway
go test ./...
```

**Client:**

```bash
cd client

# Unit tests (Vitest)
npm test

# End-to-end tests (Playwright)
npm run test:e2e
```

---

## Deploying to AWS with Terraform

### Step 1: Configure AWS Credentials

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, region (e.g., us-west-2)
```

Or set environment variables:

```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-west-2"
```

### Step 2: Initialize Terraform State Backend

Create an S3 bucket and DynamoDB table for Terraform state management:

```bash
# Create S3 bucket for state
aws s3api create-bucket \
  --bucket nvstream-terraform-state \
  --region us-west-2 \
  --create-bucket-configuration LocationConstraint=us-west-2

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket nvstream-terraform-state \
  --versioning-configuration Status=Enabled

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name nvstream-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

### Step 3: Configure Environment Variables

```bash
cd infra/terraform/environments/staging
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
# General
environment    = "staging"
project_name   = "nvstream"
aws_region     = "us-west-2"

# Networking
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]

# Control Plane
control_plane_image     = "your-ecr-repo/nvstream-control-plane:latest"
control_plane_cpu       = 512
control_plane_memory    = 1024
control_plane_desired_count = 2

# Database
db_instance_class   = "db.t4g.medium"
db_allocated_storage = 20
db_max_allocated_storage = 100

# Redis
redis_node_type = "cache.t4g.micro"

# Gateway
gateway_instance_type = "c6gn.medium"
gateway_min_count     = 1
gateway_max_count     = 3

# DNS
domain_name = "nvstream.example.com"
route53_zone_id = "Z1234567890ABCDEF"

# Google OIDC
google_client_id = "your-google-client-id.apps.googleusercontent.com"
```

### Step 4: Initialize and Plan

```bash
cd infra/terraform/environments/staging

terraform init \
  -backend-config="bucket=nvstream-terraform-state" \
  -backend-config="key=staging/terraform.tfstate" \
  -backend-config="region=us-west-2" \
  -backend-config="dynamodb_table=nvstream-terraform-locks"

terraform plan -out=plan.tfplan
```

Review the plan carefully. It will create:
- VPC with public and private subnets across 3 AZs
- ECS Fargate cluster with ALB for the Control Plane
- RDS PostgreSQL Multi-AZ instance
- ElastiCache Redis cluster
- EC2 Auto Scaling Group with NLB for Gateways
- Security groups, IAM roles, and policies
- Route53 DNS records
- ACM TLS certificates

### Step 5: Apply

```bash
terraform apply plan.tfplan
```

This takes approximately 15-20 minutes for a fresh deployment.

### Step 6: Run Database Migrations in Production

After the infrastructure is created, run Prisma migrations against the production
database:

```bash
# Get the database URL from Terraform outputs
export DATABASE_URL=$(terraform output -raw database_url)

# Run migrations
cd ../../../../control-plane
npx prisma migrate deploy
```

### Step 7: Verify Deployment

```bash
# Get the API URL from Terraform outputs
cd ../infra/terraform/environments/staging
API_URL=$(terraform output -raw api_url)

# Health check
curl https://${API_URL}/api/v1/health
```

---

## First-Time Configuration

After deployment (or local setup), follow these steps to create your first
organization and register your first host.

### 1. Authenticate

Open the Client App (or use the browser at `http://localhost:3000` in development).
Click "Sign in with Google" and complete the OIDC flow. This creates your user
account.

### 2. Create an Organization

Using the Client App UI or via API:

```bash
# Replace with your actual JWT (obtained after login)
TOKEN="your-jwt-access-token"
API="http://localhost:4000/api/v1"

curl -X POST "${API}/orgs" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Organization",
    "slug": "my-org"
  }'
```

Response:

```json
{
  "id": "uuid",
  "name": "My Organization",
  "slug": "my-org",
  "settings": {},
  "created_at": "2026-02-13T00:00:00.000Z"
}
```

You are automatically added as an Admin of the new organization.

### 3. Generate a Bootstrap Token

```bash
ORG_ID="uuid-from-previous-step"

curl -X POST "${API}/orgs/${ORG_ID}/hosts/bootstrap-token" \
  -H "Authorization: Bearer ${TOKEN}"
```

Response:

```json
{
  "token": "nvs_bootstrap_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "expires_at": "2026-02-14T00:00:00.000Z"
}
```

Save the token. It is shown only once and expires in 24 hours.

### 4. Register Your First Host

On the Windows machine running nvstreamer.exe, install and run the Host Agent:

```bash
# Download the host agent binary (or build from source)
# For building from source:
cd host-agent
go build -o nvstream-agent.exe ./cmd/agent

# Run with bootstrap token
.\nvstream-agent.exe --bootstrap-token nvs_bootstrap_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

The agent will:
1. Register with the control plane
2. Receive and store its mTLS client certificate
3. Begin sending heartbeats
4. Report its hostname, GPU info, and nvstreamer status

You should see:

```
[INFO] Bootstrap registration successful
[INFO] Host ID: <uuid>
[INFO] Certificate stored in Windows Certificate Store
[INFO] Heartbeat loop started (interval: 30s)
[INFO] Status: ONLINE | GPU: NVIDIA GeForce RTX 4090 | nvstreamer: running
```

### 5. Verify Host Appears in Dashboard

Open the Client App. You should see your host appear in the dashboard with:
- Hostname
- ONLINE status (green indicator)
- GPU information
- Latency measurement

### 6. Create Your First Session

Click the "Connect" button on the host card. The system will:
1. Generate ephemeral WireGuard keys
2. Establish the tunnel
3. Launch the nvstreamer client
4. Display the streaming session overlay

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|---|---|---|
| `prisma migrate dev` fails with connection error | PostgreSQL not running or wrong credentials | Verify Docker containers are running: `docker compose ps`. Check `DATABASE_URL` in `.env`. |
| `ECONNREFUSED` on API startup | Redis not running | Verify Redis container: `docker compose ps`. Check `REDIS_URL` in `.env`. |
| Google OIDC redirect fails | Wrong redirect URI configured | Ensure `GOOGLE_REDIRECT_URI` matches what is configured in Google Cloud Console. For local dev: `http://localhost:3000/auth/callback`. |
| Host Agent fails to register | Invalid or expired bootstrap token | Generate a new bootstrap token. Tokens expire after 24 hours. |
| WireGuard tunnel fails to establish | WireGuard tools not installed, or insufficient permissions | Install WireGuard tools. On Windows, run as Administrator. On Linux, run with `sudo`. |
| Client cannot connect to host | Firewall blocking UDP 51820 | Ensure the gateway's UDP port 51820 is accessible. Check security groups in AWS. |
| `ERR_MODULE_NOT_FOUND` in Control Plane | Missing npm dependencies | Run `npm install` in the `control-plane/` directory. |
| Terraform state lock error | Previous Terraform operation interrupted | Run `terraform force-unlock <LOCK_ID>` (use with caution). |
| Database migration conflict | Multiple developers migrated simultaneously | Coordinate migrations. Use `prisma migrate resolve` to mark conflicting migration as applied. |

### Useful Commands

```bash
# View Control Plane logs
cd control-plane && npm run dev  # stdout in development

# View Docker container logs
docker compose -f infra/docker-compose.yml logs -f postgres
docker compose -f infra/docker-compose.yml logs -f redis

# Connect to local database
psql postgresql://nvstream:nvstream_dev@localhost:5432/nvstream

# Open Prisma Studio (visual database browser)
cd control-plane && npx prisma studio

# Reset local database (caution: destroys all data)
cd control-plane && npx prisma migrate reset

# Check host agent connectivity
cd host-agent && go run ./cmd/agent --config config.yaml --check-connectivity

# Verify WireGuard interface
wg show

# Test API endpoint
curl -v http://localhost:4000/api/v1/health
```

### Getting Help

- Check the architecture docs: [docs/architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md)
- Check the security docs: [docs/security/SECURITY.md](./security/SECURITY.md)
- File an issue on GitHub with the `bug` or `question` label
- Include logs, error messages, and your environment details (OS, Node.js version, Go version)

---

## References

- [ARCHITECTURE.md](./architecture/ARCHITECTURE.md) -- System architecture
- [SECURITY.md](./security/SECURITY.md) -- Security model
- [DATA_MODEL.md](./architecture/DATA_MODEL.md) -- Database schema
- [UI_WIREFLOW.md](./architecture/UI_WIREFLOW.md) -- UI wireflow descriptions
