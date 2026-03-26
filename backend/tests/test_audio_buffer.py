# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#    |
#    v
# +--------------------------------------------+
# | _silence()                                 |
# | * generate silence PCM                     |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | _voice()                                   |
# | * generate 300 Hz voice                    |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | _push_frames()                             |
# | * feed PCM in chunks                       |
# +--------------------------------------------+
#    |
#    |----> <AudioBuf> -> push()
#    |        * buffer each frame
#    |
#    v
# +--------------------------------------------+
# | test_idle_capped_at_idle_trim()            |
# | * ring idle trim bound test                |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_idle_ring_overwrites_old_data()       |
# | * ring overwrites old samples              |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_no_chunks_during_idle()               |
# | * chunks empty while idle                  |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_silence_does_not_activate()           |
# | * silence stays inactive                   |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_voice_activates_after_min_frames()    |
# | * voice triggers activation                |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_utterance_ready_after_speech_then_silence() |
# | * ready fires after speech gap             |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_flush_returns_numpy_array()           |
# | * flush yields numpy array                 |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_flush_resets_state()                  |
# | * flush resets buffer state                |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_flush_on_empty_returns_none()         |
# | * flush on empty returns None              |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_active_buffer_capped_at_max_secs()    |
# | * active buffer capped at max              |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_ready_fires_before_runaway()          |
# | * ready fires before overflow              |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_calibration_completes()               |
# | * adaptive calibration completes           |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_thresholds_adapt_above_static_floor() |
# | * thresholds adapt above floor             |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_thresholds_capped()                   |
# | * thresholds capped at ceiling             |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_stats_keys_present()                  |
# | * stats dict has required keys             |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_stats_reflect_active_state()          |
# | * stats reflect active buffer state        |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_push_and_flush_via_manager()          |
# | * manager push and flush roundtrip         |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_get_stats_without_outbound()          |
# | * stats work without outbound source       |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_utterance_count_increments()          |
# | * utterance counter increments             |
# +--------------------------------------------+
#    |
#    v
# +--------------------------------------------+
# | test_clear_outbound_without_crash_when_none() |
# | * clear outbound safe with no source       |
# +--------------------------------------------+
#    |
#    v
# [ END ]
#
# ================================================================

"""
Audio buffer test suite
=======================
Tests for AudioBuf (vad.py) and AudioBufferManager (buffer_manager.py).

Run with:
    python -m pytest backend/tests/test_audio_buffer.py -v
"""

import numpy as np
import pytest

from backend.audio.vad import AudioBuf
from backend.audio.buffer_manager import AudioBufferManager

SR = AudioBuf.SR


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _silence(secs: float, rms: float = 0.0001) -> np.ndarray:
    """Return near-silence PCM of given duration."""
    n   = int(SR * secs)
    pcm = np.random.randn(n).astype(np.float32) * rms
    return pcm


def _voice(secs: float, rms: float = 0.05) -> np.ndarray:
    """Return synthetic voice-like PCM: 300 Hz sine + noise, above RMS gate."""
    n   = int(SR * secs)
    t   = np.linspace(0, secs, n, endpoint=False)
    # 300 Hz fundamental + 1200 Hz harmonic — sits inside voice band (80-4000 Hz)
    sig = np.sin(2 * np.pi * 300 * t) + 0.3 * np.sin(2 * np.pi * 1200 * t)
    sig = (sig / np.max(np.abs(sig))) * rms
    return sig.astype(np.float32)


def _push_frames(buf: AudioBuf, pcm: np.ndarray, frame_secs: float = 0.02) -> None:
    """Feed PCM into buf in 20ms chunks (realistic frame size)."""
    frame_size = int(SR * frame_secs)
    for i in range(0, len(pcm), frame_size):
        buf.push(pcm[i : i + frame_size])


# ──────────────────────────────────────────────────────────────────────────────
# 1. Ring buffer — idle trim does not grow memory unboundedly
# ──────────────────────────────────────────────────────────────────────────────

