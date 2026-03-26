# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-----------------------------+
# | stt_sync()                  |
# | * RMS gate then transcribe  |
# +-----------------------------+
#     |
#     |----> sqrt()
#     |        * compute RMS energy floor
#     |
#     |----> mean()
#     |        * average PCM samples
#     |
#     |----> <StreamingTranscriber> -> transcribe_pcm()
#     |        * Whisper decode PCM to text
#     |
#     v
# [ RETURN transcribed text string ]
#
# NOTE: _collapse_repetitions() and _is_hallucination() live in
#       backend/stt/postprocessor.py — import from there.
#
# ================================================================

import logging
from typing import Optional

import numpy as np

from backend.core.config import LANGUAGE_CONFIG
from backend.core.state import _m

logger = logging.getLogger("callcenter.stt")

# RMS floor — reject frames below this before sending to Whisper.
# 0.015 filters wind/breath/HVAC while keeping normal speech (typical speech RMS 0.03-0.15).
_RMS_FLOOR = 0.015


def stt_sync(pcm: np.ndarray, lang: str) -> str:
    raw_rms = float(np.sqrt(np.mean(pcm ** 2)))
    if raw_rms < _RMS_FLOOR:
        logger.debug("[STT] skip — below speech floor (rms=%.5f)", raw_rms)
        return ""
    stt_prompt: Optional[str] = LANGUAGE_CONFIG.get(lang, {}).get("stt_prompt")
    # Pass lang directly — transcribe_pcm validates against _ALL_SUPPORTED_LANGS internally,
    # so all 26 model-supported languages (de, pl, bn, gu, kn, pa, etc.) get a proper hint.
    return _m["stt"].transcribe_pcm(pcm, language=lang, initial_prompt=stt_prompt)
