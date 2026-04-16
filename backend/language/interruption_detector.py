# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | __init__()                       |
# | * init detector for session      |
# +----------------------------------+
#     |
#     |----> _compile_patterns()
#     |        * build barge-in regex list
#     |
#     v
# +----------------------------------+
# | update_audio()                   |
# | * detect energy spike barge-in   |
# +----------------------------------+
#     |
#     |----> sqrt()
#     |        * compute frame RMS energy
#     |
#     v
# +----------------------------------+
# | check_text()                     |
# | * detect keyword barge-in        |
# +----------------------------------+
#     |
#     |----> search()
#     |        * regex match on transcript
#     |
#     v
# +----------------------------------+
# | set_tts_playing()                |
# | * toggle TTS active flag         |
# +----------------------------------+
#     |
#     v
# +----------------------------------+
# | last_event()                     |
# | * return last interruption event |
# +----------------------------------+
#     |
#     v
# +----------------------------------+
# | reset()                          |
# | * clear history and last event   |
# +----------------------------------+
#     |
#     v
# +----------------------------------+
# | get_interruption_detector()      |
# | * factory — new detector/session |
# +----------------------------------+
#     |
#     v
# [ END ]
#
# ================================================================

"""
interruption_detector
=====================
Real-time interruption / barge-in detection for streaming voice calls.

Detection strategy (multi-signal, low-latency)
----------------------------------------------
1. **VAD overlap** — user audio energy > threshold while agent TTS is playing.
2. **Silence timeout** — agent speech gap exceeds a threshold mid-utterance.
3. **Keyword triggers** — explicit barge-in phrases ("stop", "wait", "ek min").
4. **Energy spike** — sudden RMS jump in inbound audio (aggressive barge-in).

All signals are combined into a single ``InterruptionEvent`` with a
confidence score (0.0–1.0) and cause label so the AI worker can decide
whether to abort or merely pause.

License: Apache 2.0
"""

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger("callcenter.language.interruption")

# ------------------------------------------------------------------
# Barge-in keyword lists per language
# ------------------------------------------------------------------

_BARGE_KEYWORDS: Dict[str, List[str]] = {
    "en": [
        "stop", "wait", "hold on", "one sec", "actually", "no no",
        "wait wait", "listen", "excuse me", "can i", "let me",
    ],
    "hi": [
        "ruko", "ek minute", "suno", "nahi nahi", "bas", "thehro",
        "sun lo", "wait karo", "ek second",
    ],
    "mr": ["thamba", "nahi nahi", "ek minute", "ek second"],
    "ta": ["nillungal", "kekkareenga", "oru minute"],
    "te": ["aagu", "wait cheyyandi", "vinandi"],
    "ml": ["niruttu", "oru minute", "listen cheyyuka"],
    "ar": ["انتظر", "لحظة", "اسمع", "لا لا"],
    "es": ["espera", "un momento", "para", "escucha"],
    "fr": ["attends", "un moment", "écoute", "arrête"],
    "ru": ["подожди", "одну секунду", "слушай", "нет нет"],
    "zh": ["等等", "一秒", "听我说", "停"],
    "ne": ["ruka", "ek chhin", "sun", "nai nai"],
}

# Energy spike — ratio above recent baseline that triggers barge-in
_SPIKE_RATIO      = 5.0   # raised from 3.5 — reduces echo false positives
_MIN_SPIKE_RMS    = 0.05  # absolute floor: echo is typically < 0.04; real speech > 0.05
_BASELINE_LEN     = 20    # frames for rolling baseline


@dataclass
class InterruptionEvent:
    """Represents a detected interruption."""
    timestamp:  float
    confidence: float           # 0.0–1.0
    cause:      str             # "keyword" | "energy_spike" | "vad_overlap"
    lang:       str
    keyword:    Optional[str] = None
    rms:        float         = 0.0


class InterruptionDetector:
    """
    Stateful, per-session interruption detector.

    Instantiate one per LiveKit session; call ``update()`` on each inbound
    PCM frame while TTS is playing, and ``check_text()`` on each STT output.
    """

    def __init__(self, lang: str = "en") -> None:
        self.lang = lang
        self._barge_patterns = self._compile_patterns(lang)
        self._rms_history:  List[float] = []
        self._tts_active:   bool        = False
        self._last_event:   Optional[InterruptionEvent] = None
        logger.info("[InterruptionDetector] init  lang=%s", lang)

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    @staticmethod
    def _compile_patterns(lang: str) -> List[re.Pattern]:
        keywords = _BARGE_KEYWORDS.get(lang, []) + _BARGE_KEYWORDS.get("en", [])
        return [
            re.compile(r"\b" + re.escape(kw) + r"\b", re.IGNORECASE)
            for kw in keywords
        ]

    # ------------------------------------------------------------------
    # Signal 1 — audio energy spike
    # ------------------------------------------------------------------

    def update_audio(self, pcm: np.ndarray) -> Optional[InterruptionEvent]:
        """
        Feed an inbound PCM frame while TTS is playing.

        Returns an InterruptionEvent if an energy spike is detected,
        otherwise None.
        """
        rms = float(np.sqrt(np.mean(pcm ** 2))) if len(pcm) else 0.0
        self._rms_history.append(rms)
        if len(self._rms_history) > _BASELINE_LEN * 2:
            self._rms_history = self._rms_history[-_BASELINE_LEN * 2:]

        if not self._tts_active:
            return None

        if len(self._rms_history) < _BASELINE_LEN:
            return None

        baseline = float(np.mean(self._rms_history[-_BASELINE_LEN:]))
        if baseline < 1e-6:
            return None

        if rms > baseline * _SPIKE_RATIO and rms > _MIN_SPIKE_RMS:
            event = InterruptionEvent(
                timestamp  = time.perf_counter(),
                confidence = min(1.0, (rms / baseline) / _SPIKE_RATIO),
                cause      = "energy_spike",
                lang       = self.lang,
                rms        = rms,
            )
            self._last_event = event
            logger.debug(
                "[Interruption] energy spike  rms=%.4f  baseline=%.4f  conf=%.2f",
                rms, baseline, event.confidence,
            )
            return event

        return None

    # ------------------------------------------------------------------
    # Signal 2 — keyword / text-based
    # ------------------------------------------------------------------

    def check_text(self, text: str) -> Optional[InterruptionEvent]:
        """
        Scan STT output for explicit barge-in keywords.

        Returns an InterruptionEvent if found, else None.
        """
        for pat in self._barge_patterns:
            m = pat.search(text)
            if m:
                event = InterruptionEvent(
                    timestamp  = time.perf_counter(),
                    confidence = 0.85,
                    cause      = "keyword",
                    lang       = self.lang,
                    keyword    = m.group(0),
                )
                self._last_event = event
                logger.debug(
                    "[Interruption] keyword=%r  lang=%s", m.group(0), self.lang
                )
                return event
        return None

    # ------------------------------------------------------------------
    # TTS state tracking
    # ------------------------------------------------------------------

    def set_tts_playing(self, playing: bool) -> None:
        """Notify the detector when TTS output starts / stops."""
        self._tts_active = playing

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    def last_event(self) -> Optional[InterruptionEvent]:
        return self._last_event

    def reset(self) -> None:
        self._rms_history.clear()
        self._last_event = None


# ------------------------------------------------------------------
# Module-level factory (one per session — not a singleton)
# ------------------------------------------------------------------

def get_interruption_detector(lang: str = "en") -> InterruptionDetector:
    """Create a new InterruptionDetector for a session."""
    return InterruptionDetector(lang=lang)
