"""
call_queue.py — Active call tracking + Kafka queue for overflow.

Flow:
  1. Request comes in with lang + email
  2. Try female agent for that lang → if slot free → assign
  3. Else try male agent → if slot free → assign
  4. Else → push to Kafka queue (if Kafka up) → send miss email → return queued
"""
import asyncio
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional

logger = logging.getLogger("callcenter.call_queue")

# ── In-memory slot tracker ─────────────────────────────────────────────────────
# { voice_stem: {session_id: start_ts} }
_active: Dict[str, Dict[str, float]] = {}
_lock = asyncio.Lock()

# Max concurrent calls — loaded from config, default 10
_max_calls: int = int(os.getenv("MAX_CONCURRENT_CALLS", "10"))
_max_per_voice: int = int(os.getenv("MAX_CALLS_PER_VOICE", "5"))


def set_max_calls(n: int):
    global _max_calls
    _max_calls = n


def get_max_calls() -> int:
    return _max_calls


def get_stats() -> dict:
    total = sum(len(v) for v in _active.values())
    return {
        "active_total":   total,
        "max_calls":      _max_calls,
        "max_per_voice":  _max_per_voice,
        "slots_free":     max(0, _max_calls - total),
        "by_voice":       {v: len(s) for v, s in _active.items() if s},
    }


async def acquire_slot(session_id: str, voice_stem: str) -> bool:
    """Try to reserve a slot for this voice. Returns True if acquired."""
    async with _lock:
        total = sum(len(v) for v in _active.values())
        if total >= _max_calls:
            return False
        by_voice = _active.setdefault(voice_stem, {})
        if len(by_voice) >= _max_per_voice:
            return False
        by_voice[session_id] = time.time()
        return True


async def release_slot(session_id: str, voice_stem: str):
    async with _lock:
        _active.get(voice_stem, {}).pop(session_id, None)


# ── Language → [female_voice, male_voice] ─────────────────────────────────────
# Mirrors the registry in tts_client.py
_VOICE_MAP = {
    "en":    ["Emma (Warm Female)",         "James (Professional Male)"],
    "hi":    ["Divya (Warm Female)",         "Rohit (Professional Male)"],
    "en-in": ["Aditi (Clear Female)",        "Aakash (Assertive Male)"],
    "mr":    ["Sunita (Fluent Female)",      "Sanjay (Calm Male)"],
    "bn":    ["Riya (Warm Female)",          "Sourav (Professional Male)"],
    "ta":    ["Kavitha (Clear Female)",      "Karthik (Calm Male)"],
    "te":    ["Padma (Bright Female)",       "Venkat (Authoritative Male)"],
    "gu":    ["Nisha (Warm Female)",         "Bhavesh (Professional Male)"],
    "ml":    ["Lakshmi (Soft Female)",       "Sreejith (Warm Male)"],
    "pa":    ["Gurpreet (Bright Female)",    "Harjinder (Deep Male)"],
    "kn":    ["Rekha (Clear Female)",        "Sunil (Calm Male)"],
    "fr":    ["Sophie (Clear Female)",       "Louis (Calm Male)"],
    "de":    ["Lena (Bright Female)",        "Klaus (Deep Male)"],
    "es":    ["Maria (Warm Female)",         "Carlos (Professional Male)"],
    "ar":    ["Emma (Warm Female)",          "James (Professional Male)"],
}

def voices_for_lang(lang: str):
    return _VOICE_MAP.get(lang) or _VOICE_MAP.get("en")


@dataclass
class RouteResult:
    status:     str          # "ok" | "queued" | "full"
    voice:      str = ""
    session_id: str = ""
    queued:     bool = False
    email_sent: bool = False


async def request_call(lang: str, email: str = "") -> RouteResult:
    """
    Main entry: try female → male → Kafka queue → email drop.
    """
    session_id = str(uuid.uuid4())
    female, male = voices_for_lang(lang)

    # Try female first, then male
    for voice in (female, male):
        if await acquire_slot(session_id, voice):
            logger.info("[Queue] slot acquired  voice=%s  session=%s", voice, session_id[:8])
            return RouteResult(status="ok", voice=voice, session_id=session_id)

    # Both busy — push to Kafka queue
    queued   = await _push_kafka(session_id, lang, email)
    email_ok = False
    if email:
        from backend.routing_ivr.email_service import send_queue_full_email
        email_ok = await send_queue_full_email(email, lang)

    logger.warning("[Queue] all slots busy  lang=%s  queued=%s  email=%s", lang, queued, email_ok)
    return RouteResult(
        status="queued" if queued else "full",
        queued=queued,
        email_sent=email_ok,
        session_id=session_id,
    )


async def _push_kafka(session_id: str, lang: str, email: str) -> bool:
    try:
        from infrastructure.kafka.producer import publish
        from infrastructure.kafka.topics import CALL_EVENTS
        await publish(CALL_EVENTS, {
            "event":      "call_queued",
            "session_id": session_id,
            "lang":       lang,
            "email":      email,
            "ts":         time.time(),
        })
        return True
    except Exception as exc:
        logger.warning("[Queue] Kafka push failed: %s", exc)
        return False
