-- Auth Providers: Add OAuth provider ID columns to users table
ALTER TABLE "users" ADD COLUMN "microsoftId" TEXT;
ALTER TABLE "users" ADD COLUMN "appleId" TEXT;
ALTER TABLE "users" ADD COLUMN "discordId" TEXT;

CREATE UNIQUE INDEX "users_microsoftId_key" ON "users"("microsoftId");
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");
CREATE UNIQUE INDEX "users_discordId_key" ON "users"("discordId");

-- Sessions: Add bandwidth tracking column
ALTER TABLE "sessions" ADD COLUMN "bytesTransferred" BIGINT NOT NULL DEFAULT 0;

-- Billing: Create enum type
CREATE TYPE "BillingPeriodStatus" AS ENUM ('OPEN', 'INVOICED', 'PAID', 'FAILED');

-- Billing: Create billing_accounts table
CREATE TABLE "billing_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "orgId" UUID NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_accounts_orgId_key" ON "billing_accounts"("orgId");
CREATE UNIQUE INDEX "billing_accounts_stripeCustomerId_key" ON "billing_accounts"("stripeCustomerId");

ALTER TABLE "billing_accounts"
    ADD CONSTRAINT "billing_accounts_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "orgs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Billing: Create billing_periods table
CREATE TABLE "billing_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billingAccountId" UUID NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalBytesRelay" BIGINT NOT NULL DEFAULT 0,
    "totalBytesVpn" BIGINT NOT NULL DEFAULT 0,
    "costCentsRaw" INTEGER NOT NULL DEFAULT 0,
    "costCentsCharged" INTEGER NOT NULL DEFAULT 0,
    "stripeInvoiceId" TEXT,
    "status" "BillingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_periods_billingAccountId_status_idx"
    ON "billing_periods"("billingAccountId", "status");

ALTER TABLE "billing_periods"
    ADD CONSTRAINT "billing_periods_billingAccountId_fkey"
    FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Billing: Create usage_records table
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billingPeriodId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "bytesTransferred" BIGINT NOT NULL DEFAULT 0,
    "connectionType" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "usage_records_billingPeriodId_idx" ON "usage_records"("billingPeriodId");
CREATE INDEX "usage_records_sessionId_idx" ON "usage_records"("sessionId");

ALTER TABLE "usage_records"
    ADD CONSTRAINT "usage_records_billingPeriodId_fkey"
    FOREIGN KEY ("billingPeriodId") REFERENCES "billing_periods"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
