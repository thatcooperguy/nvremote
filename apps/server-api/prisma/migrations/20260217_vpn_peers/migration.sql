-- VPN Peer Persistence Migration
-- Adds vpn_peers table for durable WireGuard peer registrations

CREATE TABLE IF NOT EXISTS "vpn_peers" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "publicKey"    TEXT         NOT NULL,
    "assignedIp"   TEXT         NOT NULL,
    "hostId"       UUID,
    "userId"       UUID,
    "endpoint"     TEXT,
    "region"       TEXT         NOT NULL DEFAULT 'us-west1',
    "lastSeenAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vpn_peers_pkey" PRIMARY KEY ("id")
);

-- Unique constraints for peer identity and IP allocation
CREATE UNIQUE INDEX IF NOT EXISTS "vpn_peers_publicKey_key" ON "vpn_peers"("publicKey");
CREATE UNIQUE INDEX IF NOT EXISTS "vpn_peers_assignedIp_key" ON "vpn_peers"("assignedIp");

-- Lookup indices for host and user associations
CREATE INDEX IF NOT EXISTS "vpn_peers_hostId_idx" ON "vpn_peers"("hostId");
CREATE INDEX IF NOT EXISTS "vpn_peers_userId_idx" ON "vpn_peers"("userId");
