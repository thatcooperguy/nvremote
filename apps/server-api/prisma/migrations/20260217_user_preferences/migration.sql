-- Add preferences JSON column to users table
ALTER TABLE "users" ADD COLUMN "preferences" JSONB;
