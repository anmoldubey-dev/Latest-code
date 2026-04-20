"""
Translation Layer — live call pipeline interceptor.

When enabled per-call, this module:
  1. Translates user STT text from their language (from_lang) into the
     agent/LLM language (to_lang) before it reaches the LLM.
  2. Translates the LLM response from to_lang back to from_lang before TTS.
  3. Selects the correct TTS voice for from_lang based on the configured gender.

No other call logic is touched — this runs purely as a transparent wrapper
inside process_turn() in app.py.

Voice gender selection follows the voice registry order:
  index 0 = female voice, index 1 = male voice  (matches build_voice_registry).
"""

import asyncio
import logging
from typing import Optional

from backend.language.translator_client import translate_text

logger = logging.getLogger("callcenter.translation_layer")

_GENDER_INDEX = {"female": 0, "male": 1}


def select_voice_by_gender(registry: dict, lang: str, gender: str) -> str:
    """Return the voice name for lang + gender from the voice registry."""
    voices = registry.get(lang) or registry.get("en") or []
    if not voices:
        return ""
    idx = _GENDER_INDEX.get(gender.lower(), 0)
    return voices[min(idx, len(voices) - 1)]["name"]


async def tl_translate_user(
    user_text: str,
    from_lang: str,
    to_lang: str,
    loop: asyncio.AbstractEventLoop,
) -> str:
    """
    Translate user utterance (from_lang → to_lang) for the LLM.
    Falls back to original text on any error.
    """
    if not user_text or from_lang == to_lang:
        return user_text
    try:
        result = await loop.run_in_executor(
            None, translate_text, user_text, from_lang, to_lang
        )
        logger.info(
            "[TL] user  %s→%s | %r → %r",
            from_lang, to_lang,
            user_text[:80], result[:80],
        )
        return result or user_text
    except Exception as exc:
        logger.warning("[TL] user translate error: %s — using original text", exc)
        return user_text


async def tl_translate_agent(
    ai_text: str,
    from_lang: str,
    to_lang: str,
    loop: asyncio.AbstractEventLoop,
) -> str:
    """
    Translate agent LLM response (from_lang → to_lang) for TTS delivery to user.
    Falls back to original text on any error.
    """
    if not ai_text or from_lang == to_lang:
        return ai_text
    try:
        result = await loop.run_in_executor(
            None, translate_text, ai_text, from_lang, to_lang
        )
        logger.info(
            "[TL] agent %s→%s | %r → %r",
            from_lang, to_lang,
            ai_text[:80], result[:80],
        )
        return result or ai_text
    except Exception as exc:
        logger.warning("[TL] agent translate error: %s — using original text", exc)
        return ai_text
