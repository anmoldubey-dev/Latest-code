# =============================================================================
# FILE: call_vad.py
# DESC: Lightweight energy-based VAD for WebSocket call/STT handlers.
# =============================================================================
#
# EXECUTION FLOW
# =============================================================================
#
#  +-----------------------------+
#  | __init__()                  |
#  | * init buffer, silence gap  |
#  +-----------------------------+
#           |
#           v
#  +-----------------------------+
#  | feed()                      |
#  | * compute RMS, buffer PCM   |
#  +-----------------------------+
#           |
#           |----> _fire()           (when silence_gap elapsed after speech)
#                    |
#                    |----> <on_utterance> -> __call__()
#
#  +-----------------------------+
#  | clear()                     |
#  | * reset buffer and timer    |
#  +-----------------------------+
#
# =============================================================================
"""
SimpleVAD
---------
Lightweight energy-based VAD used by the WebSocket call/STT-test handlers.
Buffers PCM chunks and signals when an utterance is ready (post-speech silence elapsed).

For the full adaptive VAD with spectral checks, see backend/audio/vad.py (AudioBuf).
"""

import asyncio
from typing import Callable, List, Optional

import numpy as np

_SPEECH_RMS  = 0.03    # energy floor to detect voice
_DEFAULT_GAP = 0.9     # seconds of post-speech silence before firing


class SimpleVAD:
    """
    Push PCM float32 chunks via `feed()`.
    When an utterance completes, `on_utterance` coroutine is called with the PCM array.
    """

    def __init__(
        self,
        on_utterance: Callable[[np.ndarray], asyncio.Future],
        silence_gap: float = _DEFAULT_GAP,
        loop: Optional[asyncio.AbstractEventLoop] = None,
    ) -> None:
        self._on_utterance   = on_utterance
        self._silence_gap    = silence_gap
        self._loop           = loop or asyncio.get_event_loop()
        self._buf:           List[np.ndarray] = []
        self._last_voice_t:  Optional[float]  = None

    def feed(self, pcm: np.ndarray, locked: bool = False) -> None:
        """
        Feed a PCM chunk. Fires on_utterance when silence_gap elapses after speech.
        `locked` — pass True while a turn is already processing to suppress firing.
        """
        rms = float(np.sqrt(np.mean(pcm ** 2)))
        if rms > _SPEECH_RMS:
            self._buf.append(pcm)
            self._last_voice_t = self._loop.time()
        elif self._last_voice_t is not None:
            elapsed = self._loop.time() - self._last_voice_t
            if elapsed < self._silence_gap:
                self._buf.append(pcm)  # only buffer silence within the gap window
            if not locked and elapsed >= self._silence_gap:
                self._fire()

    def _fire(self) -> None:
        pcm = np.concatenate(self._buf)
        self._buf.clear()
        self._last_voice_t = None
        asyncio.ensure_future(self._on_utterance(pcm))

    def clear(self) -> None:
        self._buf.clear()
        self._last_voice_t = None
