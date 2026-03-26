# ================================================================
# backend/audio_processing/preprocessor.py
# ================================================================
#
# [ START ]
#     |
#     v
# +------------------------------------------+
# | process_audio_for_stt()                  |
# | * convert any audio to 16k float32       |
# +------------------------------------------+
#     |
#     |----> _load_to_tensor()
#     |        * load WAV/MP3/FLAC via torchaudio
#     |
#     |----> _to_16k_mono()
#     |        * resample and mix down to mono
#     |
#     |----> _normalise()
#     |        * clip and RMS boost to 0.12
#     |
#     v
# +------------------------------------------+
# | _load_to_tensor()                        |
# | * load audio bytes or file path          |
# +------------------------------------------+
#     |
#     v
# +------------------------------------------+
# | _to_16k_mono()                           |
# | * mix channels resample to 16 kHz        |
# +------------------------------------------+
#     |
#     v
# +------------------------------------------+
# | _normalise()                             |
# | * clip and RMS normalize audio           |
# +------------------------------------------+
#     |
#     v
# [ RETURN float32 ndarray 16 kHz mono ]
#
# ================================================================

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Union

import numpy as np

logger = logging.getLogger(__name__)

# Target audio spec that faster-whisper / Whisper expects
_TARGET_SR: int = 16_000
_TARGET_RMS: float = 0.12
_RMS_MIN_THRESHOLD: float = 0.0005   # below this → treat as silence, skip gain
_MAX_GAIN: float = 30.0              # safety ceiling — avoid amplifying pure noise


# ──────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────

def _load_to_tensor(source):
    """
    Load audio from a file-like object or path.
    Returns (waveform_tensor [C, T], sample_rate).
    Primary: torchaudio  |  Fallback: soundfile
    """
    import torch

    # ── Primary: torchaudio ──────────────────────────────────
    try:
        import torchaudio
        waveform, sr = torchaudio.load(source, normalize=True)
        return waveform, sr
    except Exception as e_ta:
        logger.debug("[AudioPrep] torchaudio.load failed (%s), trying soundfile …", e_ta)

    # ── Fallback: soundfile ──────────────────────────────────
    try:
        import soundfile as sf
        # soundfile needs seekable; reset if bytes-io
        if hasattr(source, "seek"):
            source.seek(0)
        data, sr = sf.read(source, dtype="float32", always_2d=True)
        # soundfile returns (T, C) → transpose to (C, T)
        waveform = torch.from_numpy(data.T)
        return waveform, sr
    except Exception as e_sf:
        raise RuntimeError(
            f"[AudioPrep] Both torchaudio and soundfile failed to load audio. "
            f"torchaudio: {e_ta} | soundfile: {e_sf}"
        )


def _to_16k_mono(waveform, sr: int):
    """
    Resample to TARGET_SR and mix-down to mono — all in-memory, no disk I/O.
    Returns a 1-D float32 NumPy array.
    """
    import torch, torchaudio

    # Mix to mono first (reduces data before resampling → faster)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)   # (1, T)

    # Resample only when needed
    if sr != _TARGET_SR:
        resampler = torchaudio.transforms.Resample(
            orig_freq=sr,
            new_freq=_TARGET_SR,
            resampling_method="sinc_interp_kaiser",  # best quality sinc
            lowpass_filter_width=64,                 # wider filter → cleaner
            rolloff=0.99,                            # preserve speech harmonics
        )
        waveform = resampler(waveform)

    # (1, T) → (T,) as float32 numpy
    return waveform.squeeze(0).numpy().astype(np.float32)


def _normalise(pcm: np.ndarray) -> np.ndarray:
    """
    Hard-clip then RMS-normalise to _TARGET_RMS.
    Quiet callers on phone lines are boosted; already-loud signals are untouched.
    """
    pcm = np.clip(pcm, -1.0, 1.0)
    rms = float(np.sqrt(np.mean(pcm ** 2)))
    if rms > _RMS_MIN_THRESHOLD:
        gain = min(_TARGET_RMS / rms, _MAX_GAIN)
        if gain > 1.0:
            pcm = np.clip(pcm * gain, -1.0, 1.0)
    return pcm


# ──────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────

def process_audio_for_stt(
    audio_bytes_or_path: Union[bytes, str, Path, "np.ndarray"],
) -> np.ndarray:
    """
    Convert any incoming audio into a 16 kHz mono float32 NumPy array
    ready for faster-whisper — no temp files, fully in-memory.

    Parameters
    ----------
    audio_bytes_or_path:
        - np.ndarray  : already-decoded PCM (16 kHz mono assumed) — only
                        normalisation is applied, no resampling overhead.
        - bytes       : raw audio bytes (WAV / MP3 / FLAC / OGG)
        - str / Path  : file path to any supported audio file

    Returns
    -------
    np.ndarray
        float32, shape (N,), sampled at 16 000 Hz, single channel,
        values approximately in [-1, 1].
    """
    # Fast path: already a numpy array (e.g. live PCM from StreamingTranscriber)
    # Skip loading/resampling — just clip + RMS normalise.
    if isinstance(audio_bytes_or_path, np.ndarray):
        pcm = audio_bytes_or_path.astype(np.float32)
        if pcm.ndim > 1:
            pcm = pcm.mean(axis=0)          # mix to mono if multi-channel
        return _normalise(pcm)

    # Wrap bytes in a seekable buffer — avoids any disk write
    if isinstance(audio_bytes_or_path, (bytes, bytearray)):
        source = io.BytesIO(audio_bytes_or_path)
    else:
        source = Path(audio_bytes_or_path)
        if not source.exists():
            raise FileNotFoundError(f"[AudioPrep] File not found: {source}")

    waveform, sr = _load_to_tensor(source)
    pcm = _to_16k_mono(waveform, sr)
    pcm = _normalise(pcm)

    logger.debug(
        "[AudioPrep] processed: %.2f s | %d samples | sr=%d → 16k",
        len(pcm) / _TARGET_SR, len(pcm), sr,
    )
    return pcm
