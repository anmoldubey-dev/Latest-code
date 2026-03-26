# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-----------------------------+
# | _build_final_system()       |
# | * compose Gemini system     |
# +-----------------------------+
#     |
#     |----> build_system_prompt()
#     |        * persona plus language rule
#     |
#     v
# +-----------------------------+
# | _gemini_sync()              |
# | * blocking Gemini inference |
# +-----------------------------+
#     |
#     |----> _build_final_system()
#     |        * assemble full system prompt
#     |
#     |----> <GeminiResponder> -> generate_content()
#     |        * call Gemini Flash API
#     |
#     v
# +-----------------------------+
# | _build_qwen_system()        |
# | * compose compact Qwen prompt|
# +-----------------------------+
#     |
#     |----> extract_agent_name()
#     |        * parse name from voice stem
#     |
#     v
# +-----------------------------+
# | _qwen_sync()                |
# | * blocking Ollama inference |
# +-----------------------------+
#     |
#     |----> _build_qwen_system()
#     |        * assemble compact system prompt
#     |
#     |----> post()
#     |        * call Ollama HTTP API
#     |
#     v
# [ RETURN AI reply string ]
#
# ================================================================

import logging
from typing import List

import requests as _req

from backend.core.config import OLLAMA_URL, LANGUAGE_CONFIG
from backend.core.persona import build_system_prompt, extract_agent_name
from backend.core.state import _m

logger = logging.getLogger("callcenter.llm")


def _build_final_system(lang: str, voice_name: str) -> str:
    base = build_system_prompt(lang, voice_name)
    company_context = _m.get("company_context", "")
    if company_context:
        return (
            f"{base}\n\n"
            f"Company Knowledge Base:\n{company_context}\n\n"
            "Use the above company information to answer accurately. "
            "Do not mention that you are reading from a document. "
            "If the user asks something unrelated to company info, respond normally."
        )
    return base


def _gemini_sync(history: List[dict], lang: str, voice_name: str) -> str:
    resp = _m.get("gemini")
    if resp is None:
        return "[Gemini unavailable — check GEMINI_API_KEY]"

    from google.genai import types

    system_instruction = _build_final_system(lang, voice_name)
    contents = [
        types.Content(
            role="user" if t["role"] == "user" else "model",
            parts=[types.Part(text=t["text"])],
        )
        for t in history[-8:]
    ]
    try:
        r = resp.client.models.generate_content(
            model=resp.model_id,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                max_output_tokens=200,
                temperature=0.7,
            ),
        )
        result = (r.text or "").strip()
        if not result:
            raise RuntimeError("Gemini returned empty response")
        return result
    except Exception:
        logger.exception("Gemini error")
        raise


def _build_qwen_system(lang: str, voice_name: str) -> str:
    agent_name    = extract_agent_name(voice_name)
    language_rule = LANGUAGE_CONFIG.get(lang, {}).get(
        "llm_rule", "Reply in the same language the user is speaking."
    )
    company_context = _m.get("company_context", "")
    base = (
        f"You are {agent_name}, a human call center agent at SR Comsoft. "
        f"{language_rule} "
        "Reply in 1-2 short sentences. Never say you are AI. Be natural."
    )
    if company_context:
        return f"{base}\n\nCompany info: {company_context[:500]}"
    return base


def _qwen_sync(history: List[dict], lang: str, voice_name: str) -> str:
    system_instruction = _build_qwen_system(lang, voice_name)
    messages = [{"role": "system", "content": system_instruction}]
    for t in history[-6:]:
        messages.append({
            "role":    "user" if t["role"] == "user" else "assistant",
            "content": t["text"],
        })
    try:
        r = _req.post(
            OLLAMA_URL,
            json={
                "model":      "qwen2.5:7b",
                "messages":   messages,
                "stream":     False,
                "keep_alive": -1,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 100,
                    "num_ctx":     1024,
                },
            },
            timeout=90,
        )
        r.raise_for_status()
        return r.json()["message"]["content"].strip()
    except Exception:
        logger.exception("Qwen/Ollama error")
        raise
