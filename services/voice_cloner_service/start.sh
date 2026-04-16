#!/usr/bin/env bash
# Voice Cloner Service  |  port 8005
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo ""
echo " ================================================"
echo "  Voice Cloner  |  FastAPI backend on port 8005"
echo " ================================================"
echo ""

./.venv/bin/python3 -m uvicorn server:app --port 8005 --host 0.0.0.0
