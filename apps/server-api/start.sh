#!/bin/sh
# Push schema changes (safe for additive changes like new columns)
# then start the API server.
echo "Applying schema changes..."
npx prisma db push --accept-data-loss 2>&1 || echo "Warning: prisma db push failed (non-fatal)"
echo "Starting NVRemote API on PORT=${PORT:-8080}..."
exec node dist/main.js
