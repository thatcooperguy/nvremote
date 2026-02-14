#!/bin/sh
echo "Starting CrazyStream API on PORT=${PORT:-8080}..."
exec node dist/main.js
