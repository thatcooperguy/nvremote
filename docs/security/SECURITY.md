# NVIDIA Remote Stream -- Security Model

**Version:** 1.0
**Last Updated:** 2026-02-13
**Status:** Living Document
**Classification:** Internal

---

## Table of Contents

1. [Security Objectives](#security-objectives)
2. [Threat Model](#threat-model)
3. [Authentication (AuthN)](#authentication-authn)
4. [Authorization (AuthZ)](#authorization-authz)
5. [Host Authentication](#host-authentication)
6. [Session Security](#session-security)
7. [Network Security](#network-security)
8. [Data Protection](#data-protection)
9. [Audit Logging](#audit-logging)
10. [Incident Response](#incident-response)
11. [Compliance Considerations](#compliance-considerations)

---

## Security Objectives

| Objective | Description |
|---|---|
| **Confidentiality** | Streaming content and control messages are encrypted end-to-end. No intermediate component (including the gateway) can decrypt streaming traffic. |
| **Integrity** | All API requests are validated and authenticated. WireGuard provides authenticated encryption, preventing tampering with tunnel traffic. |
| **Availability** | The system tolerates component failures without exposing hosts to unauthorized access. Fail-closed behavior is enforced everywhere. |
| **Non-repudiation** | All security-relevant actions are recorded in an immutable audit log with actor identity, timestamp, and action details. |
| **Least Privilege** | Users, hosts, and components receive only the permissions necessary for their function. Session keys are scoped to a single connection. |

---

## Threat Model

### Threat Actors

| Actor | Capability | Motivation |
|---|---|---|
| **External Attacker** | Network access, public tooling, credential stuffing | Unauthorized access to GPU resources, data exfiltration |
| **Malicious Insider** | Valid credentials, organization membership | Privilege escalation, unauthorized access to hosts outside their scope |
| **Compromised Host** | Full control of one host machine | Lateral movement to other hosts, data exfiltration from other sessions |
| **Network Adversary** | Passive or active network position (ISP, coffee shop WiFi) | Eavesdropping, man-in-the-middle attacks, session hijacking |
| **Compromised Gateway** | Full control of the gateway relay | Traffic analysis, denial of service, attempted decryption |

### Threat Analysis

#### T1: Unauthorized Access to Host

**Description:** An attacker gains streaming access to an NVRemote host without
proper authentication or authorization.

**Attack Vectors:**
- Stolen or forged JWT tokens
- Bypassed RBAC checks
- Replayed session establishment messages
- Direct connection to host bypassing the control plane

**Mitigations:**
- JWTs are signed with RS256 (RSA 2048-bit keys). Signing key is stored in a
  cloud secret manager and rotated every 90 days.
- Access tokens expire in 15 minutes. Even if stolen, the window of exploitation is
  narrow.
- RBAC is enforced at the API layer AND at the database query layer (defense in
  depth). Authorization checks are centralized in middleware, not scattered across
  handlers.
- Session offer messages include a server-generated nonce to prevent replay. Each
  session ID is a UUIDv4 used exactly once.
- Hosts accept WireGuard connections ONLY from peers whose public keys were delivered
  via the authenticated signaling channel. There is no listening port open to
  arbitrary connections.
- The nvremote-host.exe process binds exclusively to the WireGuard tunnel interface IP,
  not to 0.0.0.0. It is unreachable from the host's physical network.

**Residual Risk:** LOW. An attacker would need to compromise both the user's Google
account AND the control plane's signing key.

---

#### T2: Credential Theft

**Description:** An attacker obtains valid user credentials (Google account) or
tokens (JWT, refresh token).

**Attack Vectors:**
- Phishing for Google credentials
- Malware on the client machine capturing tokens from local storage
- Refresh token theft from compromised device

**Mitigations:**
- Authentication is delegated to Google OIDC. NVIDIA Remote Stream never handles or
  stores user passwords.
- Access tokens are stored in memory only (not localStorage or cookies). They are
  never written to disk.
- Refresh tokens are stored in an encrypted OS keychain (Windows Credential Manager /
  macOS Keychain / Linux libsecret).
- Refresh tokens are bound to the device. The server maintains a hash of the device
  fingerprint alongside the refresh token. Using a refresh token from a different
  device triggers revocation and alerts.
- Refresh tokens can be revoked server-side. Revoking a refresh token immediately
  prevents new access token issuance.
- All active sessions for a user can be terminated via the admin panel if compromise
  is suspected.

**Residual Risk:** MEDIUM. Google account compromise is outside our control but is
mitigated by Google's own security (2FA, anomaly detection).

---

#### T3: Man-in-the-Middle (MITM) Attack

**Description:** A network adversary intercepts communication between components to
eavesdrop or tamper with messages.

**Attack Vectors:**
- MITM on the HTTPS connection between Client App and Control Plane
- MITM on the WireGuard tunnel between Client and Host
- DNS spoofing to redirect client to a malicious control plane

**Mitigations:**
- All HTTPS connections enforce TLS 1.3 with certificate pinning in the Electron app.
  The app ships with the expected control plane certificate fingerprint.
- WireGuard tunnels use the Noise protocol framework with Curve25519 key exchange.
  This provides mutual authentication -- both peers must possess the correct private
  key. MITM is cryptographically impossible without the private key.
- DNS resolution for the control plane uses DNS-over-HTTPS (DoH) by default in the
  Electron app, preventing DNS spoofing.
- Certificate Transparency (CT) logs are monitored for unauthorized certificates
  issued for our domains.

**Residual Risk:** LOW. The combination of TLS 1.3, certificate pinning, WireGuard's
Noise protocol, and DoH makes MITM impractical.

---

#### T4: Lateral Movement from Compromised Host

**Description:** An attacker who has compromised one host machine attempts to access
other hosts or pivot through the overlay network.

**Attack Vectors:**
- Scanning the 10.100.0.0/16 overlay network from a compromised host
- Using the compromised host's WireGuard interface to reach other peers
- Extracting session keys from memory to impersonate peers

**Mitigations:**
- WireGuard's `AllowedIPs` configuration on each peer is set to the EXACT IP of the
  authorized counterpart (/32 mask). The kernel drops packets to any other
  destination. A compromised host cannot route traffic to any IP other than its
  current session partner.
- Session WireGuard keys are ephemeral -- generated per session and discarded on
  teardown. Compromising one session's keys provides zero access to past or future
  sessions.
- The gateway enforces routing rules that mirror the AllowedIPs constraints. Even if
  a host somehow forges source IPs, the gateway drops traffic that does not match the
  registered session pair.
- Host Agents do not have credentials to communicate with other Host Agents. Their
  mTLS certificates authorize communication only with the control plane.
- Network monitoring on the gateway detects anomalous traffic patterns (port scans,
  traffic to unallocated IPs) and triggers automatic session termination + alert.

**Residual Risk:** LOW. WireGuard's cryptographic routing combined with /32 AllowedIPs
provides hardware-firewall-equivalent isolation at the kernel level.

---

#### T5: Gateway Abuse

**Description:** An attacker compromises or abuses the gateway relay to disrupt or
surveil streaming sessions.

**Attack Vectors:**
- Compromising the gateway to capture encrypted tunnel traffic
- DDoS against the gateway to deny service
- Using the gateway to perform traffic analysis (who connects to whom)

**Mitigations:**
- The gateway relays WireGuard traffic that is encrypted end-to-end between the client
  and host. The gateway does not possess either peer's private key and cannot decrypt
  the traffic. This is architecturally guaranteed -- the gateway holds its own
  WireGuard keypair for routing, but the inner payload is encrypted with session-
  specific keys.
- Gateway instances can be deployed across multiple availability zones with load
  balancing. DDoS is mitigated by cloud provider protections (e.g., GCP Cloud Armor,
  AWS Shield).
- Traffic analysis is mitigated by:
  - Padding WireGuard packets to fixed sizes (512-byte minimum)
  - Using consistent keepalive intervals for all sessions
  - Not encoding session metadata in any packet header visible to the gateway
- Gateway instances are hardened: minimal OS, no SSH access in production,
  immutable infrastructure (replaced, never patched in place).
- Gateway configuration changes require mTLS authentication from the control plane.
  No human SSH access.

**Residual Risk:** LOW for confidentiality (end-to-end encryption). MEDIUM for
availability (DDoS resilience depends on cloud provider and configuration).

---

#### T6: Control Plane Compromise

**Description:** An attacker gains access to the control plane API server or its
database.

**Attack Vectors:**
- Exploiting a vulnerability in the API server code
- SQL injection to access or modify the database
- Compromising cloud credentials to access the infrastructure

**Mitigations:**
- Input validation on all API endpoints using Zod schemas. No raw SQL queries --
  all database access through Prisma ORM with parameterized queries.
- Control plane runs on Cloud Run (managed service) or Docker containers (self-hosted)
  with no SSH access in the managed deployment. Container images are scanned for
  vulnerabilities in CI/CD.
- Database credentials are stored securely and injected via environment variables.
  In the managed deployment, credentials are managed through GCP Secret Manager.
- The control plane does NOT store WireGuard private keys for any peer. It only
  relays public keys during session establishment. Even with full database access,
  an attacker cannot decrypt any session's traffic.
- Rate limiting is enforced at the load balancer and application layers to prevent
  brute-force attacks.
- Firewall rules limit inbound traffic to port 443 (HTTPS) for the control plane
  and port 51820 (UDP) for the WireGuard gateway.

**Residual Risk:** MEDIUM. Control plane compromise could allow unauthorized session
creation, but not decryption of existing sessions.

---

## Authentication (AuthN)

### User Authentication Flow

The system uses Google OIDC (OpenID Connect) as the sole identity provider. Users
never create passwords within the NVIDIA Remote Stream system.

```
+--------+          +------------+         +----------+         +-------------+
| User   |          | Client App |         | Google   |         | Control     |
|        |          | (Electron) |         | OIDC     |         | Plane API   |
+---+----+          +-----+------+         +----+-----+         +------+------+
    |                      |                     |                      |
    | 1. Click "Sign In"   |                     |                      |
    +--------------------->|                     |                      |
    |                      |                     |                      |
    |  2. Open system browser with Google auth URL                      |
    |  (includes PKCE code_challenge, state, nonce)                     |
    |<---------------------+                     |                      |
    |                      |                     |                      |
    | 3. User authenticates with Google           |                      |
    +------------------------------------------>|                      |
    |                      |                     |                      |
    | 4. Google redirects to localhost callback   |                      |
    |  (authorization_code + state)              |                      |
    |--------------------->|                     |                      |
    |                      |                     |                      |
    |                      | 5. POST /auth/google                       |
    |                      |  { code, code_verifier, redirect_uri }     |
    |                      +---------------------------------------------->|
    |                      |                     |                      |
    |                      |                     | 6. Exchange code     |
    |                      |                     |<---------------------+
    |                      |                     |                      |
    |                      |                     | 7. ID token + user info
    |                      |                     +--------------------->|
    |                      |                     |                      |
    |                      |                     |    8. Validate ID token
    |                      |                     |    (signature, nonce,
    |                      |                     |     iss, aud, exp)
    |                      |                     |                      |
    |                      |                     |    9. Upsert user record
    |                      |                     |                      |
    |                      |                     |   10. Generate JWT pair
    |                      |                     |                      |
    |                      | 11. { access_token, refresh_token, user }  |
    |                      |<----------------------------------------------+
    |                      |                     |                      |
    | 12. Authenticated    |                     |                      |
    |<---------------------+                     |                      |
```

### JWT Token Structure

**Access Token (15-minute lifetime):**

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "key-2026-01"
  },
  "payload": {
    "sub": "user_uuid",
    "email": "user@example.com",
    "name": "User Name",
    "iat": 1707840000,
    "exp": 1707840900,
    "iss": "https://api.nvstream.example.com",
    "aud": "nvstream-client",
    "jti": "unique-token-id",
    "org_memberships": [
      {
        "org_id": "org_uuid",
        "role": "admin"
      }
    ]
  }
}
```

**Refresh Token (7-day lifetime):**

```json
{
  "payload": {
    "sub": "user_uuid",
    "jti": "unique-refresh-token-id",
    "iat": 1707840000,
    "exp": 1708444800,
    "iss": "https://api.nvstream.example.com",
    "type": "refresh",
    "device_hash": "sha256-of-device-fingerprint"
  }
}
```

### Token Refresh Flow

```
1. Client detects access token will expire within 60 seconds.
2. Client sends POST /auth/refresh with refresh_token in request body.
3. Control Plane validates:
   a. Refresh token signature (RS256)
   b. Refresh token not expired
   c. Refresh token not revoked (checked against revocation table)
   d. Device hash matches current device
4. If valid:
   a. Issue new access token (15 min)
   b. Issue new refresh token (7 days) -- refresh token rotation
   c. Revoke the old refresh token
   d. Return both tokens
5. If invalid:
   a. Return 401 Unauthorized
   b. Client must re-authenticate via Google OIDC
```

### Token Security Properties

| Property | Implementation |
|---|---|
| **Short-lived access** | 15-minute expiry. Limits window if token is stolen. |
| **Refresh rotation** | Every refresh issues a new refresh token and revokes the old one. Detects token theft (old token reuse triggers full revocation). |
| **Device binding** | Refresh tokens include a device fingerprint hash. Use from a different device is rejected. |
| **Revocation** | Refresh tokens are tracked in the database. Revocation is immediate. Access tokens are stateless but short-lived, so revocation lag is max 15 min. |
| **PKCE** | Authorization Code flow uses PKCE (S256 method) to prevent authorization code interception. |
| **Key rotation** | RSA signing keys are rotated every 90 days. Old keys remain valid for verification (via `kid` header) during a 30-day overlap period. |

---

## Authorization (AuthZ)

### Role-Based Access Control (RBAC)

The system implements three roles, scoped per organization:

| Role | Description | Permissions |
|---|---|---|
| **Admin** | Organization administrator | Full control: manage members, manage hosts, create sessions, view audit logs, modify org settings |
| **Member** | Regular organization member | View hosts, create sessions to available hosts, view own session history |
| **Guest** | Limited access member | View hosts (read-only), no session creation, no host details beyond name and status |

### Permission Matrix

| Action | Guest | Member | Admin |
|---|---|---|---|
| View host list | Yes | Yes | Yes |
| View host details (GPU, metrics) | No | Yes | Yes |
| Create streaming session | No | Yes | Yes |
| Terminate own session | N/A | Yes | Yes |
| Terminate any session | No | No | Yes |
| View own session history | No | Yes | Yes |
| View all session history | No | No | Yes |
| Register new host | No | No | Yes |
| Deregister host | No | No | Yes |
| Invite members | No | No | Yes |
| Remove members | No | No | Yes |
| Change member roles | No | No | Yes |
| View audit logs | No | No | Yes |
| Modify org settings | No | No | Yes |
| Create organization | Yes* | Yes* | Yes* |
| Delete organization | No | No | Yes (own org only) |

*Any authenticated user can create a new organization, becoming its Admin.

### Authorization Enforcement

Authorization is enforced at three layers:

1. **API Middleware:** The `requireRole(role)` middleware extracts org membership
   from the JWT and verifies the required role before the request reaches the
   handler. This provides fail-fast rejection.

2. **Service Layer:** Business logic functions accept the authenticated user context
   and apply additional authorization rules (e.g., "can only terminate own session
   unless Admin").

3. **Database Layer:** Prisma queries include `WHERE org_id IN (user's org IDs)`
   clauses to prevent data leakage even if upper layers are bypassed.

```typescript
// Example: middleware chain for session creation
router.post('/sessions',
  authenticate(),           // Verify JWT, extract user
  requireOrgMember('member'), // Check org membership + role
  validateBody(CreateSessionSchema), // Validate input
  rateLimiter({ max: 10, window: '1m' }), // Rate limit
  sessionController.create  // Handler
);
```

---

## Host Authentication

### Bootstrap Registration

When a host is first set up, it must register with the control plane. This uses a
one-time bootstrap token generated by an organization admin.

```
1. Admin generates a bootstrap token via the web UI or API:
   POST /orgs/:orgId/hosts/bootstrap-token
   Response: { token: "nvs_bootstrap_xxxxxxxxxxxxxxxx", expires_at: "..." }

   The token is valid for 24 hours and can be used exactly once.

2. On the host machine, the administrator installs the Host Agent and configures it
   with the bootstrap token:
   > nvstream-agent.exe --bootstrap-token nvs_bootstrap_xxxxxxxxxxxxxxxx

3. The Host Agent sends a registration request:
   POST /orgs/:orgId/hosts
   Authorization: Bootstrap nvs_bootstrap_xxxxxxxxxxxxxxxx
   Body: {
     hostname: "WORKSTATION-01",
     gpu_info: { name: "RTX 4090", vram_mb: 24576, driver: "551.23" },
     os_info: { platform: "win32", version: "10.0.22631" }
   }

4. The Control Plane validates the bootstrap token and:
   a. Creates the host record in the database
   b. Generates a client certificate (signed by the platform CA) for the host
   c. Returns the certificate, CA certificate, and host ID
   d. Invalidates the bootstrap token

5. The Host Agent stores the client certificate in the Windows Certificate Store
   and uses it for all subsequent mTLS communication with the control plane.
```

### Ongoing Host Authentication (mTLS)

After bootstrap, all Host Agent communication uses mutual TLS:

- **Host -> Control Plane:** The Host Agent presents its client certificate. The
  control plane verifies it against the platform CA.
- **Control Plane -> Host:** The Host Agent verifies the control plane's server
  certificate against the pinned CA.

```
Certificate Hierarchy:
  NVIDIA Remote Stream Root CA (offline, HSM-backed)
    +-- Control Plane Server Certificate (auto-rotated via ACM)
    +-- Host Client Certificate (per-host, 1-year validity, revocable)
```

### Host Certificate Lifecycle

| Event | Action |
|---|---|
| **Bootstrap** | Issue initial client certificate (1-year validity) |
| **30 days before expiry** | Host Agent requests renewal via mTLS |
| **On renewal** | New certificate issued, old certificate added to CRL within 48h |
| **On deregistration** | Certificate immediately added to CRL |
| **On compromise** | Admin triggers emergency revocation; certificate added to CRL; all active sessions on host terminated |

### Certificate Revocation

The control plane maintains a Certificate Revocation List (CRL) that is checked on
every mTLS handshake. The CRL is distributed via an internal endpoint and cached with
a 5-minute TTL. OCSP stapling is used as an optimization to reduce per-request CRL
lookups.

---

## Session Security

### Ephemeral WireGuard Keys

Every streaming session uses a fresh WireGuard keypair on both the client and host
sides. This is the cornerstone of session isolation.

**Properties of ephemeral session keys:**

| Property | Detail |
|---|---|
| **Generation** | Ed25519/Curve25519 keypair generated in memory at session start |
| **Storage** | Private keys exist ONLY in process memory. Never written to disk. Never transmitted over any channel. |
| **Lifetime** | Exists for the duration of a single session. Destroyed on session termination. |
| **Scope** | Each keypair is authorized for exactly one peer (the session counterpart). |
| **Forward secrecy** | Compromise of one session's keys reveals nothing about past or future sessions. |
| **Rotation** | If a session exceeds 24 hours, automatic key rotation occurs: new keys are generated and exchanged via the signaling channel, and the WireGuard interface is reconfigured without interrupting the stream. |

### Key Exchange Security

The exchange of public keys during session establishment is protected by multiple
layers:

1. The client's public key is sent to the control plane over TLS 1.3 (HTTPS).
2. The control plane relays the client's public key to the host over mTLS
   (WebSocket).
3. The host's public key is returned to the control plane over mTLS, then to the
   client over TLS 1.3.
4. At no point are private keys transmitted. The control plane handles only public
   keys.
5. Even if all public keys are intercepted, an attacker cannot establish a WireGuard
   tunnel without the corresponding private keys.

### Session Lifecycle Security Events

Every session transition generates audit log entries:

```
SESSION_REQUESTED  -> User initiated session creation
SESSION_CREATED    -> Control plane allocated resources
SESSION_OFFER_SENT -> Offer delivered to host agent
SESSION_ACCEPTED   -> Host agent accepted and configured tunnel
SESSION_ACTIVE     -> Tunnel connectivity verified
SESSION_KEY_ROTATED -> 24-hour key rotation occurred
SESSION_TERMINATED -> Normal termination by user or admin
SESSION_FAILED     -> Session failed to establish (with reason)
SESSION_EXPIRED    -> Session exceeded maximum duration (configurable, default 8h)
SESSION_FORCE_TERMINATED -> Admin forced termination
```

---

## Network Security

### TLS Configuration

All HTTPS endpoints enforce:

```
Minimum TLS version: 1.3
Cipher suites: TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256
HSTS: max-age=31536000; includeSubDomains; preload
Certificate: RSA 2048-bit (ACM-managed, auto-renewed)
```

### WireGuard Cryptographic Properties

WireGuard uses the following cryptographic primitives (not configurable -- this is by
design to eliminate misconfiguration):

| Primitive | Usage |
|---|---|
| **Curve25519** | ECDH key exchange |
| **ChaCha20-Poly1305** | Authenticated encryption of tunnel traffic |
| **BLAKE2s** | Hashing |
| **SipHash24** | Hashtable keying |
| **HKDF** | Key derivation |

The Noise protocol framework (specifically Noise_IKpsk2) provides:
- Mutual authentication
- Forward secrecy
- Identity hiding (the initiator's identity is hidden from passive observers)

### Firewall Rules

**Host Agent (Windows):**
```
Inbound:  DENY ALL (no open ports)
Outbound: ALLOW UDP to gateway:51820 (WireGuard)
Outbound: ALLOW TCP to control-plane:443 (HTTPS/WSS)
```

**Gateway (Linux):**
```
Inbound:  ALLOW UDP 51820 from 0.0.0.0/0 (WireGuard)
Inbound:  DENY ALL other
Outbound: ALLOW UDP 51820 (WireGuard to peers)
Outbound: ALLOW TCP to control-plane:443 (gRPC/HTTPS)
```

**Control Plane:**
```
Inbound:  ALLOW TCP 443 (HTTPS from load balancer or direct)
Inbound:  DENY ALL other
Outbound: ALLOW TCP 5432 to database (PostgreSQL)
Outbound: ALLOW TCP 6379 to cache (Redis)
Outbound: ALLOW TCP 443 to 0.0.0.0/0 (Google OIDC, OCSP)
```

---

## Data Protection

### Data Classification

| Classification | Examples | Storage | Encryption |
|---|---|---|---|
| **Critical** | WireGuard private keys | Memory only (never persisted) | N/A (never at rest) |
| **Sensitive** | Refresh tokens, mTLS certificates | Encrypted OS keychain / cloud secret manager | AES-256 at rest |
| **Internal** | User profiles, org data, session records | PostgreSQL (managed or self-hosted) | AES-256 at rest |
| **Audit** | Audit log entries | PostgreSQL + cloud storage archives | AES-256 at rest, immutable |

### Encryption at Rest

| Store | Encryption | Key Management |
|---|---|---|
| PostgreSQL | AES-256 (cloud-managed encryption key) | Automatic rotation |
| Cloud storage (audit archives) | AES-256 (server-side encryption) | Cloud-managed |
| Redis | AES-256 (at-rest encryption enabled) | Cloud-managed |
| Client local storage | OS-level encryption (Windows DPAPI) | OS-managed |
| Host Agent certificates | Windows Certificate Store (DPAPI-backed) | OS-managed |

### Encryption in Transit

| Path | Protocol | Encryption |
|---|---|---|
| Client <-> Control Plane | HTTPS | TLS 1.3 |
| Host Agent <-> Control Plane | HTTPS/WSS | mTLS (TLS 1.3) |
| Client <-> Host (streaming) | WireGuard | ChaCha20-Poly1305 |
| Control Plane <-> Database | PostgreSQL protocol | TLS 1.3 (enforced via `sslmode=verify-full`) |
| Control Plane <-> Redis | Redis protocol | TLS 1.3 (in-transit encryption enabled) |

---

## Audit Logging

### Strategy

The audit logging system provides a complete, immutable record of all security-
relevant actions in the system. It is designed to support security investigations,
compliance audits, and anomaly detection.

### Logged Events

| Category | Events |
|---|---|
| **Authentication** | `USER_LOGIN`, `USER_LOGOUT`, `TOKEN_REFRESH`, `TOKEN_REVOKED`, `LOGIN_FAILED`, `DEVICE_MISMATCH` |
| **Authorization** | `ACCESS_DENIED`, `ROLE_INSUFFICIENT`, `RATE_LIMITED` |
| **Organization** | `ORG_CREATED`, `ORG_UPDATED`, `ORG_DELETED`, `MEMBER_INVITED`, `MEMBER_REMOVED`, `MEMBER_ROLE_CHANGED` |
| **Host Management** | `HOST_REGISTERED`, `HOST_DEREGISTERED`, `HOST_ONLINE`, `HOST_OFFLINE`, `HOST_CERT_ISSUED`, `HOST_CERT_REVOKED`, `HOST_CERT_RENEWED` |
| **Sessions** | `SESSION_REQUESTED`, `SESSION_CREATED`, `SESSION_ACTIVE`, `SESSION_TERMINATED`, `SESSION_FAILED`, `SESSION_EXPIRED`, `SESSION_FORCE_TERMINATED`, `SESSION_KEY_ROTATED` |
| **Admin Actions** | `BOOTSTRAP_TOKEN_GENERATED`, `EMERGENCY_REVOCATION`, `BULK_SESSION_TERMINATION`, `AUDIT_LOG_EXPORTED` |

### Audit Log Entry Structure

```json
{
  "id": "uuid",
  "timestamp": "2026-02-13T14:30:00.000Z",
  "event_type": "SESSION_CREATED",
  "severity": "INFO",
  "actor": {
    "type": "user",
    "id": "user_uuid",
    "email": "alice@example.com",
    "ip_address": "203.0.113.42",
    "user_agent": "NVStream-Client/1.0.0 (Windows 11)"
  },
  "resource": {
    "type": "session",
    "id": "session_uuid"
  },
  "org_id": "org_uuid",
  "context": {
    "host_id": "host_uuid",
    "host_name": "WORKSTATION-01",
    "client_tunnel_ip": "10.100.42.2",
    "host_tunnel_ip": "10.100.42.3"
  },
  "outcome": "SUCCESS",
  "metadata": {}
}
```

### Audit Log Properties

| Property | Implementation |
|---|---|
| **Immutability** | Audit log table has no UPDATE or DELETE permissions. Only INSERT is allowed. The application database user has row-level security preventing modification. |
| **Retention** | 90 days in PostgreSQL (hot storage, queryable via API). Archived to cloud storage daily in JSONL format (cold storage, retained for 7 years). |
| **Integrity** | Each log entry includes a SHA-256 hash chained to the previous entry (hash chain). Tampering with any entry invalidates the chain. |
| **Availability** | Audit log writes are asynchronous (enqueued to Redis, flushed to PostgreSQL in batches). This ensures audit logging does not impact API latency. If Redis is unavailable, logs are written synchronously as a fallback. |
| **Access** | Only organization Admins can read audit logs via the API. The API enforces pagination (max 100 entries per page) and requires date range filters to prevent unbounded queries. |
| **Export** | Admins can export audit logs as CSV or JSONL for external SIEM integration. Exports are themselves audit-logged. |

### Anomaly Detection

The following patterns trigger automatic alerts (via CloudWatch Alarms -> SNS ->
PagerDuty):

| Pattern | Threshold | Action |
|---|---|---|
| Failed login attempts | > 5 in 10 minutes for one user | Temporary account lock (30 min), alert |
| Unusual session volume | > 3x baseline for an org in 1 hour | Alert (no auto-action) |
| Host offline unexpectedly | Online host stops heartbeat for > 5 minutes | Alert, mark host OFFLINE |
| Refresh token reuse | Any use of a revoked refresh token | Revoke all tokens for user, alert |
| Session from new country | GeoIP of client IP differs from user's baseline | Alert (no auto-action) |
| Bulk member removal | > 5 members removed in 10 minutes | Alert |

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Example |
|---|---|---|---|
| **P0 -- Critical** | Active exploitation, data breach | 15 minutes | Unauthorized session access, control plane compromise |
| **P1 -- High** | Potential exploitation, service outage | 1 hour | Host cert compromise, gateway DDoS |
| **P2 -- Medium** | Security misconfiguration, anomaly | 4 hours | Elevated failed logins, unexpected host offline |
| **P3 -- Low** | Minor security improvement | Next business day | Certificate approaching expiry, dependency vulnerability |

### Response Playbooks

**Compromised User Account:**
1. Revoke all refresh tokens for the user (`DELETE /auth/revoke-all/:userId`)
2. Terminate all active sessions for the user
3. Notify the user out-of-band (email to registered address)
4. Review audit logs for unauthorized session creation
5. If sessions were created, audit those hosts for compromise indicators

**Compromised Host:**
1. Emergency-revoke the host's client certificate
2. Terminate all active sessions on the host
3. Mark host as DEREGISTERED in the database
4. Review audit logs for anomalous behavior
5. Notify the organization admin
6. Require fresh bootstrap registration after host is remediated

**Compromised Control Plane:**
1. Rotate JWT signing keys immediately
2. Revoke all refresh tokens (force all users to re-authenticate)
3. Rotate database credentials
4. Rotate mTLS CA (issue new host certificates)
5. Review audit logs (if integrity is intact)
6. Deploy from known-good container image
7. Notify all organization admins

---

## Compliance Considerations

| Framework | Relevance | Status |
|---|---|---|
| **SOC 2 Type II** | Audit logging, access controls, encryption | Architecture supports all trust service criteria. Formal audit not yet initiated. |
| **GDPR** | User data handling (email, name from Google) | Minimal PII collection. Data subject requests supported via user deletion API. |
| **HIPAA** | Potential use in healthcare settings | Application-level controls (audit logging, encryption, access controls) meet technical safeguard requirements. Cloud provider BAA available for managed deployments. |
| **NIST 800-53** | Federal deployment scenarios | Controls mapped to AC, AU, IA, SC families. Full mapping document in progress. |

---

## References

- [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) -- System architecture
- [DATA_MODEL.md](../architecture/DATA_MODEL.md) -- Database schema
- WireGuard Protocol: https://www.wireguard.com/protocol/
- Noise Protocol Framework: https://noiseprotocol.org/
- OWASP API Security Top 10: https://owasp.org/API-Security/
