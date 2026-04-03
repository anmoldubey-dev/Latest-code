# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-----------------------------+
# | __init__()                  |
# | * allocate ring buffer      |
# +-----------------------------+
#     |
#     v
# +-----------------------------+
# | push()                      |
# | * apply adaptive VAD        |
# +-----------------------------+
#     |
#     |----> _calibrate()
#     |        * track noise floor
#     |
#     |----> _is_voice()
#     |        * spectral voice check
#     |
#     |----> _idle_push()
#     |        * append PCM data
#     |
#     |----> _drain_idle_into_chunks()
#     |        * snapshot voice segment
#     |
#     v
# +-----------------------------+
# | ready()                     |
# | * check silence gap         |
# +-----------------------------+
#     |
#     v
# +-----------------------------+
# | flush()                     |
# | * reset and return PCM      |
# +-----------------------------+
#     |
#     v
# +-----------------------------+
# | stats()                     |
# | * expose buffer telemetry   |
# +-----------------------------+
#     |
#     v
# [ END ]
#
# ================================================================

import logging
import time
from typing import List, Optional

import numpy as np

logger = logging.getLogger(__name__)


class AudioBuf:
    SR               = 16_000
    # Static fallback thresholds (overridden after calibration)
    SPEECH_RMS       = 0.009
    SILENCE_RMS      = 0.0015
    SILENCE_SECS     = 0.55
    MIN_SPEECH       = 0.30
    MAX_SECS         = 15.0
    IDLE_TRIM        = 8_000   # ~0.5 s pre-speech rolling window

    MIN_VOICE_FRAMES = 5
    VOICE_BAND_RATIO = 2.5
    MIN_ZCR          = 0.02

    # Adaptive noise calibration: first N idle frames set the noise floor
    _CALIB_FRAMES    = 20

    def __init__(self) -> None:
        # Pre-allocated ring buffer for idle (pre-speech) audio — O(1) writes
        self._idle_ring:  np.ndarray      = np.zeros(self.IDLE_TRIM, dtype=np.float32)
        self._idle_write: int             = 0   # write pointer into ring

        # Active recording: list of numpy chunks, concatenated once at flush()
        self._chunks:     List[np.ndarray] = []
        self._speech:     int  = 0
        self._sil:        int  = 0
        self._total:      int  = 0
        self._active:     bool = False
        self._voice_frame_count: int = 0

        # Adaptive VAD thresholds
        self._calib_count:  int   = 0
        self._noise_rms:    float = 0.0
        self._speech_rms:   float = self.SPEECH_RMS
        self._silence_rms:  float = self.SILENCE_RMS

        # Latency telemetry
        self._last_push_t:  float = 0.0
        self._active_since: float = 0.0
        self._last_voice_t: float = 0.0   # time of most recent voice frame

    # ------------------------------------------------------------------
    # Adaptive noise calibration
    # ------------------------------------------------------------------

    def _calibrate(self, rms: float) -> None:
        """Running-average noise floor from first _CALIB_FRAMES idle frames."""
        if self._calib_count >= self._CALIB_FRAMES:
            return
        self._calib_count += 1
        self._noise_rms += (rms - self._noise_rms) / self._calib_count
        if self._calib_count == self._CALIB_FRAMES and self._noise_rms > 0:
            # Speech threshold: at least 4× noise floor, capped so we don't
            # silence normal speech in quiet rooms
            self._speech_rms  = min(max(self.SPEECH_RMS,  self._noise_rms * 4.0), 0.08)
            # Silence threshold: at least 1.5× noise floor
            self._silence_rms = min(max(self.SILENCE_RMS, self._noise_rms * 1.5), 0.02)

    # ------------------------------------------------------------------
    # Spectral voice check
    # ------------------------------------------------------------------

    def _is_voice(self, pcm: np.ndarray, rms: float) -> bool:
        fft   = np.fft.rfft(pcm)
        freqs = np.fft.rfftfreq(len(pcm), 1.0 / self.SR)
        mag   = np.abs(fft)

        voice_mask = (freqs >= 80) & (freqs <= 4000)
        low_mask   = freqs < 80

        voice_energy = float(np.mean(mag[voice_mask])) if voice_mask.any() else 0.0
        low_energy   = float(np.mean(mag[low_mask]))   if low_mask.any()   else 0.0

        if low_energy > 0 and voice_energy < low_energy * self.VOICE_BAND_RATIO:
            return False

        zcr = float(np.mean(np.abs(np.diff(np.sign(pcm)))))
        return zcr >= self.MIN_ZCR

    # ------------------------------------------------------------------
    # Idle ring buffer — O(1) write, no heap copies
    # ------------------------------------------------------------------

    def _idle_push(self, pcm: np.ndarray) -> None:
        """Write PCM into the pre-allocated idle ring (rolling window)."""
        n = len(pcm)
        if n >= self.IDLE_TRIM:
            # Incoming chunk larger than window — keep its last IDLE_TRIM samples
            self._idle_ring[:] = pcm[-self.IDLE_TRIM:]
            self._idle_write   = self.IDLE_TRIM
            return

        space = self.IDLE_TRIM - self._idle_write
        if n <= space:
            self._idle_ring[self._idle_write : self._idle_write + n] = pcm
            self._idle_write += n
        else:
            # Roll: shift existing data left, append new chunk at end
            keep = self.IDLE_TRIM - n
            self._idle_ring[:keep] = self._idle_ring[self.IDLE_TRIM - keep:]
            self._idle_ring[keep:] = pcm
            self._idle_write       = self.IDLE_TRIM

    def _drain_idle_into_chunks(self) -> None:
        """Snapshot the idle ring into chunks at the moment speech begins."""
        if self._idle_write > 0:
            self._chunks.append(self._idle_ring[:self._idle_write].copy())
            self._total += self._idle_write
        self._idle_write = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def push(self, pcm: np.ndarray) -> None:
        self._last_push_t = time.perf_counter()
        pcm = pcm - np.mean(pcm)           # DC offset removal
        rms = float(np.sqrt(np.mean(pcm ** 2)))

        is_speech_frame = rms >= self._speech_rms and self._is_voice(pcm, rms)

        # Calibrate noise floor only from genuine silence/noise frames.
        # Exclude voice candidates so their RMS doesn't inflate the noise floor
        # and push _speech_rms above the voice signal itself.
        if not self._active and not is_speech_frame:
            self._calibrate(rms)

        if is_speech_frame:
            self._voice_frame_count += 1
            self._last_voice_t       = time.perf_counter()
            self._speech += len(pcm)
            self._sil    = 0
            # Activate after MIN_VOICE_FRAMES consecutive voice frames
            if not self._active and self._voice_frame_count >= self.MIN_VOICE_FRAMES:
                self._active       = True
                self._active_since = time.perf_counter()
                self._drain_idle_into_chunks()
        else:
            self._voice_frame_count = 0
            if rms < self._silence_rms and self._active:
                self._sil += len(pcm)

        if self._active:
            # Hard backpressure cap: stop buffering beyond MAX_SECS
            if self._total >= int(self.MAX_SECS * self.SR):
                return
            self._chunks.append(pcm)
            self._total += len(pcm)
        else:
            self._idle_push(pcm)

    def ready(self) -> bool:
        real_speech  = self._speech / self.SR
        silence      = self._sil    / self.SR
        overlong     = self._total  / self.SR >= self.MAX_SECS
        # Time-based silence: active + no voice frame for SILENCE_SECS (works in noisy rooms
        # where RMS-based silence never clears the threshold)
        timed_out    = (
            self._active
            and self._last_voice_t > 0
            and (time.perf_counter() - self._last_voice_t) >= self.SILENCE_SECS
        )
        return real_speech >= self.MIN_SPEECH and (silence >= self.SILENCE_SECS or overlong or timed_out)

    def flush(self) -> Optional[np.ndarray]:
        parts: List[np.ndarray] = []

        # Idle ring snapshot (non-empty only when called before _active, e.g. manual flush)
        if self._idle_write > 0:
            parts.append(self._idle_ring[:self._idle_write].copy())

        if self._chunks:
            parts.append(np.concatenate(self._chunks))

        if not parts:
            return None

        arr = np.concatenate(parts) if len(parts) > 1 else parts[0]

        # Reset all state
        self._chunks            = []
        self._speech            = 0
        self._sil               = 0
        self._total             = 0
        self._active            = False
        self._voice_frame_count = 0
        self._idle_write        = 0
        self._active_since      = 0.0
        self._last_voice_t      = 0.0
        return arr

    def stats(self) -> dict:
        """Return current buffer telemetry — safe to call from any thread."""
        return {
            "active":                 self._active,
            "speech_secs":            round(self._speech / self.SR, 3),
            "silence_secs":           round(self._sil    / self.SR, 3),
            "total_secs":             round(self._total  / self.SR, 3),
            "idle_samples":           self._idle_write,
            "voice_frames":           self._voice_frame_count,
            "noise_rms":              round(self._noise_rms,    5),
            "speech_rms_threshold":   round(self._speech_rms,   5),
            "silence_rms_threshold":  round(self._silence_rms,  5),
            "calibrated":             self._calib_count >= self._CALIB_FRAMES,
        }
