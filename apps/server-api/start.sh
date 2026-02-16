#!/bin/sh
# Start the API server immediately.
# Schema migrations are handled separately via CI/CD or manual runs.
echo "Starting NVRemote API on PORT=${PORT:-8080}..."
exec node dist/main.js
