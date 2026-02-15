#!/bin/sh
echo "Starting NVRemote API on PORT=${PORT:-8080}..."
exec node dist/main.js
