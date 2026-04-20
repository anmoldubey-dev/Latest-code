# ================================================================
# backend/webrtc/utils.py
# ================================================================
#
# Audio conversion functions have moved to:
#   backend/audio_processing/converter.py
#
# This module re-exports them for backward compatibility so any
# existing caller using `from backend.webrtc.utils import X`
# continues to work without changes.
#
# The only function that lives here natively is webrtc_time_base(),
# which is WebRTC-transport-specific and does not belong in the
# generic audio_processing layer.
#
# ================================================================

from fractions import Fraction

# ── Re-exports from audio_processing (backward compat) ──────────
from backend.audio.converter import (  # noqa: F401
    wav_bytes_to_pcm,
    resample_audio,
    float32_to_int16,
    int16_to_float32,
)


def webrtc_time_base() -> Fraction:
    """Return the standard WebRTC audio time base (1/48000)."""
    return Fraction(1, 48_000)
