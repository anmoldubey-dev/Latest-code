# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#    |
#    v
# +-------------------------------+
# | __init__()                    |
# | * create inbound and outbound |
# +-------------------------------+
#    |
#    |----> <AudioBuf> -> __init__()
#    |        * init VAD ring buffer
#    |
#    v
# +-------------------------------+
# | attach_outbound()             |
# | * wire outbound source        |
# +-------------------------------+
#    |
#    v
# +-------------------------------+
# | push_inbound()                |
# | * feed PCM into VAD buffer    |
# +-------------------------------+
#    |
#    |----> <AudioBuf> -> push()
#    |        * buffer and gate PCM
#    |
#    v
# +-------------------------------+
# | flush_utterance()             |
# | * return complete PCM array   |
# +-------------------------------+
#    |
#    |----> <AudioBuf> -> flush()
#    |        * concat and reset
#    |
#    v
# +-------------------------------+
# | clear_outbound()              |
# | * drain TTS queue on barge-in |
# +-------------------------------+
#    |
#    |----> <TtsAudioSource> -> clear()
#    |        * drain frame queue
#    |
#    v
# +-------------------------------+
# | get_stats()                   |
# | * unified telemetry snapshot  |
# +-------------------------------+
#
# ================================================================

"""
AudioBufferManager
==================
Single owner of both the inbound VAD buffer and the outbound TTS audio
source.  Consolidates buffer lifecycle, backpressure, and telemetry that
were previously scattered across vad.py, audio_source.py, and ai_worker.py.

Usage
-----
    mgr = AudioBufferManager(session_id="abc123")

    # Wire up TTS source after it's created
    mgr.attach_outbound(tts_audio_source)

    # Inbound audio loop
    mgr.push_inbound(pcm_f32)
    if mgr.utterance_ready():
        pcm = mgr.flush_utterance()

    # Barge-in
    drained = mgr.clear_outbound()

    # Monitoring
    stats = mgr.get_stats()
"""

import logging
import time
from typing import Optional

import numpy as np

from backend.audio.vad import AudioBuf

logger = logging.getLogger("callcenter.audio.buffer_manager")


class AudioBufferManager:
    """Unified owner of the inbound VAD ring buffer and outbound TTS queue."""

    def __init__(self, session_id: str) -> None:
        self._session_id = session_id
        self.inbound:  AudioBuf = AudioBuf()
        self._outbound = None   # TtsAudioSource — set via attach_outbound()

        self._created_at:     float = time.perf_counter()
        self._utterance_count: int  = 0

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def attach_outbound(self, tts_audio_source) -> None:
        """Link the TtsAudioSource after it has been created."""
        self._outbound = tts_audio_source

    # ------------------------------------------------------------------
    # Inbound (microphone → VAD)
    # ------------------------------------------------------------------

    def push_inbound(self, pcm: np.ndarray) -> None:
        """Feed a float32 PCM chunk into the VAD ring buffer."""
        self.inbound.push(pcm)

    def utterance_ready(self) -> bool:
        """True when VAD has detected a complete utterance."""
        return self.inbound.ready()

    def flush_utterance(self) -> Optional[np.ndarray]:
        """Return the complete utterance PCM and reset inbound buffer."""
        pcm = self.inbound.flush()
        if pcm is not None:
            self._utterance_count += 1
            logger.debug(
                "[BufferMgr] utterance #%d flushed  %.2f s  session=%s",
                self._utterance_count,
                len(pcm) / AudioBuf.SR,
                self._session_id[:8],
            )
        return pcm

    # ------------------------------------------------------------------
    # Outbound (TTS → LiveKit)
    # ------------------------------------------------------------------

    def clear_outbound(self) -> int:
        """Drain TTS frame queue on barge-in. Returns frames drained."""
        if self._outbound is None:
            return 0
        drained = self._outbound.clear()
        logger.debug(
            "[BufferMgr] outbound drained %d frames  session=%s",
            drained, self._session_id[:8],
        )
        return drained

    # ------------------------------------------------------------------
    # Telemetry — safe for admin polling
    # ------------------------------------------------------------------

    def get_stats(self) -> dict:
        """Unified snapshot of both inbound and outbound buffer state."""
        inbound_stats  = self.inbound.stats()
        outbound_stats = self._outbound.stats() if self._outbound else {}
        return {
            "session_id":       self._session_id[:8],
            "uptime_secs":      round(time.perf_counter() - self._created_at, 1),
            "utterance_count":  self._utterance_count,
            "inbound":          inbound_stats,
            "outbound":         outbound_stats,
        }
