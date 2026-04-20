#!/usr/bin/env bash
# Start LiveKit server (self-hosted, no Docker)
# Uses LiveKit Cloud credentials from .env if set, otherwise local binary
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# If LIVEKIT_URL points to cloud, no local server needed
if grep -q "livekit.cloud" .env 2>/dev/null; then
    echo " Using LiveKit Cloud (from .env) — no local server needed."
    echo " LIVEKIT_URL=$(grep LIVEKIT_URL .env | cut -d= -f2)"
    exit 0
fi

if [[ ! -x "./livekit-server" ]]; then
    echo " livekit-server binary not found. Run:"
    echo "   wget https://github.com/livekit/livekit/releases/download/v1.8.3/livekit_1.8.3_linux_amd64.tar.gz"
    echo "   tar -xzf livekit_1.8.3_linux_amd64.tar.gz"
    exit 1
fi

echo " Starting LiveKit server on :7880..."
./livekit-server --config livekit.yaml &
echo " LiveKit PID=$!"
echo " Signaling: ws://localhost:7880"
