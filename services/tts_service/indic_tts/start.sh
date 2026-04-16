#!/usr/bin/env bash
# TTS Indic Service  |  port 8004
set -euo pipefail
SVC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SVC_DIR"

echo ""
echo " ================================================"
echo "  TTS Indic Service  |  port 8004"
echo " ================================================"
echo ""

"$SVC_DIR/../.venv/bin/python3" -m uvicorn app:app --port 8004 --host 0.0.0.0
