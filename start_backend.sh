#!/usr/bin/env bash
# ================================================================
#  Voice AI Core -- Backend launcher  (replaces start_backend.bat)
#  Usage:  bash start_backend.sh
# ================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export KMP_DUPLICATE_LIB_OK=TRUE

# ── Defaults ────────────────────────────────────────────────────
WHISPER_MODEL=large-v3
STT_LANGUAGE=en
OLLAMA=false
SMART_RAG=false
SMART_RAG_TABLES=conversation_turns

# ── Load services.config ─────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/services.config" ]]; then
    while IFS= read -r line; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line//[[:space:]]/}" ]] && continue
        [[ "$line" != *=* ]] && continue
        key="${line%%=*}"
        val="${line#*=}"
        key="${key//[[:space:]]/}"
        val="${val%%#*}"
        val="${val//[[:space:]]/}"
        val="${val//	/}"
        [[ -n "$key" && -n "$val" ]] && printf -v "$key" '%s' "$val"
    done < "$SCRIPT_DIR/services.config"
fi

export WHISPER_MODEL STT_LANGUAGE OLLAMA SMART_RAG SMART_RAG_TABLES

echo ""
echo " ================================================"
echo "  Main Backend  |  port 8000"
echo " ================================================"
echo "  Configuration loaded from services.config:"
echo "    WHISPER_MODEL    = $WHISPER_MODEL"
echo "    STT_LANGUAGE     = $STT_LANGUAGE"
echo "    OLLAMA           = $OLLAMA"
echo "    SMART_RAG        = $SMART_RAG"
echo "    SMART_RAG_TABLES = $SMART_RAG_TABLES"
echo ""
echo "  (change these in services.config and restart)"
echo " ================================================"
echo ""

"$SCRIPT_DIR/.venv/bin/python3" -m uvicorn backend.app:app --port 8000 --host 0.0.0.0
