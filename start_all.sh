#!/usr/bin/env bash
# ================================================================
#  Voice AI Core -- Linux launcher  (replaces start_all.bat)
#  Usage:  bash start_all.sh
#  Stop:   bash stop_all.sh
# ================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Use local ollama binary if system ollama not found
# MUST use bin/ollama (not ollama/ollama) so OLLAMA_LIBRARY_PATH resolves to lib/ollama/cuda_v13 for GPU support
if ! command -v ollama &>/dev/null && [[ -x "$SCRIPT_DIR/ollama/bin/ollama" ]]; then
    export PATH="$SCRIPT_DIR/ollama/bin:$PATH"
fi

echo ""
echo " ========================================"
echo "  Voice AI Core -- Starting all services"
echo " ========================================"
echo ""

# ── Kill stale processes and free ports ─────────────────────────
echo " Clearing stale processes..."
pkill -f "uvicorn" 2>/dev/null || true
pkill -f "ollama serve" 2>/dev/null || true
for port in 8000 8001 8002 8003 8004 8005 8088; do
    fuser -k "${port}/tcp" 2>/dev/null || true
done
sleep 1
echo " Ports 8000-8005 + 8088 cleared."
echo ""

# ── Defaults (overridden by services.config) ────────────────────
LIVEKIT=false
DIARIZATION=true
HAUP_RAG=true
RAG_TABLES=users,conversation_turns
SMART_RAG=false
SMART_RAG_TABLES=conversation_turns
TRANSLATOR=true
TTS_GLOBAL=true
TTS_INDIC=true
VOICE_CLONER=false
OLLAMA=true
AVATAR_SUMMARY_AI=ollama
BACKEND=true
BACKEND_MODE=web
ADMIN_CONSOLE=false
WHISPER_MODEL=large-v3
STT_LANGUAGE=en

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

export LIVEKIT DIARIZATION HAUP_RAG RAG_TABLES SMART_RAG SMART_RAG_TABLES
export TRANSLATOR TTS_GLOBAL TTS_INDIC VOICE_CLONER OLLAMA AVATAR_SUMMARY_AI
export BACKEND BACKEND_MODE ADMIN_CONSOLE WHISPER_MODEL STT_LANGUAGE KMP_DUPLICATE_LIB_OK=TRUE

echo " Config loaded:"
echo "   LIVEKIT       = $LIVEKIT"
echo "   DIARIZATION   = $DIARIZATION"
echo "   HAUP_RAG      = $HAUP_RAG"
echo "   TRANSLATOR    = $TRANSLATOR"
echo "   TTS_GLOBAL    = $TTS_GLOBAL"
echo "   TTS_INDIC     = $TTS_INDIC"
echo "   VOICE_CLONER  = $VOICE_CLONER"
echo "   OLLAMA        = $OLLAMA"
echo "   BACKEND       = $BACKEND"
echo "   BACKEND_MODE  = $BACKEND_MODE"
echo "   ADMIN_CONSOLE = $ADMIN_CONSOLE"
echo "   WHISPER_MODEL = $WHISPER_MODEL"
echo "   STT_LANGUAGE  = $STT_LANGUAGE"
echo ""

mkdir -p logs
rm -f .service_pids

# helper: launch a background service and track its PID
start_bg() {
    local name="$1" logfile="logs/$2"
    shift 2
    echo "   $name -> $logfile"
    nohup "$@" >"$SCRIPT_DIR/$logfile" 2>&1 &
    echo "$!" >> "$SCRIPT_DIR/.service_pids"
}

# ── 1. LiveKit :7880 ─────────────────────────────────────────────
if [[ "${LIVEKIT,,}" == "true" ]]; then
    echo "[1/9] LiveKit :7880 ..."
    start_bg "LiveKit" "livekit.log" livekit-server --config "$SCRIPT_DIR/livekit.yaml"
    sleep 2
else
    echo "[1/9] LiveKit -- SKIPPED"
fi

# ── 2. Ollama :11434 ─────────────────────────────────────────────
if [[ "${OLLAMA,,}" == "true" ]]; then
    echo "[2/9] Ollama :11434 ..."
    start_bg "Ollama" "ollama.log" ollama serve
    sleep 3
else
    echo "[2/9] Ollama -- SKIPPED"
fi

# ── 3. Diarization :8001 ─────────────────────────────────────────
if [[ "${DIARIZATION,,}" == "true" ]]; then
    echo "[3/9] Diarization :8001 ..."
    start_bg "Diarization" "diarization.log" \
        "$SCRIPT_DIR/services/diarization_service/.venv_diarization/bin/python3" \
        -m uvicorn server:app --port 8001 --host 0.0.0.0 \
        --app-dir "$SCRIPT_DIR/services/diarization_service"
    sleep 1
else
    echo "[3/9] Diarization -- SKIPPED"
fi