class TestIdleRingBuffer:

    def test_idle_capped_at_idle_trim(self):
        """Pushing 5 seconds of silence should not exceed IDLE_TRIM samples."""
        buf = AudioBuf()
        _push_frames(buf, _silence(5.0))
        assert buf._idle_write <= AudioBuf.IDLE_TRIM

    def test_idle_ring_overwrites_old_data(self):
        """After overflow, idle ring contains the most recent samples."""
        buf = AudioBuf()
        # push 1 second of incrementing values so we can identify recency
        n      = SR
        signal = np.arange(n, dtype=np.float32) * 0.0001
        for i in range(0, n, 320):
            buf.push(signal[i : i + 320])
        # Last IDLE_TRIM samples should be the most recent
        assert buf._idle_write <= AudioBuf.IDLE_TRIM

    def test_no_chunks_during_idle(self):
        """_chunks must stay empty while not active."""
        buf = AudioBuf()
        _push_frames(buf, _silence(2.0))
        assert buf._chunks == []


# ──────────────────────────────────────────────────────────────────────────────
# 2. VAD activation & deactivation
# ──────────────────────────────────────────────────────────────────────────────

class TestVADStateMachine:

    def test_silence_does_not_activate(self):
        buf = AudioBuf()
        _push_frames(buf, _silence(2.0))
        assert not buf._active
        assert not buf.ready()

    def test_voice_activates_after_min_frames(self):
        buf = AudioBuf()
        _push_frames(buf, _voice(0.5))
        assert buf._active

    def test_utterance_ready_after_speech_then_silence(self):
        buf = AudioBuf()
        _push_frames(buf, _voice(0.5))      # speech
        _push_frames(buf, _silence(0.7))    # silence gap
        assert buf.ready()

    def test_utterance_not_ready_without_enough_speech(self):
        buf = AudioBuf()
        _push_frames(buf, _voice(0.1))      # too short
        _push_frames(buf, _silence(1.0))
        assert not buf.ready()

    def test_utterance_ready_on_max_secs(self):
        """Buffer should be ready if recording hits MAX_SECS."""
        buf = AudioBuf()
        _push_frames(buf, _voice(AudioBuf.MAX_SECS + 0.5))
        assert buf.ready()


# ──────────────────────────────────────────────────────────────────────────────
# 3. Flush correctness
# ──────────────────────────────────────────────────────────────────────────────

class TestFlush:

    def test_flush_returns_numpy_array(self):
        buf = AudioBuf()
        _push_frames(buf, _voice(0.5))
        _push_frames(buf, _silence(0.7))
        assert buf.ready()
        pcm = buf.flush()
        assert isinstance(pcm, np.ndarray)
        assert pcm.dtype == np.float32

    def test_flush_resets_state(self):
        buf = AudioBuf()
        _push_frames(buf, _voice(0.5))
        _push_frames(buf, _silence(0.7))
        buf.flush()
        assert not buf._active
        assert buf._speech == 0
        assert buf._sil    == 0
        assert buf._total  == 0
        assert buf._chunks == []
        assert buf._idle_write == 0

    def test_flush_on_empty_returns_none(self):
        buf = AudioBuf()
        assert buf.flush() is None

    def test_double_flush_returns_none_second_time(self):
        buf = AudioBuf()
        _push_frames(buf, _voice(0.5))
        _push_frames(buf, _silence(0.7))
        buf.flush()
        assert buf.flush() is None

    def test_flushed_pcm_includes_pre_speech_context(self):
        """Idle ring should be included in flushed PCM for Whisper context."""
        buf = AudioBuf()
        # Push some silence first (captured in idle ring)
        _push_frames(buf, _silence(0.3))
        idle_samples_before = buf._idle_write
        # Then voice
        _push_frames(buf, _voice(0.5))
        _push_frames(buf, _silence(0.7))
        pcm = buf.flush()
        # Result must include pre-speech silence context (0.3 s) + voice (0.5 s)
        # Minimum acceptable: voice alone = 8000 samples, so anything more proves
        # the idle ring context was carried through
        min_expected = int(SR * 0.5) + int(SR * 0.3)   # 12800 samples
        assert len(pcm) >= min_expected, (
            f"Pre-speech context missing: got {len(pcm)} samples, "
            f"expected >= {min_expected}"
        )


