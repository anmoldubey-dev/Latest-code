# IVR Agent router — intent classification and department routing.
# TTS has been removed: only the queue waiting announcement (queue_engine) uses TTS.

import logging
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from .config import VALID_DEPARTMENTS
from .intent_classifier import classify_intent

# Whisper STT — optional
try:
    import whisper as _whisper
    _whisper_model = _whisper.load_model("base")
    _WHISPER_AVAILABLE = True
except Exception:
    _whisper_model     = None
    _WHISPER_AVAILABLE = False

logger     = logging.getLogger("ivr.agent")
ivr_router = APIRouter(prefix="/ivr", tags=["ivr"])

_active_sessions = {}


class IvrProcessRequest(BaseModel):
    session_id:  str
    room_id:     str
    transcript:  str
    caller_id:   Optional[str] = None


class IvrProcessResponse(BaseModel):
    department:      str
    urgency:         int
    routing_message: str
    session_id:      str


@ivr_router.post("/process", response_model=IvrProcessResponse)
async def ivr_process(req: IvrProcessRequest):
    transcript = req.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Empty transcript")

    logger.info("[IVR] Processing transcript for session %s: %s",
                req.session_id, transcript[:80])

    department, urgency = await classify_intent(transcript)
    routing_msg         = f"Routing your call to the {department}."

    return IvrProcessResponse(
        department      = department,
        urgency         = urgency,
        routing_message = routing_msg,
        session_id      = req.session_id,
    )


@ivr_router.get("/status")
async def ivr_status():
    from .config import GEMINI_API_KEY
    return {
        "status":           "ok",
        "tts":              "disabled (queue waiting TTS only)",
        "gemini_configured": bool(GEMINI_API_KEY),
        "departments":      VALID_DEPARTMENTS,
        "active_sessions":  len(_active_sessions),
    }


@ivr_router.get("/departments")
async def list_departments():
    return {"departments": VALID_DEPARTMENTS}


@ivr_router.post("/transcribe")
async def ivr_transcribe(audio: UploadFile = File(...)):
    """Whisper STT — accepts a WAV/MP3/OGG upload and returns a transcript."""
    if not _WHISPER_AVAILABLE or _whisper_model is None:
        raise HTTPException(
            status_code=503,
            detail="Whisper STT not available — install openai-whisper to enable transcription",
        )

    content = await audio.read()
    suffix  = os.path.splitext(audio.filename or "audio.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        import asyncio
        result = await asyncio.get_running_loop().run_in_executor(
            None, lambda: _whisper_model.transcribe(tmp_path)
        )
        transcript = result.get("text", "").strip()
        language   = result.get("language", "en")
        logger.info("[IVR/transcribe] lang=%s  chars=%d", language, len(transcript))
        return {"transcript": transcript, "language": language}
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
