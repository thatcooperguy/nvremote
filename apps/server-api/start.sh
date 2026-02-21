#!/bin/sh
# Apply schema changes then start the API server.
#
# We use `prisma db push` (without --accept-data-loss) so that Prisma
# will refuse to run destructive changes like dropping columns. If you
# intentionally need a breaking migration, run it manually first:
#   npx prisma migrate dev --name <migration-name>
echo "Applying schema changes..."
npx prisma db push 2>&1 || echo "Warning: prisma db push failed (non-fatal)"
echo "Starting NVRemote API on PORT=${PORT:-8080}..."
exec node dist/main.js
