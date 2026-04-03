# =============================================================================
# FILE: post_call.py
# DESC: Background cleanup tasks after a WebSocket call session closes.
# =============================================================================
#
# EXECUTION FLOW
# =============================================================================
#
#  +--------------------------------+
#  | _post_call_tasks()             |
#  | * orchestrate post-call steps  |
#  +--------------------------------+
#           |
#           |----> _write_wav()          (if audio_chunks present)
#           |
#           |----> <diarization> -> diarize()
#           |                           (if wav saved + diarization available)
#           |
#           |----> <pg_memory> -> save_call_record()
#                                       (if pg_memory + session_turns present)
#
# =============================================================================

import asyncio
import os
import wave
from pathlib import Path
from typing import List, Optional

import numpy as np

from backend.core.config import PROJECT_ROOT
from backend.core.logger import setup_logger
from backend.core.state import _m

logger = setup_logger("callcenter")

_RECORDINGS_DIR = PROJECT_ROOT / "data" / "call_recordings"
_RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)


async def _post_call_tasks(
    session_id: str,
    lang: str,
    client_phone: str,
    session_turns: List[dict],
    audio_chunks: List[np.ndarray],
) -> None:
    """
    Background task after WebSocket closes:
      1. Save accumulated PCM as .wav (16-bit, 16 kHz, mono).
      2. Run speaker diarization on the saved file (if service is up).
      3. Persist the full call record to Neon (pgvector).
    """
    loop = asyncio.get_event_loop()

    # 1. Save WAV
    wav_path: Optional[Path] = None
    if audio_chunks:
        try:
            pcm_full  = np.concatenate(audio_chunks)
            pcm_int16 = (np.clip(pcm_full, -1.0, 1.0) * 32767).astype(np.int16)
            wav_path  = _RECORDINGS_DIR / f"{session_id}.wav"

            def _write_wav():
                with wave.open(str(wav_path), "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(16000)
                    wf.writeframes(pcm_int16.tobytes())

            await loop.run_in_executor(None, _write_wav)
            logger.info("[Post-call] WAV saved  session=%s  path=%s", session_id[:8], wav_path)
        except Exception as exc:
            logger.warning("[Post-call] WAV save failed (session=%s): %s", session_id[:8], exc)
            wav_path = None

    # 2. Diarization
    diarization_segments: List[dict] = []
    if wav_path and _m.get("diarization") and _m.get("diarization_available"):
        try:
            diarization_segments = await _m["diarization"].diarize(
                file_path=str(wav_path),
                hf_token=os.getenv("HF_TOKEN", ""),
            )
            logger.info(
                "[Post-call] diarization complete  session=%s  speakers=%d  segments=%d",
                session_id[:8],
                len({s.get("speaker") for s in diarization_segments}),
                len(diarization_segments),
            )
        except Exception as exc:
            logger.warning("[Post-call] diarization error (session=%s): %s", session_id[:8], exc)

    # 3. Save call record
    if _m.get("pg_memory") and session_turns:
        try:
            await loop.run_in_executor(
                None,
                _m["pg_memory"].save_call_record,
                session_id, client_phone, lang,
                session_turns, diarization_segments,
            )
        except Exception as exc:
            logger.warning("[Post-call] pg save failed (session=%s): %s", session_id[:8], exc)
