#!/bin/sh
echo "Syncing database schema..."
npx prisma db push --accept-data-loss || echo "Warning: schema sync failed, continuing anyway..."
echo "Starting NVRemote API on PORT=${PORT:-8080}..."
exec node dist/main.js
