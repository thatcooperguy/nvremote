# NVIDIA Remote Stream -- Data Model

**Version:** 1.0
**Last Updated:** 2026-02-13
**Status:** Living Document

---

## Table of Contents

1. [Overview](#overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Table Definitions](#table-definitions)
4. [Indexes](#indexes)
5. [Constraints and Validation Rules](#constraints-and-validation-rules)
6. [Prisma Schema](#prisma-schema)

---

## Overview

The data model supports the core operations of the NVIDIA Remote Stream platform:
user management, organization membership, host registration, session lifecycle, and
audit logging. The database is PostgreSQL 15+ accessed via Prisma ORM.

### Design Principles

- **UUIDs as primary keys** for all tables. Avoids sequential ID enumeration attacks
  and simplifies distributed ID generation.
- **Timestamps on all records** (`created_at`, `updated_at`) for debugging and audit
  trail support.
- **Soft deletes where appropriate** (`deleted_at` column) for entities that may need
  recovery or that have audit trail dependencies.
- **JSONB for extensible metadata** where the schema of supplementary data may evolve
  (GPU info, device info, session context).
- **Immutable audit log** with no UPDATE or DELETE operations permitted.

---

## Entity Relationship Diagram

```
+------------------+           +---------------------+           +------------------+
|     users        |           |    org_members      |           |      orgs        |
|------------------|           |---------------------|           |------------------|
| id          PK   |<---+  +->| id             PK   |<---+  +-->| id          PK   |
| google_id   UQ   |    |  |  | user_id        FK   |----+  |   | name             |
| email       UQ   |    +--+--| org_id         FK   |---------+  | slug        UQ   |
| name             |    |     | role           ENUM  |           | settings   JSONB |
| avatar_url       |    |     | invited_by     FK   |----+      | created_at       |
| created_at       |    |     | joined_at            |           | updated_at       |
| updated_at       |    |     | created_at           |           | deleted_at       |
| last_login_at    |    |     | updated_at           |           +------------------+
| deleted_at       |    |     +---------------------+                    |
+------------------+    |                                                |
        |               |                                                |
        | 1:N           | (invited_by)                                   | 1:N
        v               |                                                v
+------------------+    |                                    +------------------+
|    sessions      |    |                                    |     hosts        |
|------------------|    |                                    |------------------|
| id          PK   |    |                                    | id          PK   |
| user_id     FK   |----+                                    | org_id      FK   |
| host_id     FK   |---------------------------------------->| hostname         |
| status      ENUM |                                         | status      ENUM |
| client_pub_key   |                                         | gpu_info   JSONB |
| host_pub_key     |                                         | os_info    JSONB |
| client_tunnel_ip |                                         | last_heartbeat   |
| host_tunnel_ip   |                                         | cert_serial UQ   |
| gateway_endpoint |                                         | cert_expires_at  |
| started_at       |                                         | bootstrap_token  |
| ended_at         |                                         | registered_at    |
| terminated_by    |                                         | created_at       |
| termination_reason|                                        | updated_at       |
| metadata   JSONB |                                         | deleted_at       |
| created_at       |                                         +------------------+
| updated_at       |
+------------------+
        |
        | 1:N (contextual)
        v
+----------------------+
|    audit_logs        |
|----------------------|
| id            PK     |
| timestamp            |
| event_type    ENUM   |
| severity      ENUM   |
| actor_type    ENUM   |
| actor_id             |
| actor_email          |
| actor_ip             |
| actor_user_agent     |
| resource_type  ENUM  |
| resource_id          |
| org_id         FK    |
| session_id     FK    |
| context       JSONB  |
| outcome        ENUM  |
| prev_hash            |
| hash                 |
| created_at           |
+----------------------+

+----------------------+
| refresh_tokens       |
|----------------------|
| id            PK     |
| user_id       FK     |
| token_hash    UQ     |
| device_hash          |
| expires_at           |
| revoked_at           |
| created_at           |
+----------------------+

+----------------------+
| ip_allocations       |
|----------------------|
| id            PK     |
| session_id    FK UQ  |
| client_ip     UQ     |
| host_ip       UQ     |
| gateway_id           |
| allocated_at         |
| released_at          |
| created_at           |
+----------------------+

+----------------------+
| bootstrap_tokens     |
|----------------------|
| id            PK     |
| org_id        FK     |
| token_hash    UQ     |
| created_by    FK     |
| expires_at           |
| used_at              |
| used_by_host  FK     |
| created_at           |
+----------------------+
```

---

## Table Definitions

### users

Stores authenticated user accounts. Users are created or updated on first/subsequent
Google OIDC logins.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `google_id` | `VARCHAR(255)` | No | -- | Google account subject identifier. Unique. |
| `email` | `VARCHAR(320)` | No | -- | Email address from Google. Unique. |
| `name` | `VARCHAR(255)` | No | -- | Display name from Google profile. |
| `avatar_url` | `TEXT` | Yes | `NULL` | Profile picture URL from Google. |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Record creation time. |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Last update time. Updated on every modification. |
| `last_login_at` | `TIMESTAMPTZ` | Yes | `NULL` | Timestamp of the user's most recent login. |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Soft delete timestamp. Non-null means deleted. |

**Constraints:**
- `PK: id`
- `UNIQUE: google_id`
- `UNIQUE: email`

---

### orgs

Stores organizations. Each org is an isolated tenant that owns hosts and contains
members.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `name` | `VARCHAR(255)` | No | -- | Human-readable organization name. |
| `slug` | `VARCHAR(63)` | No | -- | URL-safe unique identifier (lowercase, hyphens). |
| `settings` | `JSONB` | No | `'{}'` | Organization settings (max session duration, allowed GPU types, etc.). |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Record creation time. |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Last update time. |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Soft delete timestamp. |

**Constraints:**
- `PK: id`
- `UNIQUE: slug`
- `CHECK: slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'` (valid slug format)

---

### org_members

Join table linking users to organizations with a role. A user can belong to multiple
organizations with different roles.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `user_id` | `UUID` | No | -- | FK to `users.id`. |
| `org_id` | `UUID` | No | -- | FK to `orgs.id`. |
| `role` | `ENUM('admin','member','guest')` | No | `'member'` | The user's role within this organization. |
| `invited_by` | `UUID` | Yes | `NULL` | FK to `users.id`. The user who invited this member. NULL for org creators. |
| `joined_at` | `TIMESTAMPTZ` | No | `now()` | When the user joined/accepted the invitation. |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Record creation time. |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Last update time. |

**Constraints:**
- `PK: id`
- `UNIQUE: (user_id, org_id)` -- a user can only have one membership per org
- `FK: user_id REFERENCES users(id) ON DELETE CASCADE`
- `FK: org_id REFERENCES orgs(id) ON DELETE CASCADE`
- `FK: invited_by REFERENCES users(id) ON DELETE SET NULL`

---

### hosts

Stores registered nvstreamer host machines. Each host belongs to exactly one
organization.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `org_id` | `UUID` | No | -- | FK to `orgs.id`. The organization that owns this host. |
| `hostname` | `VARCHAR(255)` | No | -- | Machine hostname (e.g., "WORKSTATION-01"). |
| `display_name` | `VARCHAR(255)` | Yes | `NULL` | Optional human-friendly name (e.g., "Design Lab GPU 1"). |
| `status` | `ENUM('online','offline','busy','maintenance')` | No | `'offline'` | Current host status. |
| `gpu_info` | `JSONB` | No | `'{}'` | GPU details from host agent. Schema: `{ name, vram_total_mb, vram_used_mb, driver_version, cuda_version }` |
| `os_info` | `JSONB` | No | `'{}'` | OS details. Schema: `{ platform, version, arch }` |
| `agent_version` | `VARCHAR(32)` | Yes | `NULL` | Version of the host agent binary. |
| `last_heartbeat_at` | `TIMESTAMPTZ` | Yes | `NULL` | Timestamp of the last successful heartbeat. |
| `cert_serial` | `VARCHAR(64)` | Yes | `NULL` | Serial number of the host's mTLS client certificate. |
| `cert_expires_at` | `TIMESTAMPTZ` | Yes | `NULL` | Expiration timestamp of the host's client certificate. |
| `registered_at` | `TIMESTAMPTZ` | Yes | `NULL` | When the host completed bootstrap registration. |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Record creation time. |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Last update time. |
| `deleted_at` | `TIMESTAMPTZ` | Yes | `NULL` | Soft delete timestamp. Non-null means deregistered. |

**Constraints:**
- `PK: id`
- `FK: org_id REFERENCES orgs(id) ON DELETE CASCADE`
- `UNIQUE: cert_serial` (when not null)
- `CHECK: hostname != ''`

---

### sessions

Stores streaming sessions between a user and a host. Records are never deleted;
they transition through status states.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `user_id` | `UUID` | No | -- | FK to `users.id`. The user who initiated the session. |
| `host_id` | `UUID` | No | -- | FK to `hosts.id`. The target host. |
| `org_id` | `UUID` | No | -- | FK to `orgs.id`. Denormalized for query performance on org-scoped session lists. |
| `status` | `ENUM('pending','active','terminated','failed','expired')` | No | `'pending'` | Current session status. |
| `client_public_key` | `VARCHAR(44)` | No | -- | Base64-encoded WireGuard public key from the client. |
| `host_public_key` | `VARCHAR(44)` | Yes | `NULL` | Base64-encoded WireGuard public key from the host. NULL until host responds. |
| `client_tunnel_ip` | `INET` | No | -- | Assigned tunnel IP for the client (e.g., 10.100.42.2). |
| `host_tunnel_ip` | `INET` | No | -- | Assigned tunnel IP for the host (e.g., 10.100.42.3). |
| `gateway_endpoint` | `VARCHAR(255)` | No | -- | Gateway address for this session (e.g., "gw1.nvstream.example.com:51820"). |
| `gateway_public_key` | `VARCHAR(44)` | No | -- | Base64-encoded WireGuard public key of the assigned gateway. |
| `started_at` | `TIMESTAMPTZ` | Yes | `NULL` | When the session became ACTIVE (tunnel established). |
| `ended_at` | `TIMESTAMPTZ` | Yes | `NULL` | When the session was terminated, failed, or expired. |
| `terminated_by` | `UUID` | Yes | `NULL` | FK to `users.id`. The user who terminated the session (NULL if self-terminated or expired). |
| `termination_reason` | `VARCHAR(255)` | Yes | `NULL` | Reason for termination (e.g., "user_disconnect", "admin_force", "timeout", "host_offline"). |
| `metadata` | `JSONB` | No | `'{}'` | Extensible session metadata (client app version, connection quality metrics, etc.). |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Record creation time. |
| `updated_at` | `TIMESTAMPTZ` | No | `now()` | Last update time. |

**Constraints:**
- `PK: id`
- `FK: user_id REFERENCES users(id) ON DELETE RESTRICT` (sessions must not be orphaned)
- `FK: host_id REFERENCES hosts(id) ON DELETE RESTRICT`
- `FK: org_id REFERENCES orgs(id) ON DELETE RESTRICT`
- `FK: terminated_by REFERENCES users(id) ON DELETE SET NULL`
- `CHECK: client_tunnel_ip << '10.100.0.0/16'::inet` (must be in overlay range)
- `CHECK: host_tunnel_ip << '10.100.0.0/16'::inet`
- `CHECK: ended_at IS NULL OR ended_at >= created_at`

---

### audit_logs

Immutable append-only audit log. No UPDATE or DELETE operations are permitted on this
table. The application database role has only INSERT and SELECT permissions.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `timestamp` | `TIMESTAMPTZ` | No | `now()` | When the event occurred. |
| `event_type` | `VARCHAR(64)` | No | -- | Event type identifier (e.g., "SESSION_CREATED", "USER_LOGIN"). |
| `severity` | `ENUM('debug','info','warn','error','critical')` | No | `'info'` | Event severity level. |
| `actor_type` | `ENUM('user','host','system','admin')` | No | -- | Type of actor that performed the action. |
| `actor_id` | `UUID` | Yes | `NULL` | ID of the actor (user ID or host ID). NULL for system events. |
| `actor_email` | `VARCHAR(320)` | Yes | `NULL` | Email of the actor (denormalized for query convenience). |
| `actor_ip` | `INET` | Yes | `NULL` | IP address of the actor's request. |
| `actor_user_agent` | `TEXT` | Yes | `NULL` | User-Agent header of the actor's request. |
| `resource_type` | `VARCHAR(32)` | Yes | `NULL` | Type of resource affected (e.g., "session", "host", "user", "org"). |
| `resource_id` | `UUID` | Yes | `NULL` | ID of the affected resource. |
| `org_id` | `UUID` | Yes | `NULL` | FK to `orgs.id`. Organization context for the event. |
| `session_id` | `UUID` | Yes | `NULL` | FK to `sessions.id`. Session context if applicable. |
| `context` | `JSONB` | No | `'{}'` | Additional context data specific to the event type. |
| `outcome` | `ENUM('success','failure','error')` | No | `'success'` | Whether the action succeeded or failed. |
| `prev_hash` | `VARCHAR(64)` | Yes | `NULL` | SHA-256 hash of the previous audit log entry (hash chain). |
| `hash` | `VARCHAR(64)` | No | -- | SHA-256 hash of this entry (computed from all fields + prev_hash). |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Record creation time (should match `timestamp`). |

**Constraints:**
- `PK: id`
- `FK: org_id REFERENCES orgs(id) ON DELETE SET NULL`
- `FK: session_id REFERENCES sessions(id) ON DELETE SET NULL`
- No UPDATE or DELETE permissions for the application role.

---

### refresh_tokens

Tracks issued refresh tokens for revocation support and device binding.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `user_id` | `UUID` | No | -- | FK to `users.id`. |
| `token_hash` | `VARCHAR(64)` | No | -- | SHA-256 hash of the refresh token. The raw token is never stored. |
| `device_hash` | `VARCHAR(64)` | No | -- | SHA-256 hash of the client device fingerprint. |
| `expires_at` | `TIMESTAMPTZ` | No | -- | When this refresh token expires. |
| `revoked_at` | `TIMESTAMPTZ` | Yes | `NULL` | When this token was revoked. NULL if still valid. |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Record creation time. |

**Constraints:**
- `PK: id`
- `FK: user_id REFERENCES users(id) ON DELETE CASCADE`
- `UNIQUE: token_hash`

---

### ip_allocations

Tracks tunnel IP address allocations from the 10.100.0.0/16 pool. Used to prevent
IP collisions and manage the address space.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `session_id` | `UUID` | No | -- | FK to `sessions.id`. |
| `client_ip` | `INET` | No | -- | Allocated client tunnel IP. |
| `host_ip` | `INET` | No | -- | Allocated host tunnel IP. |
| `gateway_id` | `VARCHAR(64)` | No | -- | Identifier of the gateway instance handling this session. |
| `allocated_at` | `TIMESTAMPTZ` | No | `now()` | When the IPs were allocated. |
| `released_at` | `TIMESTAMPTZ` | Yes | `NULL` | When the IPs were released. NULL if still allocated. |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Record creation time. |

**Constraints:**
- `PK: id`
- `FK: session_id REFERENCES sessions(id) ON DELETE CASCADE`
- `UNIQUE: session_id` (one allocation per session)
- `UNIQUE: client_ip WHERE released_at IS NULL` (partial unique -- no duplicate active IPs)
- `UNIQUE: host_ip WHERE released_at IS NULL` (partial unique)
- `CHECK: client_ip << '10.100.0.0/16'::inet`
- `CHECK: host_ip << '10.100.0.0/16'::inet`

---

### bootstrap_tokens

Stores one-time bootstrap tokens used by host agents to register with the platform.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `org_id` | `UUID` | No | -- | FK to `orgs.id`. The org this token is valid for. |
| `token_hash` | `VARCHAR(64)` | No | -- | SHA-256 hash of the bootstrap token. Raw token shown once to admin. |
| `created_by` | `UUID` | No | -- | FK to `users.id`. The admin who generated this token. |
| `expires_at` | `TIMESTAMPTZ` | No | -- | When this token expires (24 hours after creation). |
| `used_at` | `TIMESTAMPTZ` | Yes | `NULL` | When this token was used. NULL if unused. |
| `used_by_host` | `UUID` | Yes | `NULL` | FK to `hosts.id`. The host that used this token. |
| `created_at` | `TIMESTAMPTZ` | No | `now()` | Record creation time. |

**Constraints:**
- `PK: id`
- `FK: org_id REFERENCES orgs(id) ON DELETE CASCADE`
- `FK: created_by REFERENCES users(id) ON DELETE RESTRICT`
- `FK: used_by_host REFERENCES hosts(id) ON DELETE SET NULL`
- `UNIQUE: token_hash`

---

## Indexes

### Primary Key Indexes (Automatic)

All tables have a B-tree index on `id` (automatic with PRIMARY KEY constraint).

### Secondary Indexes

| Table | Index Name | Columns | Type | Rationale |
|---|---|---|---|---|
| `users` | `idx_users_google_id` | `google_id` | UNIQUE B-tree | OIDC login lookup |
| `users` | `idx_users_email` | `email` | UNIQUE B-tree | Email-based user search |
| `users` | `idx_users_deleted_at` | `deleted_at` | B-tree (partial, WHERE deleted_at IS NULL) | Filter active users |
| `orgs` | `idx_orgs_slug` | `slug` | UNIQUE B-tree | Slug-based org lookup |
| `orgs` | `idx_orgs_deleted_at` | `deleted_at` | B-tree (partial, WHERE deleted_at IS NULL) | Filter active orgs |
| `org_members` | `idx_org_members_user_org` | `(user_id, org_id)` | UNIQUE B-tree | Membership lookup, prevent duplicates |
| `org_members` | `idx_org_members_org_role` | `(org_id, role)` | B-tree | List members by role within an org |
| `hosts` | `idx_hosts_org_id` | `org_id` | B-tree | List hosts in an org |
| `hosts` | `idx_hosts_status` | `(org_id, status)` | B-tree | Filter hosts by status within an org |
| `hosts` | `idx_hosts_cert_serial` | `cert_serial` | UNIQUE B-tree (partial, WHERE cert_serial IS NOT NULL) | Certificate lookup for mTLS validation |
| `hosts` | `idx_hosts_last_heartbeat` | `last_heartbeat_at` | B-tree | Find stale hosts (heartbeat timeout detection) |
| `hosts` | `idx_hosts_deleted_at` | `deleted_at` | B-tree (partial, WHERE deleted_at IS NULL) | Filter active hosts |
| `sessions` | `idx_sessions_user_id` | `user_id` | B-tree | User's session history |
| `sessions` | `idx_sessions_host_id` | `host_id` | B-tree | Host's session history |
| `sessions` | `idx_sessions_org_id` | `org_id` | B-tree | Org-wide session list |
| `sessions` | `idx_sessions_status` | `status` | B-tree (partial, WHERE status = 'active') | Find active sessions |
| `sessions` | `idx_sessions_created_at` | `created_at` | B-tree | Time-range queries |
| `sessions` | `idx_sessions_tunnel_ips` | `(client_tunnel_ip, host_tunnel_ip)` | B-tree (partial, WHERE status = 'active') | IP collision detection |
| `audit_logs` | `idx_audit_logs_timestamp` | `timestamp` | B-tree | Time-range queries (primary query pattern) |
| `audit_logs` | `idx_audit_logs_org_timestamp` | `(org_id, timestamp)` | B-tree | Org-scoped time-range queries |
| `audit_logs` | `idx_audit_logs_event_type` | `(event_type, timestamp)` | B-tree | Filter by event type |
| `audit_logs` | `idx_audit_logs_actor_id` | `actor_id` | B-tree | Find actions by a specific actor |
| `audit_logs` | `idx_audit_logs_resource` | `(resource_type, resource_id)` | B-tree | Find events for a specific resource |
| `audit_logs` | `idx_audit_logs_session_id` | `session_id` | B-tree | Find events for a specific session |
| `refresh_tokens` | `idx_refresh_tokens_user_id` | `user_id` | B-tree | List/revoke tokens by user |
| `refresh_tokens` | `idx_refresh_tokens_token_hash` | `token_hash` | UNIQUE B-tree | Token validation lookup |
| `refresh_tokens` | `idx_refresh_tokens_expires_at` | `expires_at` | B-tree | Cleanup expired tokens |
| `ip_allocations` | `idx_ip_alloc_session` | `session_id` | UNIQUE B-tree | Lookup allocation by session |
| `ip_allocations` | `idx_ip_alloc_client_ip_active` | `client_ip` | UNIQUE B-tree (partial, WHERE released_at IS NULL) | Prevent duplicate active IP allocation |
| `ip_allocations` | `idx_ip_alloc_host_ip_active` | `host_ip` | UNIQUE B-tree (partial, WHERE released_at IS NULL) | Prevent duplicate active IP allocation |
| `bootstrap_tokens` | `idx_bootstrap_token_hash` | `token_hash` | UNIQUE B-tree | Token validation lookup |
| `bootstrap_tokens` | `idx_bootstrap_org_id` | `org_id` | B-tree | List tokens by org |

### Partitioning Strategy

The `audit_logs` table is partitioned by `timestamp` using PostgreSQL range
partitioning. Each partition covers one month. This enables:

- Efficient time-range queries (partition pruning)
- Fast archival (detach old partitions and export to S3)
- Manageable VACUUM operations (per-partition)

```sql
CREATE TABLE audit_logs (
  -- columns as defined above
) PARTITION BY RANGE (timestamp);

CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- Additional partitions created monthly by cron job
```

---

## Constraints and Validation Rules

### Enum Types

```sql
CREATE TYPE org_role AS ENUM ('admin', 'member', 'guest');
CREATE TYPE host_status AS ENUM ('online', 'offline', 'busy', 'maintenance');
CREATE TYPE session_status AS ENUM ('pending', 'active', 'terminated', 'failed', 'expired');
CREATE TYPE audit_severity AS ENUM ('debug', 'info', 'warn', 'error', 'critical');
CREATE TYPE actor_type AS ENUM ('user', 'host', 'system', 'admin');
CREATE TYPE audit_outcome AS ENUM ('success', 'failure', 'error');
```

### Business Rules Enforced at Database Level

| Rule | Implementation |
|---|---|
| A user can only have one membership per org | `UNIQUE (user_id, org_id)` on `org_members` |
| An org must have at least one admin | Enforced via application-level trigger/check before removing the last admin |
| Tunnel IPs must be in the overlay range | `CHECK (ip << '10.100.0.0/16'::inet)` on `sessions` and `ip_allocations` |
| No two active sessions can share a tunnel IP | Partial unique indexes on `ip_allocations` where `released_at IS NULL` |
| Bootstrap tokens are single-use | Application checks `used_at IS NULL` before accepting; atomic UPDATE sets `used_at` |
| Audit logs are immutable | Database role for the application has only `INSERT` and `SELECT` on `audit_logs` |
| Sessions are never deleted | No `DELETE` permission on `sessions` table. Status transitions handle lifecycle. |
| Soft-deleted records are excluded by default | Application-level default `WHERE deleted_at IS NULL` in all Prisma queries via middleware |

### Session Status Transitions

Only the following state transitions are valid:

```
  pending -> active        (host accepted, tunnel established)
  pending -> failed        (host rejected, timeout, or error)
  active  -> terminated    (user or admin ended the session)
  active  -> expired       (max duration exceeded)
  active  -> failed        (tunnel lost, host went offline)
```

Invalid transitions (e.g., `terminated -> active`) are rejected at the application
layer and logged as anomalies.

---

## Prisma Schema

The following Prisma schema corresponds to the database design above. It is the
source of truth for database migrations.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

enum OrgRole {
  admin
  member
  guest
}

enum HostStatus {
  online
  offline
  busy
  maintenance
}

enum SessionStatus {
  pending
  active
  terminated
  failed
  expired
}

enum AuditSeverity {
  debug
  info
  warn
  error
  critical
}

enum ActorType {
  user
  host
  system
  admin
}

enum AuditOutcome {
  success
  failure
  error
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

model User {
  id          String    @id @default(uuid()) @db.Uuid
  googleId    String    @unique @map("google_id") @db.VarChar(255)
  email       String    @unique @db.VarChar(320)
  name        String    @db.VarChar(255)
  avatarUrl   String?   @map("avatar_url") @db.Text
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  lastLoginAt DateTime? @map("last_login_at") @db.Timestamptz
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz

  // Relations
  orgMemberships OrgMember[]    @relation("UserMemberships")
  invitedMembers OrgMember[]    @relation("InvitedBy")
  sessions       Session[]      @relation("UserSessions")
  terminatedSessions Session[]  @relation("TerminatedBy")
  refreshTokens  RefreshToken[]
  bootstrapTokens BootstrapToken[] @relation("CreatedBy")

  @@map("users")
}

model Org {
  id        String    @id @default(uuid()) @db.Uuid
  name      String    @db.VarChar(255)
  slug      String    @unique @db.VarChar(63)
  settings  Json      @default("{}") @db.JsonB
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz

  // Relations
  members         OrgMember[]
  hosts           Host[]
  sessions        Session[]
  auditLogs       AuditLog[]
  bootstrapTokens BootstrapToken[]

  @@map("orgs")
}

model OrgMember {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  orgId     String   @map("org_id") @db.Uuid
  role      OrgRole  @default(member)
  invitedBy String?  @map("invited_by") @db.Uuid
  joinedAt  DateTime @default(now()) @map("joined_at") @db.Timestamptz
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  user       User  @relation("UserMemberships", fields: [userId], references: [id], onDelete: Cascade)
  org        Org   @relation(fields: [orgId], references: [id], onDelete: Cascade)
  invitedByUser User? @relation("InvitedBy", fields: [invitedBy], references: [id], onDelete: SetNull)

  @@unique([userId, orgId])
  @@index([orgId, role])
  @@map("org_members")
}

model Host {
  id              String      @id @default(uuid()) @db.Uuid
  orgId           String      @map("org_id") @db.Uuid
  hostname        String      @db.VarChar(255)
  displayName     String?     @map("display_name") @db.VarChar(255)
  status          HostStatus  @default(offline)
  gpuInfo         Json        @default("{}") @map("gpu_info") @db.JsonB
  osInfo          Json        @default("{}") @map("os_info") @db.JsonB
  agentVersion    String?     @map("agent_version") @db.VarChar(32)
  lastHeartbeatAt DateTime?   @map("last_heartbeat_at") @db.Timestamptz
  certSerial      String?     @unique @map("cert_serial") @db.VarChar(64)
  certExpiresAt   DateTime?   @map("cert_expires_at") @db.Timestamptz
  registeredAt    DateTime?   @map("registered_at") @db.Timestamptz
  createdAt       DateTime    @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime    @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt       DateTime?   @map("deleted_at") @db.Timestamptz

  // Relations
  org              Org              @relation(fields: [orgId], references: [id], onDelete: Cascade)
  sessions         Session[]
  bootstrapTokens  BootstrapToken[] @relation("UsedByHost")

  @@index([orgId])
  @@index([orgId, status])
  @@index([lastHeartbeatAt])
  @@map("hosts")
}

model Session {
  id                String        @id @default(uuid()) @db.Uuid
  userId            String        @map("user_id") @db.Uuid
  hostId            String        @map("host_id") @db.Uuid
  orgId             String        @map("org_id") @db.Uuid
  status            SessionStatus @default(pending)
  clientPublicKey   String        @map("client_public_key") @db.VarChar(44)
  hostPublicKey     String?       @map("host_public_key") @db.VarChar(44)
  clientTunnelIp    String        @map("client_tunnel_ip") @db.VarChar(15)
  hostTunnelIp      String        @map("host_tunnel_ip") @db.VarChar(15)
  gatewayEndpoint   String        @map("gateway_endpoint") @db.VarChar(255)
  gatewayPublicKey  String        @map("gateway_public_key") @db.VarChar(44)
  startedAt         DateTime?     @map("started_at") @db.Timestamptz
  endedAt           DateTime?     @map("ended_at") @db.Timestamptz
  terminatedBy      String?       @map("terminated_by") @db.Uuid
  terminationReason String?       @map("termination_reason") @db.VarChar(255)
  metadata          Json          @default("{}") @db.JsonB
  createdAt         DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  user             User           @relation("UserSessions", fields: [userId], references: [id], onDelete: Restrict)
  host             Host           @relation(fields: [hostId], references: [id], onDelete: Restrict)
  org              Org            @relation(fields: [orgId], references: [id], onDelete: Restrict)
  terminatedByUser User?          @relation("TerminatedBy", fields: [terminatedBy], references: [id], onDelete: SetNull)
  ipAllocation     IpAllocation?
  auditLogs        AuditLog[]

  @@index([userId])
  @@index([hostId])
  @@index([orgId])
  @@index([status])
  @@index([createdAt])
  @@map("sessions")
}

model AuditLog {
  id             String        @id @default(uuid()) @db.Uuid
  timestamp      DateTime      @default(now()) @db.Timestamptz
  eventType      String        @map("event_type") @db.VarChar(64)
  severity       AuditSeverity @default(info)
  actorType      ActorType     @map("actor_type")
  actorId        String?       @map("actor_id") @db.Uuid
  actorEmail     String?       @map("actor_email") @db.VarChar(320)
  actorIp        String?       @map("actor_ip") @db.VarChar(45)
  actorUserAgent String?       @map("actor_user_agent") @db.Text
  resourceType   String?       @map("resource_type") @db.VarChar(32)
  resourceId     String?       @map("resource_id") @db.Uuid
  orgId          String?       @map("org_id") @db.Uuid
  sessionId      String?       @map("session_id") @db.Uuid
  context        Json          @default("{}") @db.JsonB
  outcome        AuditOutcome  @default(success)
  prevHash       String?       @map("prev_hash") @db.VarChar(64)
  hash           String        @db.VarChar(64)
  createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  org     Org?     @relation(fields: [orgId], references: [id], onDelete: SetNull)
  session Session? @relation(fields: [sessionId], references: [id], onDelete: SetNull)

  @@index([timestamp])
  @@index([orgId, timestamp])
  @@index([eventType, timestamp])
  @@index([actorId])
  @@index([resourceType, resourceId])
  @@index([sessionId])
  @@map("audit_logs")
}

model RefreshToken {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  tokenHash  String    @unique @map("token_hash") @db.VarChar(64)
  deviceHash String    @map("device_hash") @db.VarChar(64)
  expiresAt  DateTime  @map("expires_at") @db.Timestamptz
  revokedAt  DateTime? @map("revoked_at") @db.Timestamptz
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}

model IpAllocation {
  id          String    @id @default(uuid()) @db.Uuid
  sessionId   String    @unique @map("session_id") @db.Uuid
  clientIp    String    @map("client_ip") @db.VarChar(15)
  hostIp      String    @map("host_ip") @db.VarChar(15)
  gatewayId   String    @map("gateway_id") @db.VarChar(64)
  allocatedAt DateTime  @default(now()) @map("allocated_at") @db.Timestamptz
  releasedAt  DateTime? @map("released_at") @db.Timestamptz
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  session Session @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("ip_allocations")
}

model BootstrapToken {
  id         String    @id @default(uuid()) @db.Uuid
  orgId      String    @map("org_id") @db.Uuid
  tokenHash  String    @unique @map("token_hash") @db.VarChar(64)
  createdBy  String    @map("created_by") @db.Uuid
  expiresAt  DateTime  @map("expires_at") @db.Timestamptz
  usedAt     DateTime? @map("used_at") @db.Timestamptz
  usedByHost String?   @map("used_by_host") @db.Uuid
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  org            Org   @relation(fields: [orgId], references: [id], onDelete: Cascade)
  createdByUser  User  @relation("CreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)
  host           Host? @relation("UsedByHost", fields: [usedByHost], references: [id], onDelete: SetNull)

  @@index([orgId])
  @@map("bootstrap_tokens")
}
```

---

## Migration Strategy

### Initial Migration

The initial migration creates all tables, indexes, enums, and constraints defined
above. It is generated by Prisma:

```bash
npx prisma migrate dev --name init
```

### Ongoing Migrations

All schema changes follow this process:

1. Modify `prisma/schema.prisma`
2. Generate a migration: `npx prisma migrate dev --name descriptive_name`
3. Review the generated SQL in `prisma/migrations/`
4. Commit both the schema change and the migration
5. Apply in staging: `npx prisma migrate deploy`
6. Apply in production: `npx prisma migrate deploy` (via CI/CD pipeline)

### Rollback Strategy

Prisma does not support automatic rollbacks. For each migration, a corresponding
rollback SQL script is manually written and stored in
`prisma/migrations/<timestamp>_<name>/rollback.sql`. In an emergency, the rollback
script is executed directly against the database.

---

## References

- [ARCHITECTURE.md](./ARCHITECTURE.md) -- System architecture
- [SECURITY.md](../security/SECURITY.md) -- Security model
- Prisma Documentation: https://www.prisma.io/docs
- PostgreSQL Documentation: https://www.postgresql.org/docs/15/
