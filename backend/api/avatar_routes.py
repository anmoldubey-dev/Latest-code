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

    # Extract custom greeting if provided (sent as "REQUIRED GREETING: ..." suffix)
    custom_greeting = ""
    clean_context = req.context_text
    if "\n\nREQUIRED GREETING:" in req.context_text:
        parts = req.context_text.split("\n\nREQUIRED GREETING:", 1)
        clean_context = parts[0].strip()
        custom_greeting = parts[1].strip()

    greeting_field = (
        f'"{custom_greeting}"'
        if custom_greeting else
        f'"<Write a natural call-center opening greeting in {req.language} language. Transliterate the agent name \'{req.agent_name}\' and company name \'{req.company_name}\' into the native script of {req.language}. Pattern: [Greeting word], [I am {req.agent_name} transliterated] [company transliterated] [from/se]. [How can I help you in {req.language}?]>"'
    )

    system = f"""You are a voice AI persona engineer. Output ONLY valid JSON, no extra text.

Agent: {req.agent_name} | Company: {req.company_name} | Language: {req.language} | Gender: {req.gender}
Context: {clean_context[:800]}

Return this exact JSON:
{{
  "role": "<2-4 word English job title>",
  "prompt": "You are {req.agent_name} from {req.company_name}. <ENGLISH ONLY: 2 sentences about what this agent does based on context. No greetings. No other language.>",
  "greeting": {greeting_field},
  "style": "<one English word: helpful/warm/professional/confident>",
  "speed_desc": "at a moderate pace"
}}

RULES:
- "role", "prompt", "style", "speed_desc" must be in ENGLISH only.
- "greeting" must be in {req.language} native script. Transliterate company "{req.company_name}" and agent "{req.agent_name}" into native script characters."""

    prompt_text = "Output the JSON now."
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
