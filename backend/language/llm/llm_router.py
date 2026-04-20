# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------------------+
# | __init__()                                   |
# | * load primary and fallback LLM             |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | route()                                      |
# | * try primary → fallback → canned error      |
# +----------------------------------------------+
#     |
#     |----> _ollama_sync()
#     |        * Ollama local inference
#     |
#     |----> _gemini_sync()
#     |        * Gemini cloud inference
#     |
#     v
# [ RETURN ai_text str, backend_used str ]
#
# ================================================================
"""
LLMRouter
=========
Implements the primary/fallback strategy:

    Primary  → Ollama (local, production, zero cost)
    Fallback → Gemini 2.5 Flash (cloud, testing, fast)
    Last     → language-specific canned error string

Key behaviours
--------------
- Ollama is tried first regardless of ``llm_key`` unless ``llm_key``
  explicitly equals ``"gemini"`` (testing/demo sessions).
- On any Ollama failure (timeout, connection refused, empty reply) the
  router transparently falls back to Gemini and emits a warning metric.
- All routing decisions are logged with latency for observability.
- The router is stateless — safe to call from any async executor.

License: Apache 2.0
"""

import logging
import time
from typing import List, Tuple

from backend.core.config import LANGUAGE_CONFIG
from backend.language.llm.ollama_responder import _ollama_sync

logger = logging.getLogger("callcenter.llm.router")

_KEY_OLLAMA  = "ollama"
_KEY_GEMINI  = "gemini"   # kept for legacy key detection only — not used
_KEY_QWEN    = "qwen"     # legacy alias → Ollama


class LLMRouter:
    """
    Stateless router that selects the best available LLM backend.

    Parameters
    ----------
    preferred : str
        ``"ollama"`` (default/production) or ``"gemini"`` (testing).
        ``"qwen"`` is treated as ``"ollama"`` for backward-compatibility.
    """

    def __init__(self, preferred: str = _KEY_OLLAMA) -> None:
        # Normalise legacy key
        self.preferred = _KEY_OLLAMA if preferred == _KEY_QWEN else preferred
        logger.info("[LLMRouter] initialised  preferred=%s", self.preferred)

    # ------------------------------------------------------------------
    # Primary public method
    # ------------------------------------------------------------------

    def route(
        self,
        history:    List[dict],
        lang:       str,
        voice_name: str,
        llm_key:    str = "",
    ) -> Tuple[str, str]:
        """
        Select backend, run inference, return (ai_text, backend_name).

        Parameters
        ----------
        history    : conversation turns ``[{"role": "user"|"assistant", "text": "..."}]``
        lang       : BCP-47 language code
        voice_name : voice stem used to derive agent persona
        llm_key    : optional override from the session (``"gemini"``, ``"ollama"``)

        Returns
        -------
        (ai_text, backend_used)
        """
        # Determine execution order
        t0 = time.perf_counter()
        try:
            text = _ollama_sync(history, lang, voice_name)
            ms   = (time.perf_counter() - t0) * 1000
            logger.info("[LLMRouter] ollama ok  lang=%s  latency=%.0fms  len=%d", lang, ms, len(text))
            return text, _KEY_OLLAMA
        except Exception as exc:
            ms = (time.perf_counter() - t0) * 1000
            logger.warning("[LLMRouter] ollama FAILED in %.0fms: %s", ms, exc)

        canned = LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG["en"]).get(
            "canned_error", "Sorry, I had a connection issue. Could you repeat that?"
        )
        logger.error("[LLMRouter] ollama unavailable  lang=%s", lang)
        return canned, "canned"


# ------------------------------------------------------------------
# Module-level singleton — imported by ai_worker
# ------------------------------------------------------------------

_router: LLMRouter | None = None


def get_router(preferred: str = _KEY_OLLAMA) -> LLMRouter:
    """Return (or create) the shared LLMRouter instance."""
    global _router
    if _router is None:
        _router = LLMRouter(preferred=preferred)
    return _router


def llm_route_sync(
    history:    List[dict],
    lang:       str,
    voice_name: str,
    llm_key:    str = "",
) -> Tuple[str, str]:
    """
    Convenience wrapper — same signature as the old ``_gemini_sync`` /
    ``_qwen_sync`` functions so ai_worker.py only needs a one-line change.
    """
    return get_router().route(history, lang, voice_name, llm_key=llm_key)
