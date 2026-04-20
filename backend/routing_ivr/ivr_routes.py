"""
ivr_routes.py — IVR endpoints for pre-call language detection + intent classification.

GET  /ivr/greeting              — Returns greeting WAV audio
POST /ivr/classify              — Takes transcript → returns {lang, department, routing}
GET  /ivr/status                — Health check
"""
import asyncio
import logging
import os
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

logger = logging.getLogger("callcenter.ivr")

ivr_router = APIRouter(prefix="/ivr", tags=["ivr"])

# Supported departments for AI routing
DEPARTMENTS = [
    "General Support",
    "Technical Support",
    "Billing",
    "Sales",
    "Account Management",
]

GREETING_TEXT = "Hello! Welcome to SR Comsoft. Please say your preferred language to get started."

# ── IVR Request/Response models ────────────────────────────────────────────────

class ClassifyRequest(BaseModel):
    transcript:  str
    session_id:  str = ""
    hint_lang:   str = "en"


class ClassifyResponse(BaseModel):
    lang:       str
    voice:      str
    llm:        str
    queue_name: str
    rule_name:  str
    matched:    bool


class CallRequest(BaseModel):
    lang:       str = "en"
    email:      str = ""
    session_id: str = ""


class CallResponse(BaseModel):
    status:     str        # "ok" | "queued" | "full"
    voice:      str = ""
    session_id: str = ""
    queued:     bool = False
    email_sent: bool = False


# Piper model path — reuse the model from UI_01 routing folder
_PIPER_MODEL = os.path.join(
    os.path.dirname(__file__), "..", "..",
    "UI_01", "Routing", "Routing", "piper", "models", "en_US-ryan-high.onnx"
)
_PIPER_MODEL = os.path.normpath(_PIPER_MODEL)


_piper_voice = None  # lazy-loaded singleton

def _piper_tts_sync(text: str) -> bytes:
    """Generate WAV bytes using Piper Python API (no network, no port 8003 needed)."""
    global _piper_voice
    import io, wave
    from piper import PiperVoice
    if not os.path.exists(_PIPER_MODEL):
        raise FileNotFoundError(f"Piper model not found: {_PIPER_MODEL}")
    if _piper_voice is None:
        _piper_voice = PiperVoice.load(_PIPER_MODEL)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(22050)
        _piper_voice.synthesize_wav(text, wf)
    return buf.getvalue()


# ── Greeting endpoint ──────────────────────────────────────────────────────────

@ivr_router.get("/greeting")
async def ivr_greeting(lang: str = "en"):
    """
    Return the IVR greeting as WAV audio.
    Uses Piper TTS directly (no port 8003 dependency).
    """
    loop = asyncio.get_event_loop()
    try:
        wav = await loop.run_in_executor(None, _piper_tts_sync, GREETING_TEXT)
        return Response(content=wav, media_type="audio/wav")
    except Exception as exc:
        logger.warning("[IVR] Piper TTS failed: %s — trying pipeline fallback", exc)
        try:
            from backend.speech.tts_client import tts
            wav = await tts(GREETING_TEXT, lang, "")
            return Response(content=wav, media_type="audio/wav")
        except Exception as exc2:
            logger.warning("[IVR] greeting TTS fallback also failed: %s", exc2)
            return Response(status_code=503, content=b"")


# ── Classify endpoint ──────────────────────────────────────────────────────────

@ivr_router.post("/classify", response_model=ClassifyResponse)
async def ivr_classify(req: ClassifyRequest):
    """
    Takes caller's first sentence (transcript from browser Web Speech API).
    Uses Gemini to detect language and department.
    Then runs routing engine to get the AI voice/LLM assignment.
    """
    loop    = asyncio.get_event_loop()
    lang    = req.hint_lang
    dept    = "General Support"
    urgency = 3

    # ── Classify via Ollama (local, independent) ──────────────────────────────
    try:
        from backend.routing_ivr.ollama_classify import classify_with_ollama
        lang, dept, urgency = await loop.run_in_executor(
            None, classify_with_ollama, req.transcript, req.hint_lang
        )
    except Exception as exc:
        logger.warning("[IVR] Ollama classify failed: %s — using hint_lang", exc)

    # ── Route based on detected language ──────────────────────────────────────
    from backend.routing import routing_engine
    from backend.routing.engine import CallRequest

    cr       = CallRequest(lang=lang, source="browser", caller_id=req.session_id)
    decision = await routing_engine.route(cr)

    logger.info("[IVR] session=%s transcript=%r → lang=%s dept=%s voice=%s llm=%s rule=%s",
                req.session_id[:8] if req.session_id else "?",
                req.transcript[:60], lang, dept, decision.voice, decision.llm, decision.rule_name)

    return ClassifyResponse(
        lang       = lang,
        voice      = decision.voice,
        llm        = decision.llm,
        queue_name = decision.queue_name,
        rule_name  = decision.rule_name,
        matched    = decision.matched,
    )


# ── Request-call endpoint (lang + email → slot or queue) ──────────────────────

@ivr_router.post("/request-call", response_model=CallResponse)
async def ivr_request_call(req: CallRequest):
    """
    Pre-call gate:
    0. Business hours check — reject immediately if outside working hours
    1. Try female agent for lang → if slot free → ok
    2. Try male agent → if slot free → ok
    3. All busy → Kafka queue + send miss email → queued/full
    """
    from backend.api.callcenter import business_hours
    if business_hours.should_reject_call():
        status = business_hours.get_status()
        return CallResponse(
            status="closed",
            voice="",
            session_id="",
            queued=False,
            email_sent=False,
        )

    from backend.routing_ivr.call_queue import request_call
    result = await request_call(lang=req.lang, email=req.email)
    return CallResponse(
        status     = result.status,
        voice      = result.voice,
        session_id = result.session_id,
        queued     = result.queued,
        email_sent = result.email_sent,
    )


@ivr_router.post("/release-slot")
async def ivr_release_slot(session_id: str, voice: str):
    """Called when a call ends to free the slot."""
    from backend.routing_ivr.call_queue import release_slot
    await release_slot(session_id, voice)
    return {"ok": True}


@ivr_router.get("/queue-stats")
async def ivr_queue_stats():
    from backend.routing_ivr.call_queue import get_stats
    return get_stats()


# ── Status endpoint ────────────────────────────────────────────────────────────

@ivr_router.get("/status")
async def ivr_status():
    from backend.routing_ivr.ollama_classify import OLLAMA_URL, OLLAMA_MODEL
    return {
        "status":        "ok",
        "classifier":    "ollama",
        "ollama_model":  OLLAMA_MODEL,
        "ollama_url":    OLLAMA_URL,
        "departments":   DEPARTMENTS,
        "greeting_text": GREETING_TEXT,
    }
