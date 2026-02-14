#!/bin/sh
echo "Starting GridStreamer API on PORT=${PORT:-8080}..."
exec node dist/main.js
