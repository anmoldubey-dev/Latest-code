# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +---------------------------+
# | __init__()                |
# | * init per-session cache  |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | _build_prompt()           |
# | * format Ollama prompt    |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | _call_ollama()            |
# | * POST to Ollama LLM      |
# +---------------------------+
#     |
#     |----> post()
#     |        * send prompt to Ollama
#     |
#     |----> raise_for_status()
#     |        * check HTTP response
#     |
#     |----> loads()
#     |        * parse JSON suggestions
#     |
#     v
# +---------------------------+
# | suggest()                 |
# | * return 3 suggestions    |
# +---------------------------+
#     |
#     |----> _build_prompt()
#     |        * build context prompt
#     |
#     |----> _call_ollama()
#     |        * get LLM suggestions
#     |
#     v
# +---------------------------+
# | clear_cache()             |
# | * clear suggestion cache  |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | get_smart_suggestions()   |
# | * factory per session     |
# +---------------------------+
#     |
#     v
# [ END ]
#
# ================================================================

"""
smart_suggestions
=================
Real-time context-aware reply suggestions for human agents.

Design
------
- Suggestions are generated after each USER turn using a compact
  Ollama prompt (qwen2.5:7b, 3 suggestions, < 2 s latency target).
- Results are cached per conversation turn to avoid duplicate LLM calls.
- The SmartSuggestions instance is per-session (stateful context window).
- An async wrapper is provided for the FastAPI / WebSocket path.

Suggestion format
-----------------
Each suggestion is a short reply string (< 25 words).  The caller
receives a list of 3 ranked suggestions via the WebSocket data channel
so the human agent can click-to-send.

License: Apache 2.0
"""

import json
import logging
import time
from typing import List, Optional

import requests

from backend.core.config import OLLAMA_URL, LANGUAGE_CONFIG

logger = logging.getLogger("callcenter.summarization.suggestions")

_SUGGEST_MODEL   = "qwen2.5:7b"
_SUGGEST_TIMEOUT = 15
_N_SUGGESTIONS   = 3
_MAX_HISTORY     = 6   # turns of context for suggestions


class SmartSuggestions:
    """
    Generates real-time reply suggestions for the current conversation turn.

    Parameters
    ----------
    lang  : Session language code.
    model : Ollama model to use.
    """

    def __init__(
        self,
        lang:  str = "en",
        model: str = _SUGGEST_MODEL,
    ) -> None:
        self.lang   = lang
        self.model  = model
        self._cache: dict = {}   # hash(last_user_text) → suggestions
        logger.info("[SmartSuggestions] init  lang=%s  model=%s", lang, model)

    # ------------------------------------------------------------------
    # Prompt
    # ------------------------------------------------------------------

    def _build_prompt(self, history: List[dict], user_text: str) -> str:
        lang_name = LANGUAGE_CONFIG.get(self.lang, {}).get("name", "English")
        ctx_turns = history[-_MAX_HISTORY:]
        ctx_str   = "\n".join(
            f"[{t.get('role','user').upper()}]: {t.get('text','')}"
            for t in ctx_turns
        )
        return (
            f"You are a call-center assistant helping a HUMAN AGENT respond.\n"
            f"Language: {lang_name}\n\n"
            f"Conversation so far:\n{ctx_str}\n\n"
            f"Latest caller message: {user_text}\n\n"
            f"Generate exactly {_N_SUGGESTIONS} short reply suggestions for the agent.\n"
            f"Each suggestion must be ≤ 20 words, natural, and directly address the caller.\n"
            f"Return JSON array only: [\"suggestion1\", \"suggestion2\", \"suggestion3\"]"
        )

    # ------------------------------------------------------------------
    # LLM call
    # ------------------------------------------------------------------

    def _call_ollama(self, prompt: str) -> List[str]:
        payload = {
            "model":    self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream":   False,
            "options":  {"temperature": 0.6, "num_predict": 200, "num_ctx": 1024},
        }
        try:
            r = requests.post(OLLAMA_URL, json=payload, timeout=_SUGGEST_TIMEOUT)
            r.raise_for_status()
            raw = r.json()["message"]["content"].strip()
            # Strip markdown fences
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.lower().startswith("json"):
                    raw = raw[4:]
            suggestions = json.loads(raw)
            if isinstance(suggestions, list):
                return [str(s).strip() for s in suggestions[:_N_SUGGESTIONS]]
        except Exception as exc:
            logger.warning("[SmartSuggestions] LLM call failed: %s", exc)

        # Fallback: canned suggestions in lang
        lang_cfg  = LANGUAGE_CONFIG.get(self.lang, LANGUAGE_CONFIG["en"])
        canned    = lang_cfg.get("canned_error", "Sorry, could you repeat that?")
        return [canned, "Let me check that for you.", "Could you provide more details?"]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def suggest(
        self,
        history:   List[dict],
        user_text: str,
    ) -> List[str]:
        """
        Return up to 3 reply suggestions for the current user message.

        Results are cached per unique user_text to avoid re-calling the LLM
        if the same text is submitted twice (e.g. reconnect / retry).
        """
        cache_key = hash(user_text)
        if cache_key in self._cache:
            return self._cache[cache_key]

        t0   = time.perf_counter()
        sug  = self._call_ollama(self._build_prompt(history, user_text))
        ms   = (time.perf_counter() - t0) * 1000
        logger.debug(
            "[SmartSuggestions] generated %d suggestions in %.0fms  lang=%s",
            len(sug), ms, self.lang,
        )
        self._cache[cache_key] = sug
        return sug

    def clear_cache(self) -> None:
        self._cache.clear()


# ------------------------------------------------------------------
# Module-level factory (one per session)
# ------------------------------------------------------------------

def get_smart_suggestions(lang: str = "en") -> SmartSuggestions:
    return SmartSuggestions(lang=lang)
