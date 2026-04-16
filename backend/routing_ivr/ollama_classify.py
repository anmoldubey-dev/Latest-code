"""
ollama_classify.py — IVR intent/language classifier using local Ollama.
Completely independent: no imports from the main LLM pipeline.
"""
import logging
import os
import requests

logger = logging.getLogger("callcenter.ivr.classify")

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434/api/chat")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

DEPARTMENTS = [
    "General Support", "Technical Support",
    "Billing", "Sales", "Account Management",
]

VALID_LANGS = {
    "en", "hi", "mr", "ta", "te", "bn", "gu", "ml", "pa",
    "ar", "es", "fr", "de", "en-in", "ru", "zh", "it", "nl", "pt", "pl",
}


def classify_with_ollama(transcript: str, hint_lang: str = "en") -> tuple:
    """
    Returns (lang_code, department, urgency 1-5).
    Blocking — run in executor from async context.
    """
    prompt = (
        f"Caller message: \"{transcript}\"\n\n"
        f"Detect the language and intent. Respond with exactly one line in this format:\n"
        f"<lang_code>|<department>|<urgency>\n\n"
        f"Where:\n"
        f"  lang_code = BCP-47 code such as: en hi mr ta te bn gu ml pa ar es fr de "
        f"(detect from text; default to \"{hint_lang}\" if unclear)\n"
        f"  department = one of: {', '.join(DEPARTMENTS)}\n"
        f"  urgency = integer 1-5\n\n"
        f"Example response: es|General Support|2\n"
        f"Output only the single line, no explanation."
    )

    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model":  OLLAMA_MODEL,
                "stream": False,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=10,
        )
        resp.raise_for_status()
        # Take first non-empty line
        raw = resp.json()["message"]["content"].strip()
        line = next((l for l in raw.split("\n") if l.strip()), "")
        parts = line.split("|")
        if len(parts) == 3:
            lang    = parts[0].strip().lower().strip("<>")
            dept    = parts[1].strip() if parts[1].strip() in DEPARTMENTS else "General Support"
            urgency = max(1, min(5, int(parts[2].strip())))
            # Guard: reject placeholder/invalid values
            if lang in VALID_LANGS:
                logger.info("[IVR/Ollama] classified: lang=%s dept=%s urgency=%d", lang, dept, urgency)
                return lang, dept, urgency
            logger.warning("[IVR/Ollama] unrecognised lang %r — using hint_lang=%s", lang, hint_lang)
    except Exception as exc:
        logger.warning("[IVR/Ollama] classify failed: %s — using hint_lang", exc)

    return hint_lang, "General Support", 3
