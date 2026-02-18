#!/bin/bash
# Post-install script for NVRemote .deb package
# Register the nvremote:// protocol handler

# Register xdg protocol handler for nvremote:// deep links
if command -v xdg-mime &> /dev/null; then
  xdg-mime default nvremote.desktop x-scheme-handler/nvremote 2>/dev/null || true
fi

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
  update-desktop-database /usr/share/applications 2>/dev/null || true
fi

# Set correct permissions on chrome-sandbox (required for Electron sandbox)
SANDBOX="/opt/NVRemote/chrome-sandbox"
if [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX"
  chmod 4755 "$SANDBOX"
fi
