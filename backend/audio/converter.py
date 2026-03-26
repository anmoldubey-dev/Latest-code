# ================================================================
# backend/audio_processing/converter.py
# ================================================================
#
# [ START ]
#     |
#     v
# +------------------------------------------+
# | wav_bytes_to_pcm()                       |
# | * decode WAV bytes to float32 mono       |
# +------------------------------------------+
#     |
#     |----> wave.open()
#     |        * parse WAV header and frames
#     |
#     |----> frombuffer()
#     |        * decode int16 or float32 samples
#     |
#     |----> mean()
#     |        * mix stereo or multi to mono
#     |
#     v
# +------------------------------------------+
# | resample_audio()                         |
# | * polyphase resample to target rate      |
# +------------------------------------------+
#     |
#     |----> gcd()
#     |        * compute up/down ratio
#     |
#     |----> resample_poly()
#     |        * high-quality polyphase resample
#     |
#     v
# +------------------------------------------+
# | float32_to_int16()                       |
# | * clip and scale to int16                |
# +------------------------------------------+
#     |
#     v
# +------------------------------------------+
# | int16_to_float32()                       |
# | * scale int16 to float32 range           |
# +------------------------------------------+
#
# ================================================================

import io
import wave
from math import gcd
from typing import Tuple

import numpy as np
from scipy.signal import resample_poly


def wav_bytes_to_pcm(wav_bytes: bytes) -> Tuple[np.ndarray, int]:
    """Decode WAV bytes to a float32 mono PCM array + sample rate."""
    with wave.open(io.BytesIO(wav_bytes)) as wf:
        n_channels   = wf.getnchannels()
        sample_rate  = wf.getframerate()
        sample_width = wf.getsampwidth()
        n_frames     = wf.getnframes()
        raw          = wf.readframes(n_frames)

    if sample_width == 2:
        pcm = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sample_width == 4:
        pcm = np.frombuffer(raw, dtype=np.float32).copy()
    else:
        raise ValueError(
            f"Unsupported WAV sample width: {sample_width} bytes "
            f"(expected 2 for int16 or 4 for float32)"
        )

    if n_channels == 2:
        pcm = pcm.reshape(-1, 2).mean(axis=1).astype(np.float32)
    elif n_channels > 2:
        pcm = pcm.reshape(-1, n_channels).mean(axis=1).astype(np.float32)

    return pcm, sample_rate


def resample_audio(pcm: np.ndarray, from_sr: int, to_sr: int) -> np.ndarray:
    """Polyphase resample audio PCM from from_sr to to_sr."""
    if from_sr == to_sr:
        return pcm.astype(np.float32)

    g    = gcd(from_sr, to_sr)
    up   = to_sr   // g
    down = from_sr // g
    resampled = resample_poly(pcm.astype(np.float64), up, down)
    return resampled.astype(np.float32)


def float32_to_int16(pcm: np.ndarray) -> np.ndarray:
    """Clip float32 [-1, 1] and scale to int16."""
    clipped = np.clip(pcm, -1.0, 1.0)
    return (clipped * 32767.0).astype(np.int16)


def int16_to_float32(pcm: np.ndarray) -> np.ndarray:
    """Normalise int16 samples to float32 [-1, 1]."""
    return pcm.astype(np.float32) / 32768.0
