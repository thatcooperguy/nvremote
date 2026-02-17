# NVIDIA Remote Stream -- System Architecture

**Version:** 1.0
**Last Updated:** 2026-02-13
**Status:** Living Document

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Design Principles](#design-principles)
3. [Component Architecture](#component-architecture)
4. [Component Diagram](#component-diagram)
5. [Component Descriptions](#component-descriptions)
6. [Data Flow: Connection Establishment](#data-flow-connection-establishment)
7. [Technology Stack](#technology-stack)
8. [Data Model Overview](#data-model-overview)
9. [API Design](#api-design)
10. [Networking Architecture](#networking-architecture)
11. [Deployment Architecture](#deployment-architecture)

---

## System Overview

NVIDIA Remote Stream enables secure remote access to `nvremote-host.exe` hosts over the
internet via a WireGuard overlay network. The system allows authenticated users within
an organization to discover, connect to, and stream from GPU-equipped Windows machines
running NVIDIA's nvremote-host software, regardless of network topology or NAT
configuration.

The platform solves three core problems:

1. **Discovery** -- Users need a reliable way to find and see the status of available
   streaming hosts across distributed locations.
2. **Connectivity** -- Hosts behind NATs, firewalls, and corporate networks must be
   reachable without requiring port forwarding or VPN appliances.
3. **Security** -- All connections must be authenticated, authorized, encrypted, and
   auditable. No host should be directly exposed to the public internet.

The system achieves this by combining a centralized control plane for authentication,
authorization, and signaling with a decentralized WireGuard mesh for actual data
transport. The control plane never sees streaming traffic; it only brokers the
establishment of point-to-point encrypted tunnels.

---

## Design Principles

| Principle | Description |
|---|---|
| **Zero Trust** | Every request is authenticated and authorized. No implicit trust based on network location. |
| **Least Privilege** | Components and users receive only the permissions required for their function. |
| **Defense in Depth** | Multiple independent security layers: OIDC, JWT, RBAC, mTLS, WireGuard, ephemeral keys. |
| **Ephemeral by Default** | Session keys, tunnel configurations, and tokens are short-lived and non-reusable. |
| **Control/Data Separation** | The control plane handles signaling and policy; the data plane handles streaming traffic. These never share a path. |
| **Observable** | Every significant action produces an audit log entry. Metrics are exported for all components. |

---

## Component Architecture

The system is composed of five primary components and two external dependencies.

### Component Diagram

```
+------------------------------------------------------------------+
|                        INTERNET                                  |
+------------------------------------------------------------------+
       |                    |                         |
       |  HTTPS (443)      |  HTTPS (443)            |  UDP (51820)
       |                    |  WSS (443)              |
       v                    v                         v
+-------------+    +-----------------+         +-------------+
|   Client    |    |  Control Plane  |         |   Gateway   |
|  Desktop    |    |     API         |         |  (WireGuard |
|  App        |    |                 |         |   Relay)    |
| (Electron)  |    | +-------------+|         |             |
|             |    | | Auth Service ||         | +---------+ |
| +---------+ |    | +-------------+|         | |  wg0    | |
| | wg-quick| |    | | Session Svc ||         | |interface| |
| | tunnel  | |    | +-------------+|         | +---------+ |
| +---------+ |    | | Host Reg Svc||         +------+------+
+------+------+    | +-------------+|                |
       |           | | WebSocket   ||                |
       |           | | Gateway     ||                |
       |           | +-------------+|                |
       |           +---------+------+                |
       |                     |                       |
       |              +------+------+                |
       |              |  PostgreSQL |                |
       |              |  Database   |                |
       |              +-------------+                |
       |                                             |
       |  WireGuard tunnel (10.100.0.0/16)           |
       +---------------------------------------------+
       |
       v
+------+------+
|  Host Agent |
| (Go binary) |
|             |
| +---------+ |
| | wg-quick| |
| | tunnel  | |
| +---------+ |
| +---------+ |
| |nvremote-host| |
| |  .exe    | |
| +---------+ |
+-------------+
```

### Simplified Request Flow

```
User        Client App       Control Plane       Gateway        Host Agent    nvremote-host
 |              |                  |                 |               |              |
 |--Sign In---->|                  |                 |               |              |
 |              |--OIDC Auth------>|                 |               |              |
 |              |<--JWT------------|                 |               |              |
 |              |                  |                 |               |              |
 |--View Hosts->|                  |                 |               |              |
 |              |--GET /hosts----->|                 |               |              |
 |              |<--Host List------|                 |               |              |
 |              |                  |                 |               |              |
 |--Connect---->|                  |                 |               |              |
 |              |--POST /sessions->|                 |               |              |
 |              |                  |--Assign IPs---->|               |              |
 |              |                  |--WS: offer----->|----tunnel---->|              |
 |              |                  |<--WS: answer----|<---tunnel-----|              |
 |              |<--Session + Keys-|                 |               |              |
 |              |                  |                 |               |              |
 |              |==WireGuard Tunnel (10.100.x.y <-> 10.100.x.z)===>|              |
 |              |                  |                 |               |              |
 |              |--nvremote-host traffic (encrypted)----|-------------->|--local IPC-->|
 |              |                  |                 |               |              |
```

---

## Component Descriptions

### 1. Client Desktop Application

- **Runtime:** Electron 30+ with Node.js backend
- **Purpose:** Provides the user interface for authentication, host discovery, session
  initiation, and stream viewing.
- **Key Responsibilities:**
  - Google OIDC authentication via system browser redirect
  - JWT token management (access + refresh)
  - Display host list with real-time status updates via WebSocket
  - Generate ephemeral WireGuard keypair per session
  - Configure local WireGuard tunnel interface
  - Launch nvremote-host client pointed at tunnel IP
  - Tear down tunnel on session end
- **Local Dependencies:** WireGuard tools (`wg`, `wg-quick`) installed on the client OS

### 2. Control Plane API

- **Runtime:** Node.js 20+ with Express/Fastify
- **Purpose:** Central authority for authentication, authorization, host registration,
  session brokering, and audit logging.
- **Key Responsibilities:**
  - Validate Google OIDC tokens, issue signed JWTs
  - Manage organization membership and RBAC
  - Accept host registrations (bootstrap token + mTLS)
  - Maintain host status via heartbeat WebSocket
  - Broker session establishment (assign tunnel IPs, relay WireGuard public keys)
  - Record all actions in audit log
- **Database:** PostgreSQL 15+ via Prisma ORM
- **Exposes:** REST API (HTTPS) + WebSocket (WSS) on port 443

### 3. Gateway (WireGuard Relay)

- **Runtime:** Linux host with WireGuard kernel module, managed by a Go sidecar
- **Purpose:** Acts as a relay/router for WireGuard traffic when direct peer-to-peer
  connectivity is not possible (NAT traversal failure, asymmetric firewalls).
- **Key Responsibilities:**
  - Maintain a WireGuard interface with dynamically managed peers
  - Route packets between client and host tunnel IPs
  - Accept peer configuration updates from the control plane via authenticated gRPC
  - Report bandwidth and connection metrics
- **Network:** Public UDP endpoint on port 51820. Internal overlay network
  10.100.0.0/16.
- **Scaling:** Horizontally scalable. Each gateway manages a subnet slice (e.g.,
  10.100.1.0/24 per gateway instance).

### 4. Host Agent

- **Runtime:** Go 1.22+ compiled binary, runs as a Windows service
- **Purpose:** Runs on each nvremote-host host machine. Manages the host's participation
  in the overlay network and interfaces with the local nvremote-host.exe process.
- **Key Responsibilities:**
  - Register with control plane using bootstrap token
  - Establish mTLS channel for ongoing communication
  - Maintain WebSocket heartbeat with control plane (report status, GPU info, load)
  - Generate ephemeral WireGuard keypair per session
  - Configure local WireGuard tunnel interface for incoming sessions
  - Monitor nvremote-host.exe process health
  - Tear down tunnel on session termination
- **Local Dependencies:** WireGuard tools, nvremote-host.exe

### 5. nvremote-host.exe

- **Runtime:** C++17 native binary (built from `libs/nvremote-host`)
- **Purpose:** The GPU streaming engine. Captures GPU frames via NvFBC, encodes via
  NVENC, and streams to a connected client.
- **Integration:** The Host Agent does not modify or wrap nvremote-host.exe. It ensures
  nvremote-host is running and listening on the WireGuard tunnel interface IP. The client
  connects to nvremote-host over the tunnel as if it were on a local network.

---

## Data Flow: Connection Establishment

The following describes the complete sequence of events when a user initiates a
streaming session.

### Prerequisites

- User is authenticated (holds valid JWT)
- Host is registered, online, and reporting healthy status
- User has `Member` or `Admin` role in the organization that owns the host

### Step-by-Step Flow

```
Step  Actor            Action
----  -----            ------
 1    User             Clicks "Connect" on a host card in the Client App.

 2    Client App       Generates an ephemeral WireGuard keypair:
                         - client_private_key (kept in memory, never transmitted)
                         - client_public_key

 3    Client App       Sends POST /api/v1/sessions to Control Plane:
                         {
                           host_id: "uuid",
                           client_public_key: "base64-encoded"
                         }
                       Authorization: Bearer <JWT>

 4    Control Plane    Validates JWT. Checks RBAC: user must be Member or Admin in
                       the org that owns the target host. Checks host status is ONLINE.

 5    Control Plane    Allocates tunnel IPs from the 10.100.0.0/16 pool:
                         - client_tunnel_ip: e.g., 10.100.42.2
                         - host_tunnel_ip:   e.g., 10.100.42.3
                       Creates session record in database with status PENDING.

 6    Control Plane    Sends session offer to Host Agent via WebSocket:
                         {
                           session_id: "uuid",
                           client_public_key: "base64",
                           client_tunnel_ip: "10.100.42.2",
                           host_tunnel_ip: "10.100.42.3",
                           gateway_endpoint: "gw1.nvstream.example.com:51820",
                           gateway_public_key: "base64"
                         }

 7    Host Agent       Receives session offer. Generates ephemeral WireGuard keypair:
                         - host_private_key (kept in memory)
                         - host_public_key

 8    Host Agent       Configures WireGuard interface:
                         [Interface]
                         PrivateKey = <host_private_key>
                         Address = 10.100.42.3/32

                         [Peer]
                         PublicKey = <client_public_key>
                         AllowedIPs = 10.100.42.2/32
                         Endpoint = <gateway_endpoint>  (if relayed)

 9    Host Agent       Ensures nvremote-host.exe is listening and bound to 10.100.42.3.

10    Host Agent       Sends session answer back via WebSocket:
                         {
                           session_id: "uuid",
                           host_public_key: "base64",
                           status: "READY"
                         }

11    Control Plane    Updates session record to status ACTIVE.
                       Writes audit log entry.

12    Control Plane    Sends session details to Client App via REST response
                       (or WebSocket push):
                         {
                           session_id: "uuid",
                           host_public_key: "base64",
                           client_tunnel_ip: "10.100.42.2",
                           host_tunnel_ip: "10.100.42.3",
                           gateway_endpoint: "gw1.nvstream.example.com:51820",
                           gateway_public_key: "base64"
                         }

13    Client App       Configures WireGuard interface:
                         [Interface]
                         PrivateKey = <client_private_key>
                         Address = 10.100.42.2/32

                         [Peer]
                         PublicKey = <host_public_key>
                         AllowedIPs = 10.100.42.3/32
                         Endpoint = <gateway_endpoint>

14    Client App       Verifies tunnel connectivity by pinging 10.100.42.3.

15    Client App       Launches nvremote-host client, connecting to 10.100.42.3.
                       Streaming begins.

16    Client App       Opens the session active overlay in the UI. The user sees
                       the remote stream with a floating control bar.
```

### Session Teardown

```
Step  Actor            Action
----  -----            ------
 1    User             Clicks "Disconnect" or closes the Client App.

 2    Client App       Sends DELETE /api/v1/sessions/:session_id to Control Plane.

 3    Control Plane    Updates session record to status TERMINATED.
                       Writes audit log entry.
                       Notifies Host Agent via WebSocket.

 4    Host Agent       Tears down WireGuard tunnel interface.
                       Discards ephemeral keys.
                       Confirms teardown via WebSocket.

 5    Client App       Tears down local WireGuard tunnel interface.
                       Discards ephemeral keys.
                       Returns to dashboard.

 6    Control Plane    Releases tunnel IPs back to the allocation pool.
                       Notifies Gateway to remove peer entries.
```

---

## Technology Stack

| Layer | Technology | Version | Justification |
|---|---|---|---|
| **Client App** | Electron | 30+ | Cross-platform desktop app with native OS integration for WireGuard tunnel management. Mature ecosystem for GPU-accelerated rendering of streamed content. |
| **Client UI** | React + TypeScript | React 18, TS 5.4+ | Type safety reduces bugs in complex state management (session lifecycle, tunnel status). React's component model maps cleanly to the host card / session overlay UI. |
| **Client Styling** | Tailwind CSS | 3.4+ | Utility-first approach enables rapid implementation of NVIDIA design system. Purge ensures minimal bundle size. |
| **Control Plane API** | Node.js + Fastify | Node 20 LTS, Fastify 4 | High-performance HTTP and WebSocket handling. Non-blocking I/O is ideal for the connection-brokering workload (many concurrent WebSocket connections, minimal CPU-bound work). |
| **API Validation** | Zod | 3.22+ | Runtime schema validation that co-locates with TypeScript types. Eliminates an entire class of input validation bugs. |
| **ORM** | Prisma | 5.10+ | Type-safe database access with migration management. Generates TypeScript types from the schema, eliminating drift between code and database. |
| **Database** | PostgreSQL | 15+ | ACID compliance for session and audit data. Row-level security capabilities for future multi-tenant isolation. JSONB for flexible metadata storage. |
| **Host Agent** | Go | 1.22+ | Compiles to a single static binary with no runtime dependencies -- critical for deployment on customer Windows machines. Low memory footprint. Excellent concurrency primitives for managing WireGuard and nvremote-host subprocesses. |
| **Gateway Sidecar** | Go | 1.22+ | Same justification as Host Agent. Additionally, Go's `golang.zx2c4.com/wireguard` library provides native WireGuard integration without shelling out. |
| **VPN Overlay** | WireGuard | Latest kernel module / wireguard-go | State-of-the-art encrypted tunnel with minimal overhead. ~3% throughput penalty vs unencrypted. Sub-millisecond handshake. Formally verified cryptographic primitives (Noise protocol framework, ChaCha20, Poly1305, Curve25519, BLAKE2s). |
| **Infrastructure** | Terraform + GCP/AWS | Terraform 1.7+ | Declarative infrastructure as code. Managed service runs on GCP (Cloud Run, Cloud SQL). Self-hosted option supports GCP or AWS via Terraform modules. |
| **CI/CD** | GitHub Actions | N/A | Native integration with the repository. Supports matrix builds for multi-platform Electron builds (Windows, macOS, Linux). |
| **Observability** | OpenTelemetry + Grafana | OTel SDK 1.x | Vendor-neutral telemetry collection. Traces span from client through control plane to host agent, enabling end-to-end latency analysis. |

---

## Data Model Overview

The full data model is documented in [DATA_MODEL.md](./DATA_MODEL.md). Below is a
summary of the core entities and their relationships.

### Entity Relationship Summary

```
+----------+       +-------------+       +----------+
|  users   |------>| org_members |<------| orgs     |
+----------+  N:M  +-------------+  N:M  +----------+
     |                                        |
     | 1:N                                    | 1:N
     v                                        v
+----------+                            +----------+
| sessions |--------------------------->|  hosts   |
+----------+          N:1               +----------+
     |
     | 1:N
     v
+------------+
| audit_logs |
+------------+
```

### Core Tables

| Table | Purpose |
|---|---|
| `users` | Authenticated user accounts (sourced from Google OIDC). |
| `orgs` | Organizations that own hosts and contain members. |
| `org_members` | Join table linking users to orgs with a role (admin, member, guest). |
| `hosts` | Registered nvremote-host host machines. Each belongs to one org. |
| `sessions` | Active or historical streaming sessions between a user and a host. |
| `audit_logs` | Immutable append-only log of all security-relevant events. |

---

## API Design

The control plane exposes a REST API for CRUD operations and a WebSocket API for
real-time communication.

### Base URL

```
https://api.nvstream.example.com/api/v1
```

### Authentication

All endpoints (except `/auth/*`) require a Bearer JWT in the `Authorization` header.

### REST Endpoints

| Method | Path | Description | Auth | Roles |
|---|---|---|---|---|
| `POST` | `/auth/google` | Exchange Google OIDC code for JWT pair | None | Any |
| `POST` | `/auth/refresh` | Refresh access token | Refresh token | Any |
| `POST` | `/auth/logout` | Revoke refresh token | Bearer JWT | Any |
| `GET` | `/users/me` | Get current user profile | Bearer JWT | Any |
| `PUT` | `/users/me` | Update current user profile | Bearer JWT | Any |
| `POST` | `/orgs` | Create a new organization | Bearer JWT | Any (becomes Admin) |
| `GET` | `/orgs/:orgId` | Get organization details | Bearer JWT | Member+ |
| `PUT` | `/orgs/:orgId` | Update organization | Bearer JWT | Admin |
| `GET` | `/orgs/:orgId/members` | List organization members | Bearer JWT | Member+ |
| `POST` | `/orgs/:orgId/members` | Invite a member | Bearer JWT | Admin |
| `DELETE` | `/orgs/:orgId/members/:userId` | Remove a member | Bearer JWT | Admin |
| `PATCH` | `/orgs/:orgId/members/:userId` | Change member role | Bearer JWT | Admin |
| `GET` | `/orgs/:orgId/hosts` | List hosts in organization | Bearer JWT | Member+ |
| `POST` | `/orgs/:orgId/hosts` | Register a new host (bootstrap) | Bootstrap token | N/A |
| `GET` | `/hosts/:hostId` | Get host details | Bearer JWT | Member+ |
| `DELETE` | `/hosts/:hostId` | Deregister a host | Bearer JWT | Admin |
| `GET` | `/hosts/:hostId/status` | Get host real-time status | Bearer JWT | Member+ |
| `POST` | `/sessions` | Create a new streaming session | Bearer JWT | Member+ |
| `GET` | `/sessions/:sessionId` | Get session details | Bearer JWT | Owner/Admin |
| `DELETE` | `/sessions/:sessionId` | Terminate a session | Bearer JWT | Owner/Admin |
| `GET` | `/sessions` | List user's sessions (with filters) | Bearer JWT | Any |
| `GET` | `/orgs/:orgId/audit-logs` | Query audit logs | Bearer JWT | Admin |

### WebSocket Endpoints

| Path | Direction | Purpose |
|---|---|---|
| `/ws/host` | Host Agent <-> Control Plane | Host heartbeat, status updates, session offer/answer signaling. Authenticated via mTLS client certificate. |
| `/ws/client` | Client App <-> Control Plane | Real-time host status updates, session state changes. Authenticated via JWT (sent as first message after connection). |

### WebSocket Message Types

**Host Channel (`/ws/host`):**

```jsonc
// Host -> Control Plane: Heartbeat
{
  "type": "heartbeat",
  "host_id": "uuid",
  "timestamp": "ISO8601",
  "payload": {
    "cpu_usage": 12.5,
    "gpu_usage": 45.0,
    "gpu_name": "RTX 4090",
    "gpu_vram_total_mb": 24576,
    "gpu_vram_used_mb": 4096,
    "nvremote-host_running": true,
    "active_sessions": 0,
    "uptime_seconds": 86400
  }
}

// Control Plane -> Host: Session Offer
{
  "type": "session_offer",
  "session_id": "uuid",
  "client_public_key": "base64",
  "client_tunnel_ip": "10.100.42.2",
  "host_tunnel_ip": "10.100.42.3",
  "gateway_endpoint": "gw1.nvstream.example.com:51820",
  "gateway_public_key": "base64"
}

// Host -> Control Plane: Session Answer
{
  "type": "session_answer",
  "session_id": "uuid",
  "host_public_key": "base64",
  "status": "READY"  // or "REJECTED" with reason
}
```

**Client Channel (`/ws/client`):**

```jsonc
// Control Plane -> Client: Host Status Update
{
  "type": "host_status",
  "host_id": "uuid",
  "status": "ONLINE",  // ONLINE | OFFLINE | BUSY
  "gpu_usage": 45.0,
  "active_sessions": 1,
  "updated_at": "ISO8601"
}

// Control Plane -> Client: Session State Change
{
  "type": "session_update",
  "session_id": "uuid",
  "status": "ACTIVE",  // PENDING | ACTIVE | TERMINATED | FAILED
  "host_public_key": "base64",   // only on ACTIVE
  "host_tunnel_ip": "10.100.42.3",
  "client_tunnel_ip": "10.100.42.2"
}
```

### Error Response Format

All API errors follow a consistent structure:

```json
{
  "error": {
    "code": "SESSION_HOST_OFFLINE",
    "message": "The target host is not currently online.",
    "details": {
      "host_id": "uuid",
      "last_seen": "ISO8601"
    }
  }
}
```

HTTP status codes follow standard REST conventions: 400 (validation), 401
(unauthenticated), 403 (unauthorized), 404 (not found), 409 (conflict), 500 (server
error).

---

## Networking Architecture

### Overlay Network Design

The system uses WireGuard to create an overlay network in the `10.100.0.0/16` address
space. This provides 65,534 usable addresses, supporting up to approximately 32,767
simultaneous sessions (each session consumes two IPs: one for the client, one for the
host).

### IP Allocation Strategy

```
10.100.0.0/16          -- Full overlay range
10.100.0.1             -- Reserved (gateway primary)
10.100.0.2-10.100.0.254  -- Reserved (gateway instances)
10.100.1.0/24          -- Reserved (infrastructure)
10.100.2.0 - 10.100.255.254  -- Dynamic session allocation
```

Session IPs are allocated in pairs from the dynamic range. The control plane maintains
an allocation table in PostgreSQL to prevent collisions. IPs are released back to the
pool when a session terminates.

### WireGuard Topology

```
                    +---------------------+
                    |  Gateway Cluster    |
                    |                     |
                    |  wg0: 10.100.0.1   |
                    |  UDP: 0.0.0.0:51820|
                    +----------+----------+
                         |    |
            WireGuard    |    |    WireGuard
            tunnel       |    |    tunnel
                         |    |
              +----------+    +----------+
              |                          |
    +---------+---------+    +-----------+---------+
    |  Client           |    |  Host Agent         |
    |  wg0: 10.100.42.2 |    |  wg0: 10.100.42.3  |
    |  Peer: host key   |    |  Peer: client key   |
    |  Endpoint: gateway |    |  Endpoint: gateway  |
    +-------------------+    +---------------------+
              |                          |
              +----- Encrypted Tunnel ---+
                  (routed via Gateway)
```

### Signaling vs. Data Path

A critical architectural decision is the separation of signaling from data transport:

- **Signaling Path** (control plane): HTTPS/WSS over the public internet. Carries
  authentication tokens, session negotiation messages, and WireGuard public keys.
  Never carries streaming data. Protected by TLS 1.3.

- **Data Path** (overlay network): WireGuard UDP tunnels. Carries nvremote-host video/
  audio traffic. Encrypted by WireGuard (ChaCha20-Poly1305). The control plane has
  no visibility into this traffic.

This separation ensures that:
1. Compromise of the control plane does not expose streaming content.
2. Streaming traffic does not flow through the control plane (no bottleneck).
3. The gateway can be scaled independently of the control plane.

### NAT Traversal Strategy

1. **Direct connectivity check:** Before routing through the gateway, the client and
   host attempt a direct WireGuard handshake using STUN-discovered public endpoints.
2. **Gateway relay (fallback):** If the direct handshake fails within 3 seconds, both
   peers are configured with the gateway as their endpoint. The gateway forwards
   packets between the two peers.
3. **Persistent keepalive:** Both peers send keepalive packets every 25 seconds to
   maintain NAT mappings.

---

## Deployment Architecture

NVRemote supports two deployment models: a **managed service** (hosted by NVRemote)
and **self-hosted** (you run the control plane on your own infrastructure).

### Managed Service (Default)

The managed service runs on Google Cloud Platform:

```
+-------------------------------------------------------+
|  GCP (us-west1)                                       |
|                                                       |
|  +------------------+    +------------------------+   |
|  |  Cloud Run       |--->|  Control Plane API     |   |
|  |  (HTTPS, auto-TLS)|   |  (NestJS, auto-scaled) |   |
|  +------------------+    +------------------------+   |
|                                     |                 |
|                          +----------+----------+      |
|                          |  Cloud SQL          |      |
|                          |  PostgreSQL 15      |      |
|                          +---------------------+      |
|                                                       |
|  +------------------+                                 |
|  |  Compute Engine  |    Gateway instances             |
|  |  (UDP 51820)     |    (WireGuard relay)             |
|  +------------------+                                 |
|                                                       |
|  +------------------+                                 |
|  |  Cloud Run       |    Website + Dashboard           |
|  |  (Next.js)       |    (nvremote.com)                |
|  +------------------+                                 |
+-------------------------------------------------------+
```

Customers using the managed service only need to install the host agent and
sign in from a client -- no infrastructure to manage.

### Self-Hosted Deployment

For users who need to run NVRemote on their own infrastructure (privacy,
compliance, air-gapped networks), the `infra/` directory provides Terraform
modules and deployment scripts for both GCP and AWS.

**Self-hosted deploys a single VM** running Docker Compose with the control
plane API, PostgreSQL, Redis, and WireGuard gateway:

```
+-------------------------------------------------------+
|  Your Cloud (GCP, AWS, or bare metal)                 |
|                                                       |
|  +--------------------------------------------------+|
|  |  VM (e2-small / t3.small)                         ||
|  |                                                   ||
|  |  +-------------+  +-------------+  +-----------+ ||
|  |  | nginx (443) |  | server-api  |  | gateway   | ||
|  |  | TLS + proxy |  | (NestJS)    |  | (WireGuard)| ||
|  |  +-------------+  +-------------+  +-----------+ ||
|  |                          |                        ||
|  |         +----------------+----------------+       ||
|  |         | PostgreSQL     | Redis          |       ||
|  |         +----------------+----------------+       ||
|  +--------------------------------------------------+|
+-------------------------------------------------------+
```

See [GETTING_STARTED.md](../GETTING_STARTED.md#self-hosted-deployment) for
deployment instructions.

### Scaling Considerations

| Component | Scaling Strategy | Trigger |
|---|---|---|
| Control Plane | Horizontal (Cloud Run instances or multiple VMs) | CPU > 60% or request latency > 200ms |
| Gateway | Horizontal (additional VMs with subnet partitioning) | Active tunnel count > 500 per instance |
| Database | Vertical (instance class) + read replicas | Connection count or query latency |

### Multi-Region (Future)

The architecture supports future multi-region deployment by:
- Partitioning the 10.100.0.0/16 space by region (e.g., us-west: 10.100.0.0/18,
  eu-west: 10.100.64.0/18)
- Running independent control plane instances per region with cross-region database
  replication
- Using GeoDNS to route clients to the nearest control plane
- Enabling cross-region gateway peering for inter-region sessions

---

## References

- [DATA_MODEL.md](./DATA_MODEL.md) -- Detailed database schema
- [SECURITY.md](../security/SECURITY.md) -- Security model and threat analysis
- [UI_WIREFLOW.md](./UI_WIREFLOW.md) -- UI wireflow descriptions
- [GETTING_STARTED.md](../GETTING_STARTED.md) -- Development setup guide
