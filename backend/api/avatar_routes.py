import asyncio
import json
import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.config import AVATAR_SUMMARY_AI, OLLAMA_ENABLED, OLLAMA_URL
from backend.core.logger import setup_logger
from backend.core.state import _m

logger = setup_logger("callcenter")

router = APIRouter()

_PERSONA_SYSTEM = (
    "You are a prompt engineer for Parler TTS. "
    "Translate the user's input to English. "
    "Extract the emotional style and the speaking speed. "
    "Return ONLY a JSON object with keys 'style' and 'speed_desc'. "
    "No speaker names, no extra text. "
    "Example: {\"style\": \"warm and cheerful\", \"speed_desc\": \"at a moderate pace\"}"
)
_PERSONA_SYSTEM_INDIC = (
    "You are a prompt engineer for Indic Parler TTS (English-conditioned). "
    "Translate the user's input to plain English. "
    "Extract a short emotional style phrase (under 8 words) and a speed phrase (under 5 words). "
    "Return ONLY a JSON object with keys 'style' and 'speed_desc'. No speaker names. "
    "Example: {\"style\": \"gentle and expressive\", \"speed_desc\": \"slowly\"}"
)


class _SummarizePersonaReq(BaseModel):
    raw_prompt: str
    tts_type: str = "global"


class _ConfigureAvatarReq(BaseModel):
    voice_stem: str
    company_name: str
    agent_name: str
    language: str
    gender: str
    context_text: str


async def _call_gemini(system: str, prompt: str) -> str:
    gemini = _m.get("gemini")
    if not gemini:
        raise HTTPException(status_code=503, detail="Gemini is required but unavailable")
    try:
        from google.genai import types
        r = await asyncio.get_event_loop().run_in_executor(
            None, lambda: gemini.client.models.generate_content(
                model=gemini.model_id,
                contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    temperature=0.6,
                    response_mime_type="application/json"
                ),
            ))
        return r.text
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini error: {exc}")


async def _call_ollama(system: str, prompt: str, fmt: str | None = None) -> str:
    payload = {
        "model": os.getenv("OLLAMA_MODEL", "qwen2.5:7b"),
        "system": system,
        "prompt": prompt,
        "stream": False,
    }
    if fmt:
        payload["format"] = fmt
    try:
        async with httpx.AsyncClient(timeout=1200.0) as client:
            base_url = OLLAMA_URL.replace("/api/chat", "")
            resp = await client.post(f"{base_url}/api/generate", json=payload)
        resp.raise_for_status()
        return resp.json().get("response", "")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Ollama timed out.")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Ollama error: {exc}")


@router.post("/api/avatar/summarize-persona")
async def summarize_persona(req: _SummarizePersonaReq):
    system = _PERSONA_SYSTEM_INDIC if req.tts_type == "indic" else _PERSONA_SYSTEM
    if AVATAR_SUMMARY_AI == "gemini":
        logger.info("  [Avatar Config] Summarizing prompt via Gemini...")
        raw = await _call_gemini(system, req.raw_prompt)
    else:
        raw = await _call_ollama(system, req.raw_prompt)
    try:
        start = raw.index("{"); end = raw.rindex("}") + 1
        data = json.loads(raw[start:end])
        style      = str(data.get("style", "clear and professional"))
        speed_desc = str(data.get("speed_desc", "at a moderate pace"))
    except Exception:
        style, speed_desc = "clear and professional", "at a moderate pace"
    return {"style": style, "speed_desc": speed_desc}


@router.post("/api/avatar/configure")
async def configure_avatar(req: _ConfigureAvatarReq):
    logger.info("  [Avatar Config] Generating persona for '%s' (%s) via %s...",
                req.agent_name, req.voice_stem, AVATAR_SUMMARY_AI.upper())

    system = f"""You are an Avatar Behavior Engineer.
Analyze context and output a JSON object containing:
- "role": Short 2-5 word descriptor.
- "prompt": Short instruction for LLM. No greetings. Be concise.
- "greeting": Single-sentence greeting at start of call.
- "style": Emotion style (e.g. "warm") in English.
- "speed_desc": Speed descriptor (e.g. "moderate") in English.

Rules for "greeting":
- Gender: {req.gender.lower()}.
- Include company ("{req.company_name}") and agent ("{req.agent_name}").
- CRITICAL: The avatar's target language code is "{req.language}".
- You MUST write the greeting in the native language and script of "{req.language}". If English words must be used, transliterate them into the native script (e.g. Devanagari for Hindi). NEVER output an English greeting if the target code is not 'en'.

Context:
{req.context_text[:1500]}

Output JSON only."""

    prompt_text = "Analyze the context and generate the JSON configuration."
    if AVATAR_SUMMARY_AI == "gemini":
        logger.info("  [Avatar Config] Sending request to Gemini...")
        try:
            raw = await _call_gemini(system, prompt_text)
            data = json.loads(raw)
        except Exception as exc:
            logger.error("  [Avatar Config] Gemini failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))
    else:
        if not OLLAMA_ENABLED:
            raise HTTPException(status_code=503, detail="Ollama is required for this feature")
        logger.info("  [Avatar Config] Sending request to Ollama...")
        try:
            raw = await _call_ollama(system, prompt_text, fmt="json")
            data = json.loads(raw)
        except Exception as exc:
            logger.error("  [Avatar Config] Failed to generate persona: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc))

    logger.info("  [Avatar Config] Successfully generated persona!")

    from backend.memory.pg_memory import save_avatar_config
    save_avatar_config(
        voice_stem=req.voice_stem,
        company_name=req.company_name,
        agent_name=req.agent_name,
        language=req.language,
        gender=req.gender,
        original_context=req.context_text,
        generated_role=str(data.get("role", "AI Agent"))[:50],
        generated_prompt=str(data.get("prompt", "Act as a helpful assistant."))[:500],
        generated_greeting=str(data.get("greeting", f"Hello, I am {req.agent_name} from {req.company_name}.")),
        custom_style=str(data.get("style", "clear and professional"))[:50],
        custom_speed=str(data.get("speed_desc", "at a moderate pace"))[:50]
    )
    return {"status": "success", "config": data}
