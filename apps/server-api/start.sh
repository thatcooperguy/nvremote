#!/bin/sh
# Start the API server immediately so Cloud Run health checks pass.
# Run schema sync in the background — Prisma auto-connects on first query anyway.
echo "Starting NVRemote API on PORT=${PORT:-8080}..."
npx prisma db push --accept-data-loss &
exec node dist/main.js