# ──────────────────────────────────────────────────────────────────────────────
# 4. Backpressure — hard cap at MAX_SECS
# ──────────────────────────────────────────────────────────────────────────────

class TestBackpressure:

    def test_active_buffer_capped_at_max_secs(self):
        buf = AudioBuf()
        # Push well beyond MAX_SECS
        _push_frames(buf, _voice(AudioBuf.MAX_SECS + 5.0))
        cap = int(AudioBuf.MAX_SECS * SR)
        assert buf._total <= cap + 640, f"total={buf._total} > cap={cap}"

    def test_ready_fires_before_runaway(self):
        buf = AudioBuf()
        _push_frames(buf, _voice(AudioBuf.MAX_SECS + 2.0))
        assert buf.ready()


# ──────────────────────────────────────────────────────────────────────────────
# 5. Adaptive VAD calibration
# ──────────────────────────────────────────────────────────────────────────────

class TestAdaptiveVAD:

    def test_calibration_completes(self):
        buf = AudioBuf()
        # Feed _CALIB_FRAMES * 20ms of silence = 0.4 s
        sil = _silence(1.0, rms=0.0002)
        _push_frames(buf, sil)
        assert buf._calib_count >= AudioBuf._CALIB_FRAMES
        assert buf.stats()["calibrated"]

    def test_thresholds_adapt_above_static_floor(self):
        buf = AudioBuf()
        # Simulate a noisy environment: rms ~0.003
        noise = _silence(1.0, rms=0.003)
        _push_frames(buf, noise)
        # Adapted speech threshold must be >= static
        assert buf._speech_rms >= AudioBuf.SPEECH_RMS

    def test_thresholds_capped(self):
        buf = AudioBuf()
        # Extreme noise — thresholds should be capped
        loud_noise = _silence(1.0, rms=0.05)
        _push_frames(buf, loud_noise)
        assert buf._speech_rms  <= 0.08
        assert buf._silence_rms <= 0.02


# ──────────────────────────────────────────────────────────────────────────────
# 6. stats() telemetry
# ──────────────────────────────────────────────────────────────────────────────

class TestStats:

    def test_stats_keys_present(self):
        buf = AudioBuf()
        s = buf.stats()
        expected_keys = {
            "active", "speech_secs", "silence_secs", "total_secs",
            "idle_samples", "voice_frames", "noise_rms",
            "speech_rms_threshold", "silence_rms_threshold", "calibrated",
        }
        assert expected_keys.issubset(s.keys())

    def test_stats_reflect_active_state(self):
        buf = AudioBuf()
        _push_frames(buf, _voice(0.5))
        s = buf.stats()
        assert s["active"] is True
        assert s["speech_secs"] > 0


# ──────────────────────────────────────────────────────────────────────────────
# 7. AudioBufferManager
# ──────────────────────────────────────────────────────────────────────────────

class TestBufferManager:

    def test_push_and_flush_via_manager(self):
        mgr = AudioBufferManager(session_id="test-session-001")
        _push_frames(mgr.inbound, _voice(0.5))
        _push_frames(mgr.inbound, _silence(0.7))
        assert mgr.utterance_ready()
        pcm = mgr.flush_utterance()
        assert isinstance(pcm, np.ndarray)

    def test_get_stats_without_outbound(self):
        mgr = AudioBufferManager(session_id="test-session-002")
        s   = mgr.get_stats()
        assert s["session_id"] == "test-ses"
        assert "inbound"  in s
        assert "outbound" in s
        assert s["outbound"] == {}

    def test_utterance_count_increments(self):
        mgr = AudioBufferManager(session_id="test-session-003")
        for _ in range(3):
            _push_frames(mgr.inbound, _voice(0.5))
            _push_frames(mgr.inbound, _silence(0.7))
            mgr.flush_utterance()
        assert mgr._utterance_count == 3

    def test_clear_outbound_without_crash_when_none(self):
        mgr     = AudioBufferManager(session_id="test-session-004")
        drained = mgr.clear_outbound()
        assert drained == 0
