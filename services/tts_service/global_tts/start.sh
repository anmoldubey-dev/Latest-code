#!/usr/bin/env bash
# TTS Global Service  |  port 8003
set -euo pipefail
SVC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SVC_DIR"

echo ""
echo " ================================================"
echo "  TTS Global Service  |  port 8003"
echo " ================================================"
echo ""

"$SVC_DIR/../.venv/bin/python3" -m uvicorn app:app --port 8003 --host 0.0.0.0
