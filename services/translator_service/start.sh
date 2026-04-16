#!/usr/bin/env bash
# Translator Service  |  port 8002
set -euo pipefail
SVC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SVC_DIR/../.." && pwd)"
cd "$SVC_DIR"

export KMP_DUPLICATE_LIB_OK=TRUE

# Load services.config from project root
WHISPER_MODEL=small
if [[ -f "$PROJECT_ROOT/services.config" ]]; then
    while IFS= read -r line; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line//[[:space:]]/}" ]] && continue
        [[ "$line" != *=* ]] && continue
        key="${line%%=*}"
        val="${line#*=}"
        key="${key//[[:space:]]/}"
        val="${val%%#*}"
        val="${val//[[:space:]]/}"
        [[ -n "$key" && -n "$val" ]] && printf -v "$key" '%s' "$val"
    done < "$PROJECT_ROOT/services.config"
fi
export WHISPER_MODEL

echo ""
echo " ================================================"
echo "  Translator Service  |  port 8002"
echo "  WHISPER_MODEL = $WHISPER_MODEL"
echo " ================================================"
echo ""

./.venv/bin/python3 -m uvicorn app:app --port 8002 --host 0.0.0.0
