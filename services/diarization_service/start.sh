#!/usr/bin/env bash
# Diarization Service  |  port 8001
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo ""
echo " ================================================"
echo "  Diarization Service  |  port 8001"
echo " ================================================"
echo ""

./.venv_diarization/bin/python3 -m uvicorn server:app --port 8001 --host 0.0.0.0
