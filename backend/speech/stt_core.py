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
#     |        * Whisper decode to text
#     |
#     v
# [ END ]
# ================================================================

import logging
from typing import Optional

import numpy as np

from backend.core.config import LANGUAGE_CONFIG
from backend.core.state import _m

logger = logging.getLogger("callcenter.stt")

# RMS floor — last-resort gate before Whisper (VAD already filters silence).
# The flushed buffer includes ~0.5s idle + speech + ~0.55s silence, so overall
# RMS is much lower than per-frame speech RMS. 0.003 rejects true-silence
# buffers while passing all speech that cleared the VAD (SPEECH_RMS=0.009).
_RMS_FLOOR = 0.003


def stt_sync(pcm: np.ndarray, lang: str) -> str:
    raw_rms = float(np.sqrt(np.mean(pcm ** 2)))
    if raw_rms < _RMS_FLOOR:
        logger.warning("[STT] skip — below speech floor (rms=%.5f < %.3f)", raw_rms, _RMS_FLOOR)
        return ""
    logger.info("[STT] transcribing  dur=%.2fs  rms=%.4f  lang=%s",
                len(pcm) / 16000, raw_rms, lang)
    stt_prompt: Optional[str] = LANGUAGE_CONFIG.get(lang, {}).get("stt_prompt")
    result = _m["stt"].transcribe_pcm(pcm, language=lang, initial_prompt=stt_prompt)
    logger.info("[STT] result: %r", result)
    return result
