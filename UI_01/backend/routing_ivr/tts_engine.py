# Piper TTS engine — synthesizes speech to WAV bytes with disk+memory cache.
# Copied from Routing/livekit/routing_ivr/tts_engine.py (no changes needed).

import asyncio
import hashlib
import io
import logging
import subprocess
import wave
from pathlib import Path
from typing import Dict, Optional

from .config import PIPER_EXE, PIPER_MODEL, ESPEAK_DATA, CACHE_DIR

logger    = logging.getLogger("ivr.tts")
_wav_cache: Dict[str, bytes] = {}


def _cache_key(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def _raw_pcm_to_wav(pcm: bytes, rate: int = 22050) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)   # 16-bit
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()


async def synthesize(text: str, model_path: str = PIPER_MODEL) -> Optional[bytes]:
    """Run Piper TTS. Returns WAV bytes or None on failure. Uses cache."""
    key = _cache_key(text)

    if key in _wav_cache:
        logger.debug("TTS cache hit: %s", text[:40])
        return _wav_cache[key]

    disk_path = CACHE_DIR / f"{key}.wav"
    if disk_path.exists():
        wav = disk_path.read_bytes()
        _wav_cache[key] = wav
        return wav

    exe   = Path(PIPER_EXE)
    model = Path(model_path)
    if not exe.exists():
        logger.error("Piper exe missing: %s", exe)
        return None
    if not model.exists():
        logger.error("Piper model missing: %s", model)
        return None

    # Run Piper in a thread-pool so it never touches the event loop's
    # subprocess transport — this is the only reliable way on Windows/uvicorn.
    def _run_piper() -> bytes:
        result = subprocess.run(
            [str(exe.absolute()), "--model", str(model.absolute()),
             "--output_raw", "--espeak_data", ESPEAK_DATA],
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=45,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode(errors="replace")[:200])
        return result.stdout

    try:
        pcm = await asyncio.to_thread(_run_piper)
        wav = _raw_pcm_to_wav(pcm)
        _wav_cache[key] = wav
        disk_path.write_bytes(wav)
        logger.info("TTS synthesized + cached: %s", text[:50])
        return wav
    except Exception as exc:
        logger.error("Piper TTS failed: %s", exc)
        return None


async def pre_warm():
    """No-op: IVR TTS pre-warm is disabled. Only queue waiting TTS is active."""
    logger.info("TTS pre-warm skipped (queue waiting TTS only)")
