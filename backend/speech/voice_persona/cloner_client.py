# =============================================================================
# FILE: cloner_client.py
# DESC: HTTP client for the voice-cloner microservice (Chatterbox TTS).
# =============================================================================
#
# EXECUTION FLOW
# =============================================================================
#
#  +--------------------------------+
#  | clone_speech()                 |
#  | * POST /generate, return WAV   |
#  +--------------------------------+
#           |
#           |----> <requests> -> post()
#           |
#           v
#  +--------------------------------+
#  | health_check()                 |
#  | * GET /health, return dict     |
#  +--------------------------------+
#           |
#           |----> <requests> -> get()
#           |
#           v
#  +--------------------------------+
#  | is_available()                 |
#  | * return bool from health      |
#  +--------------------------------+
#           |
#           |----> health_check()
#           |
#           v
#  +--------------------------------+
#  | list_voices()                  |
#  | * return empty list (no API)   |
#  +--------------------------------+
#
# =============================================================================
"""
cloner_client
=============
HTTP client to the voice-cloner microservice (port 8005 / Chatterbox TTS).

Matches the actual server API in voice-cloner/server.py:
    POST /generate  — multipart/form-data:
        reference     : WAV file (10–60 s)
        text          : str
        model         : "standard" | "turbo" | "multilingual"
        language      : BCP-47 code (multilingual mode only)
        exaggeration  : float 0.0–1.0
        cfg_weight    : float 0.0–1.0
    → StreamingResponse (audio/wav)

    GET  /health    — service status + loaded models + supported languages
    GET  /voices    — not on this server; returns [] gracefully

Falls back to None if the cloner is unavailable so the TTS pipeline can
continue with the standard Parler path.

License: Apache 2.0
"""

import io
import logging
import os
from typing import Optional

import requests

logger = logging.getLogger("callcenter.tts.cloner_client")

CLONER_URL  = os.getenv("VOICE_CLONER_URL", "http://localhost:8005")
_TIMEOUT    = 30  # seconds

# Map Indic lang codes to multilingual model lang IDs (Chatterbox supports a subset)
_MULTILINGUAL_LANGS = {"en", "fr", "de", "es", "pt", "it", "pl", "nl", "ja", "zh", "ko"}


def clone_speech(
    text:            str,
    reference_audio: bytes,
    language:        str = "en",
    model:           str = "standard",
    exaggeration:    float = 0.5,
    cfg_weight:      float = 0.5,
    ref_filename:    str = "reference.wav",
) -> Optional[bytes]:
    """
    Synthesise speech cloned from a reference audio sample.

    Parameters
    ----------
    text            : Text to synthesise (max 500 chars).
    reference_audio : Raw WAV bytes of the target voice reference (10–60 s).
    language        : BCP-47 code — used only when model="multilingual".
    model           : "standard" | "turbo" | "multilingual".
    exaggeration    : Emotion expressiveness 0.0–1.0.
    cfg_weight      : CFG guidance strength 0.0–1.0.
    ref_filename    : Filename hint (extension matters for torchaudio).

    Returns
    -------
    WAV bytes on success, None on failure (caller falls back to Parler TTS).
    """
    # Auto-select multilingual model for supported non-English langs
    if language in _MULTILINGUAL_LANGS and language != "en":
        model = "multilingual"

    files = {"reference": (ref_filename, io.BytesIO(reference_audio), "audio/wav")}
    data  = {
        "text":         text[:500],
        "model":        model,
        "language":     language,
        "exaggeration": str(exaggeration),
        "cfg_weight":   str(cfg_weight),
    }

    try:
        r = requests.post(
            f"{CLONER_URL}/generate",
            files   = files,
            data    = data,
            timeout = _TIMEOUT,
        )
        r.raise_for_status()
        wav = r.content
        logger.debug(
            "[ClonerClient] cloned %d chars → %d bytes WAV  lang=%s  model=%s",
            len(text), len(wav), language, model,
        )
        return wav
    except requests.exceptions.ConnectionError:
        logger.warning("[ClonerClient] voice-cloner not reachable at %s", CLONER_URL)
        return None
    except requests.exceptions.HTTPError as exc:
        logger.warning("[ClonerClient] HTTP %s — %s", exc.response.status_code, exc.response.text[:120])
        return None
    except Exception:
        logger.exception("[ClonerClient] clone request failed")
        return None


def health_check() -> dict:
    """Ping the voice-cloner /health endpoint. Returns {} on failure."""
    try:
        r = requests.get(f"{CLONER_URL}/health", timeout=3)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {}


def is_available() -> bool:
    """Return True if the voice-cloner service is reachable."""
    return bool(health_check())


def list_voices() -> list:
    """
    The current Chatterbox server has no /voices endpoint.
    Returns empty list so callers degrade gracefully.
    """
    return []
