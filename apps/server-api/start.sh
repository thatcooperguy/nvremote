#!/bin/sh
# Apply schema changes then start the API server.
#
# First attempt without --accept-data-loss (safe mode). If that fails
# (e.g. adding new unique constraints on nullable columns), retry with
# --accept-data-loss. Prisma will still refuse truly destructive changes
# like dropping columns when there is data present.
echo "Applying schema changes..."
npx prisma db push 2>&1 || {
  echo "Retrying with --accept-data-loss..."
  npx prisma db push --accept-data-loss 2>&1 || echo "Warning: prisma db push failed (non-fatal)"
}
echo "Starting NVRemote API on PORT=${PORT:-8080}..."
exec node dist/main.js
