#!/usr/bin/env bash
# ================================================================
#  Voice AI Core -- Stop all services
#  Usage:  bash stop_all.sh
# ================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo " Stopping Voice AI Core services..."

# Kill by saved PIDs
if [[ -f "$SCRIPT_DIR/.service_pids" ]]; then
    while read -r pid; do
        kill "$pid" 2>/dev/null && echo "  Killed PID $pid" || true
    done < "$SCRIPT_DIR/.service_pids"
    rm -f "$SCRIPT_DIR/.service_pids"
fi

# Also kill by process name (catches services started externally)
pkill -f "uvicorn backend.app" 2>/dev/null || true
pkill -f "uvicorn app:app" 2>/dev/null || true
pkill -f "uvicorn server:app" 2>/dev/null || true
pkill -f "rag_api.py" 2>/dev/null || true
pkill -f "ollama serve" 2>/dev/null || true
pkill -f "livekit-server" 2>/dev/null || true
pkill -f "backend.main" 2>/dev/null || true

echo " Done."
echo ""
