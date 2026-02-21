-- Performance indexes for production query patterns
--
-- sessions: composite index on (status, startedAt) for the session timeout
-- cleanup job that runs every 5 minutes and filters by status + startedAt.
CREATE INDEX "sessions_status_startedAt_idx" ON "sessions"("status", "startedAt");

-- users: index on createdAt for admin user listing/pagination.
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- refresh_tokens: index on expiresAt for expired token cleanup queries.
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");
