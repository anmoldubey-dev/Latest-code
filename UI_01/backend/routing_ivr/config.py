# IVR configuration — all Piper paths are absolute (relative to this file)
# so they work correctly regardless of uvicorn's working directory.

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# backend/routing_ivr/config.py → go up one level to reach backend/piper/
_PIPER_DIR = Path(__file__).resolve().parent.parent / "piper"

# ── Piper TTS ─────────────────────────────────────────────────────────────────
PIPER_EXE   = os.getenv("PIPER_EXECUTABLE", str(_PIPER_DIR / "piper.exe"))
PIPER_MODEL = os.getenv("PIPER_MODEL",      str(_PIPER_DIR / "models" / "en_US-ryan-high.onnx"))
ESPEAK_DATA = os.getenv("ESPEAK_DATA",      str(_PIPER_DIR / "espeak-ng-data"))

# ── Faster-Whisper STT ────────────────────────────────────────────────────────
WHISPER_MODEL_SIZE   = os.getenv("WHISPER_MODEL_SIZE",   "tiny.en")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_DEVICE       = os.getenv("WHISPER_DEVICE",       "cpu")

# ── Gemini API ────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL",   "gemini-2.5-flash")

# ── IVR timing ────────────────────────────────────────────────────────────────
SILENCE_THRESHOLD_SEC = 5.0
CONFIRMATION_TIMEOUT  = 10.0
IVR_GREETING_TIMEOUT  = 30.0

# ── Department mappings ───────────────────────────────────────────────────────
VALID_DEPARTMENTS = [
    "Tech Department",
    "Billing Department",
    "Sales Department",
    "Support Department",
]

# ── Pre-synthesized phrases ───────────────────────────────────────────────────
GREETING_PHRASE        = (
    "Hello sir, can you tell me about your issues so that "
    "I can redirect your call to the most compatible department?"
)
CONFIRMATION_PHRASE    = "That's it sir?"
FALLBACK_ROUTING_PHRASE = "I am routing your call to the Support Department."

# ── TTS cache directory ───────────────────────────────────────────────────────
CACHE_DIR = Path(__file__).parent / "tts_cache"
CACHE_DIR.mkdir(exist_ok=True)
