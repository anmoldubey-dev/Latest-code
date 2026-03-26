# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#    |
#    v
# +-------------------------------+
# | process()                     |
# | * full DSP pipeline on audio  |
# +-------------------------------+
#    |
#    |----> peak normalize
#    |        * normalize raw TTS to 0.95 peak
#    |
#    |----> _mix_room_ambience()
#    |        * blend call centre room WAV
#    |
#    |----> _apply_eq()
#    |        * boost 400 Hz warmth, 4 kHz clarity
#    |
#    |----> _loudness_normalize()
#    |        * normalize output to -24 LUFS
#    |
#    v
# +-------------------------------+
# | crossfade()                   |
# | * overlap-add two segments    |
# +-------------------------------+
#    |
#    v
# [ RETURN processed float32 audio ]
#
# ================================================================

import logging
import numpy as np
from pathlib import Path
from scipy.signal import lfilter, resample_poly
from math import gcd

logger = logging.getLogger(__name__)

SAMPLE_RATE  = 44100
ASSETS_DIR   = Path(__file__).resolve().parent.parent / "assets"
TARGET_LUFS  = -24.0


def _parametric_peak(audio: np.ndarray, sr: int, center_hz: float,
                     gain_db: float, Q: float = 0.9) -> np.ndarray:
    A      = 10 ** (gain_db / 40)
    w0     = 2 * np.pi * center_hz / sr
    alpha  = np.sin(w0) / (2 * Q)
    cos_w0 = np.cos(w0)

    b0 = 1 + alpha * A;  b1 = -2 * cos_w0;  b2 = 1 - alpha * A
    a0 = 1 + alpha / A;  a1 = -2 * cos_w0;  a2 = 1 - alpha / A

    b = np.array([b0 / a0, b1 / a0, b2 / a0])
    a = np.array([1.0,     a1 / a0, a2 / a0])
    return lfilter(b, a, audio).astype(np.float32)


def _resample(audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    if orig_sr == target_sr:
        return audio
    g = gcd(orig_sr, target_sr)
    return resample_poly(audio, target_sr // g, orig_sr // g).astype(np.float32)


class HumanVoiceSculptor:

    def __init__(self):
        self._room_audio: np.ndarray | None = None
        self._room_sr: int = SAMPLE_RATE
        self._room_loaded: bool = False

    def _load_room_audio(self):
        room_file = ASSETS_DIR / "call_centre_room.wav"
        logger.info("Looking for room audio at: %s", room_file)
        if not room_file.exists():
            logger.warning(
                "assets/call_centre_room.wav not found — room ambience disabled. "
                "Drop the file into human_tts_2/assets/ to enable it."
            )
            return
        try:
            import soundfile as sf
            data, sr = sf.read(str(room_file), dtype="float32")
            if data.ndim > 1:
                data = data.mean(axis=1)
            self._room_audio = data
            self._room_sr    = sr
            logger.info(
                "Room ambience loaded: %s  (%.1fs @ %d Hz)",
                room_file.name, len(data) / sr, sr,
            )
        except Exception as exc:
            logger.warning("Failed to load room audio: %s", exc)

    def _mix_room_ambience(self, speech: np.ndarray, sr: int) -> np.ndarray:
        if not self._room_loaded:
            self._load_room_audio()
            self._room_loaded = True
        if self._room_audio is None:
            return speech

        room = _resample(self._room_audio, self._room_sr, sr)

        if len(room) > 1:
            offset = np.random.randint(0, len(room))
            room   = np.roll(room, -offset)

        if len(room) < len(speech):
            cf      = min(int(sr * 0.05), len(room) // 4)
            fade_o  = np.linspace(1.0, 0.0, cf, dtype=np.float32)
            fade_i  = np.linspace(0.0, 1.0, cf, dtype=np.float32)
            overlap = room[-cf:] * fade_o + room[:cf] * fade_i
            looped  = np.concatenate([room[:-cf], overlap, room[cf:]])

            repeats = int(np.ceil(len(speech) / len(looped))) + 1
            room    = np.tile(looped, repeats)

        room = room[: len(speech)]

        snr_db          = np.random.uniform(12, 16)
        speech_rms      = np.sqrt(np.mean(speech ** 2) + 1e-9)
        room_rms        = np.sqrt(np.mean(room   ** 2) + 1e-9)
        target_room_rms = speech_rms / (10 ** (snr_db / 20))
        room_scaled     = room * (target_room_rms / room_rms)

        mixed = speech + room_scaled
        peak  = np.abs(mixed).max()
        if peak > 0.95:
            mixed = mixed / peak * 0.95
        return mixed

    def _apply_eq(self, audio: np.ndarray, sr: int) -> np.ndarray:
        audio = _parametric_peak(audio, sr, center_hz=400,  gain_db=2.5, Q=0.9)
        audio = _parametric_peak(audio, sr, center_hz=4000, gain_db=2.0, Q=1.0)
        return audio

    def _loudness_normalize(self, audio: np.ndarray, sr: int) -> np.ndarray:
        try:
            import pyloudnorm as pyln
            if len(audio) / sr < 0.4:
                return audio
            meter    = pyln.Meter(sr)
            loudness = meter.integrated_loudness(audio.astype(np.float64))
            if np.isfinite(loudness) and loudness > -70.0:
                audio = pyln.normalize.loudness(
                    audio.astype(np.float64), loudness, TARGET_LUFS
                ).astype(np.float32)
        except Exception as exc:
            logger.warning("Loudness normalization skipped: %s", exc)
        return audio

    def process(self, audio: np.ndarray, emotion: str,
                sr: int = SAMPLE_RATE) -> np.ndarray:
        audio = audio.astype(np.float32)

        peak = np.abs(audio).max()
        if peak > 0:
            audio = audio / peak * 0.95

        audio = self._mix_room_ambience(audio, sr)
        audio = self._apply_eq(audio, sr)
        audio = self._loudness_normalize(audio, sr)

        return audio

    @staticmethod
    def crossfade(a: np.ndarray, b: np.ndarray,
                  sr: int = SAMPLE_RATE) -> np.ndarray:
        n = min(int(sr * 0.1), len(a), len(b))
        if n == 0:
            return np.concatenate([a, b])
        fade_out = np.linspace(1.0, 0.0, n, dtype=np.float32)
        fade_in  = np.linspace(0.0, 1.0, n, dtype=np.float32)
        overlap  = a[-n:] * fade_out + b[:n] * fade_in
        return np.concatenate([a[:-n], overlap, b[n:]])