# ── 4. HAUP RAG :8088 ────────────────────────────────────────────
if [[ "${HAUP_RAG,,}" == "true" ]]; then
    echo "[4/10] HAUP RAG :8088 ..."
    (cd "$SCRIPT_DIR/SahilRagSystem/haup" && \
        nohup "$SCRIPT_DIR/.venv/bin/python3" rag_api.py \
        >"$SCRIPT_DIR/logs/haup_rag.log" 2>&1 &
        echo "$!" >> "$SCRIPT_DIR/.service_pids"
    )
    sleep 2
else
    echo "[4/10] HAUP RAG -- SKIPPED"
fi

# ── 5. Translator :8002 ──────────────────────────────────────────
if [[ "${TRANSLATOR,,}" == "true" ]]; then
    echo "[5/10] Translator :8002 ..."
    (cd "$SCRIPT_DIR/services/translator_service" && \
        nohup ./.venv/bin/python3 -m uvicorn app:app --port 8002 --host 0.0.0.0 \
        >"$SCRIPT_DIR/logs/translator.log" 2>&1 &
        echo "$!" >> "$SCRIPT_DIR/.service_pids"
    )
    sleep 1
else
    echo "[5/10] Translator -- SKIPPED"
fi

# ── 6. TTS Global :8003 ──────────────────────────────────────────
if [[ "${TTS_GLOBAL,,}" == "true" ]]; then
    echo "[6/10] TTS Global :8003 ..."
    (cd "$SCRIPT_DIR/services/tts_service/global_tts" && \
        nohup "$SCRIPT_DIR/services/tts_service/.venv/bin/python3" \
        -m uvicorn app:app --port 8003 --host 0.0.0.0 \
        >"$SCRIPT_DIR/logs/tts_global.log" 2>&1 &
        echo "$!" >> "$SCRIPT_DIR/.service_pids"
    )
    sleep 1
else
    echo "[6/10] TTS Global -- SKIPPED"
fi

# ── 7. TTS Indic :8004 ───────────────────────────────────────────
if [[ "${TTS_INDIC,,}" == "true" ]]; then
    echo "[7/10] TTS Indic :8004 ..."
    (cd "$SCRIPT_DIR/services/tts_service/indic_tts" && \
        nohup "$SCRIPT_DIR/services/tts_service/.venv/bin/python3" \
        -m uvicorn app:app --port 8004 --host 0.0.0.0 \
        >"$SCRIPT_DIR/logs/tts_indic.log" 2>&1 &
        echo "$!" >> "$SCRIPT_DIR/.service_pids"
    )
    sleep 1
else
    echo "[7/10] TTS Indic -- SKIPPED"
fi

# ── 8. Voice Cloner :8005 ────────────────────────────────────────
if [[ "${VOICE_CLONER,,}" == "true" ]]; then
    echo "[8/10] Voice Cloner :8005 ..."
    (cd "$SCRIPT_DIR/services/voice_cloner_service" && \
        nohup ./.venv/bin/python3 -m uvicorn server:app --port 8005 --host 0.0.0.0 \
        >"$SCRIPT_DIR/logs/voice_cloner.log" 2>&1 &
        echo "$!" >> "$SCRIPT_DIR/.service_pids"
    )
    sleep 1
else
    echo "[8/10] Voice Cloner -- SKIPPED"
fi

# ── 9. Backend :8000 ─────────────────────────────────────────────
if [[ "${BACKEND,,}" == "true" ]]; then
    if [[ "${BACKEND_MODE,,}" == "cli" ]]; then
        echo "[9/10] Backend CLI - mic pipeline ..."
        start_bg "Backend CLI" "backend.log" \
            "$SCRIPT_DIR/.venv/bin/python3" -m backend.main
    else
        echo "[9/10] Backend Web :8000 ..."
        bash "$SCRIPT_DIR/start_backend.sh" &
    fi
else
    echo "[9/10] Backend -- SKIPPED"
fi

# ── 10. Admin Console :5173 ──────────────────────────────────────
if [[ "${ADMIN_CONSOLE,,}" == "true" ]]; then
    echo "[10/10] Admin Console :5173 ..."
    (cd "$SCRIPT_DIR/admin-console" && \
        nohup npm run dev >"$SCRIPT_DIR/logs/admin_console.log" 2>&1 &
        echo "$!" >> "$SCRIPT_DIR/.service_pids"
    )
else
    echo "[10/10] Admin Console -- SKIPPED"
fi

echo ""
if [[ "${BACKEND_MODE,,}" == "cli" ]]; then
    echo " Done. CLI pipeline running -- speak into your mic."
else
    echo " Done."
    echo "   Call UI  ->  http://localhost:8000"
    [[ "${ADMIN_CONSOLE,,}" == "true" ]] && echo "   Admin    ->  http://localhost:5173"
fi
echo ""
echo " Logs:    $SCRIPT_DIR/logs/"
echo " Stop:    bash stop_all.sh"
echo ""
