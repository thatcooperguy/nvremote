-- Security Hardening Migration
-- Adds platform super-admin role, host API tokens, and enterprise SSO fields

-- 1. Add isSuperAdmin to users (default false — only set via direct DB update)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- 2. Add apiToken to hosts (issued during registration, used for heartbeat auth)
ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "apiToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "hosts_apiToken_key" ON "hosts"("apiToken");

-- 3. Add enterprise SSO fields to orgs (for future AD/SAML integration)
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "authProvider" TEXT;
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "samlEntityId" TEXT;
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "samlSsoUrl" TEXT;
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "samlCert" TEXT;
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "allowedDomains" TEXT;
