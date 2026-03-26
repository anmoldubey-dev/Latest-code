# ================================================================
# backend/services/ivr_service.py
# ================================================================
#
# [ START ]
#     |
#     v
# +--------------------------------+
# | _ivr_post()                    |
# | * fire HTTP POST to IVR API    |
# +--------------------------------+
#     |
#     v
# +--------------------------------+
# | _ivr_patch()                   |
# | * fire HTTP PATCH to IVR API   |
# +--------------------------------+
#     |
#     v
# +--------------------------------+
# | register_ivr_call()            |
# | * register call get call id    |
# +--------------------------------+
#     |
#     |----> _ivr_post()
#     |        * POST to /calls/start
#     |
#     v
# +--------------------------------+
# | save_transcript()              |
# | * persist one speaker turn     |
# +--------------------------------+
#     |
#     |----> _ivr_post()
#     |        * POST to /calls/id/transcript
#     |
#     v
# +--------------------------------+
# | build_recording()              |
# | * combine turns into WAV file  |
# +--------------------------------+
#     |
#     |----> wav_bytes_to_pcm()
#     |        * decode AI WAV turns
#     |
#     |----> resample_audio()
#     |        * normalise to 16 kHz
#     |
#     v
# +--------------------------------+
# | finalize_ivr_call()            |
# | * save recording end call      |
# +--------------------------------+
#     |
#     |----> build_recording()
#     |        * combine all turns to WAV
#     |
#     |----> _ivr_patch()
#     |        * PATCH recording path to API
#     |
#     |----> _ivr_post()
#     |        * POST call end signal
#     |
#     v
# [ END ]
#
# ================================================================

import asyncio
import io
import logging
import wave
from pathlib import Path
from typing import TYPE_CHECKING, List, Optional

import numpy as np

from backend.audio.converter import wav_bytes_to_pcm, resample_audio

if TYPE_CHECKING:
    from backend.agent.livekit_session import LiveKitSession

logger = logging.getLogger("callcenter.services.ivr")

_IVR_BASE       = "http://localhost:8001"
_IVR_RECORDINGS = Path(__file__).parent.parent.parent / "ivr_backend" / "recordings"


def _ivr_post(path: str, body: dict) -> Optional[dict]:
    try:
        import requests as _req
        r = _req.post(f"{_IVR_BASE}{path}", json=body, timeout=3.0)
        if r.ok:
            return r.json()
    except Exception:
        pass
    return None


def _ivr_patch(path: str, body: dict) -> None:
    try:
        import requests as _req
        _req.patch(f"{_IVR_BASE}{path}", json=body, timeout=3.0)
    except Exception:
        pass


async def register_ivr_call(session: "LiveKitSession") -> None:
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _ivr_post, "/calls/start", {
        "caller_number": f"LiveKit-{session.session_id[:8]}",
        "department":    "AI Call",
    })
    if data and data.get("id"):
        session.ivr_call_id = data["id"]
        logger.info("[IVR] call registered  call_id=%s", session.ivr_call_id)


async def save_transcript(call_id: int, speaker: str, text: str) -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _ivr_post,
        f"/calls/{call_id}/transcript",
        {"speaker": speaker, "text": text},
    )


def build_recording(turns: List[dict]) -> Optional[bytes]:
    """Combine user PCM + AI WAV turns into a single 16 kHz mono WAV."""
    TARGET_SR   = 16_000
    GAP_SAMPLES = int(TARGET_SR * 0.12)
    all_pcm: List[np.ndarray] = []

    for turn in turns:
        try:
            if turn["type"] == "ai":
                pcm_f32, sr = wav_bytes_to_pcm(turn["wav"])
                if sr != TARGET_SR:
                    pcm_f32 = resample_audio(pcm_f32, sr, TARGET_SR)
                trim_frames = turn.get("trim_frames", 0)
                if trim_frames > 0:
                    trim_samples = trim_frames * 320
                    if trim_samples >= len(pcm_f32):
                        continue
                    pcm_f32 = pcm_f32[:-trim_samples]
                all_pcm.append(pcm_f32)
            elif turn["type"] == "user":
                all_pcm.append(turn["pcm"].astype(np.float32))
            all_pcm.append(np.zeros(GAP_SAMPLES, dtype=np.float32))
        except Exception:
            continue

    if not all_pcm:
        return None

    combined = np.concatenate(all_pcm)
    pcm_i16  = (np.clip(combined, -1.0, 1.0) * 32767).astype(np.int16)
    out = io.BytesIO()
    with wave.open(out, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(TARGET_SR)
        wf.writeframes(pcm_i16.tobytes())
    return out.getvalue()


async def finalize_ivr_call(session: "LiveKitSession") -> None:
    if not session.ivr_call_id:
        return
    loop = asyncio.get_event_loop()

    if session.recording_turns:
        wav_data = build_recording(session.recording_turns)
        if wav_data:
            try:
                _IVR_RECORDINGS.mkdir(exist_ok=True)
                filename = f"{session.ivr_call_id}.wav"
                (_IVR_RECORDINGS / filename).write_bytes(wav_data)
                await loop.run_in_executor(None, _ivr_patch,
                    f"/calls/{session.ivr_call_id}/recording",
                    {"recording_path": filename},
                )
                logger.info(
                    "[IVR] recording saved  call_id=%s  file=%s",
                    session.ivr_call_id, filename,
                )
            except Exception:
                logger.debug("[IVR] recording save failed  call_id=%s", session.ivr_call_id)

    await loop.run_in_executor(None, _ivr_post,
        f"/calls/{session.ivr_call_id}/end", {},
    )
    logger.info("[IVR] call ended  call_id=%s", session.ivr_call_id)
