# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-----------------------------+
# | _build_final_system()       |
# | * compose Gemini prompt     |
# +-----------------------------+
#     |
#     |----> build_system_prompt()
#     |        * base persona assembly
#     |
#     v
# +-----------------------------+
# | _gemini_sync()              |
# | * blocking Gemini call      |
# +-----------------------------+
#     |
#     |----> _build_final_system()
#     |        * assemble system prompt
#     |
#     |----> <GeminiResponder> -> generate_content()
#     |        * call Gemini API
#     |
#     v
# +-----------------------------+
# | _build_qwen_system()        |
# | * compose Ollama system prompt, append lang+length+script rules |
# +-----------------------------+
#     |
#     |----> extract_agent_name()
#     |        * parse agent name
#     |
#     v
# +-----------------------------+
# | _qwen_sync()                |
# | * blocking Ollama call      |
# +-----------------------------+
#     |
#     |----> _build_qwen_system()
#     |        * assemble Qwen prompt
#     |
#     |----> post()
#     |        * call Ollama API
#     |
#     v
# [ END ]
#
# ================================================================

import logging
from typing import List

import requests as _req

from backend.core.config import OLLAMA_URL, OLLAMA_MODEL, LANGUAGE_CONFIG
from backend.core.persona import build_system_prompt, extract_agent_name
from backend.core.state import _m

logger = logging.getLogger("callcenter.llm")


def _build_final_system(lang: str, voice_name: str, rag_context: str = "", customer_context: str = "", custom_prompt_text: str = None) -> str:
    if custom_prompt_text:
        base = custom_prompt_text
    else:
        base = build_system_prompt(lang, voice_name)
    parts = [base]

    company_context = _m.get("company_context", "")
    if company_context:
        parts.append(
            f"Company Knowledge Base:\n{company_context}\n\n"
            "Use the above company information to answer accurately. "
            "Do not mention that you are reading from a document. "
            "If the user asks something unrelated to company info, respond normally."
        )

    if rag_context:
        parts.append(f"Relevant context for this query:\n{rag_context}")

    if customer_context:
        parts.append(customer_context)

    parts.append(
        "STRICT LENGTH RULE: Reply in only 1-2 short sentences. "
        "Maximum 3 sentences only if answering a complex question. "
        "Keep it conversational and brief, like a real phone call."
    )
    return "\n\n".join(parts)


def _gemini_sync(history: List[dict], lang: str, voice_name: str, rag_context: str = "", customer_context: str = "", custom_prompt_text: str = None) -> str:
    resp = _m.get("gemini")
    if resp is None:
        return "[Gemini unavailable — check GEMINI_API_KEY]"

    from google.genai import types

    system_instruction = _build_final_system(lang, voice_name, rag_context, customer_context, custom_prompt_text)
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
                max_output_tokens=400,
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


def _build_qwen_system(lang: str, voice_name: str, rag_context: str = "", customer_context: str = "", custom_prompt_text: str = None) -> str:
    agent_name    = extract_agent_name(voice_name)
    language_rule = LANGUAGE_CONFIG.get(lang, {}).get(
        "llm_rule", "Reply in the same language the user is speaking."
    )
    rules = (
        f"{language_rule} "
        "Reply in exactly 2-3 COMPLETE sentences. Always end with a period. Never cut off. "
        "Never say you are AI. Be natural. "
        "Write replies in the native script of the reply language. "
        "English technical terms (website, app, error, password, etc.) may stay in English. "
        "But never reply in a completely different language."
    )
    if custom_prompt_text:
        base = f"{custom_prompt_text}\n\n{rules}"
    else:
        base = (
            f"You are {agent_name} from SR Comsoft. "
            f"{rules}"
        )
    parts = [base]

    company_context = _m.get("company_context", "")
    if company_context:
        parts.append(f"Company info: {company_context[:500]}")

    if rag_context:
        parts.append(f"Relevant context: {rag_context[:400]}")

    if customer_context:
        parts.append(customer_context[:300])

    return "\n\n".join(parts)


def _qwen_sync(history: List[dict], lang: str, voice_name: str, rag_context: str = "", customer_context: str = "", custom_prompt_text: str = None) -> str:
    system_instruction = _build_qwen_system(lang, voice_name, rag_context, customer_context, custom_prompt_text)
    messages = [{"role": "system", "content": system_instruction}]
    for t in history[-6:]:
        messages.append({
            "role":    "user" if t["role"] == "user" else "assistant",
            "content": t["text"],
        })
    try:
        r = _req.post(
            OLLAMA_URL,
            timeout=300,
            json={
                "model":      OLLAMA_MODEL,
                "messages":   messages,
                "stream":     False,
                "keep_alive": -1,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 180,
                    "num_ctx":     2048,
                },
            },
        )
        r.raise_for_status()
        return r.json()["message"]["content"].strip()
    except Exception:
        logger.exception("Qwen/Ollama error")
        raise
