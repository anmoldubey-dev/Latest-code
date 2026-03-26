# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------------------+
# | __init__()                                   |
# | * set model url timeout keep_alive          |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | generate()                                   |
# | * blocking Ollama /api/chat HTTP call        |
# +----------------------------------------------+
#     |
#     |----> _build_messages()
#     |        * system prompt + history window
#     |
#     |----> post()
#     |        * HTTP call to Ollama API
#     |
#     v
# +----------------------------------------------+
# | generate_streaming()                         |
# | * streaming generator for token-by-token TTS|
# +----------------------------------------------+
#     |
#     |----> post()
#     |        * NDJSON event stream
#     |
#     v
# [ RETURN str | Generator[str] ]
#
# ================================================================
"""
OllamaResponder
===============
Primary LLM backend — targets any locally running Ollama model.

Design decisions
----------------
- Non-streaming path (``generate``) is the default for the voice pipeline
  because TTS needs the full sentence before synthesis can start.
- Streaming path (``generate_streaming``) is available for future sentence-
  segmented TTS to reduce first-token latency.
- Gemini is the *testing / fallback* backend; Ollama is *production*.
- Model name is configurable per-session so the router can hot-swap models
  without restart (e.g. llama3.3:70b for enterprise, qwen2.5:7b for speed).

License: Apache 2.0
"""

import logging
import time
from typing import Generator, List, Optional

import requests

from backend.core.config import OLLAMA_URL, LANGUAGE_CONFIG
from backend.core.persona import build_system_prompt, extract_agent_name
from backend.core.state import _m

logger = logging.getLogger("callcenter.llm.ollama")

# Default model — overridden by LLM router or session config
DEFAULT_MODEL  = "qwen2.5:7b"
# Tokens to generate — kept short for sub-second TTS round-trip
MAX_TOKENS     = 120
CONTEXT_WINDOW = 2048
TEMPERATURE    = 0.7
# History window sent to Ollama (full turns, not tokens)
HISTORY_WINDOW = 8


class OllamaResponder:
    """
    Wraps the Ollama /api/chat endpoint.

    Parameters
    ----------
    model : str
        Ollama model tag (e.g. ``"llama3.3:70b"``, ``"qwen2.5:7b"``).
    base_url : str
        Ollama server base (default ``http://localhost:11434``).
    timeout : int
        HTTP timeout in seconds.
    """

    def __init__(
        self,
        model:    str = DEFAULT_MODEL,
        base_url: str = "http://localhost:11434",
        timeout:  int = 60,
    ) -> None:
        self.model    = model
        self.chat_url = f"{base_url}/api/chat"
        self.timeout  = timeout
        logger.info("[Ollama] responder ready  model=%s  url=%s", model, self.chat_url)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_messages(
        self,
        history:   List[dict],
        lang:      str,
        voice_name: str,
    ) -> List[dict]:
        """Assemble the messages array sent to Ollama."""
        system_prompt = _build_ollama_system(lang, voice_name)
        messages = [{"role": "system", "content": system_prompt}]
        for turn in history[-HISTORY_WINDOW:]:
            role = "user" if turn["role"] == "user" else "assistant"
            messages.append({"role": role, "content": turn["text"]})
        return messages

    def _post(
        self,
        messages: List[dict],
        stream:   bool = False,
    ) -> requests.Response:
        payload = {
            "model":      self.model,
            "messages":   messages,
            "stream":     stream,
            "keep_alive": -1,
            "options": {
                "temperature": TEMPERATURE,
                "num_predict": MAX_TOKENS,
                "num_ctx":     CONTEXT_WINDOW,
            },
        }
        return requests.post(self.chat_url, json=payload, timeout=self.timeout, stream=stream)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate(
        self,
        history:    List[dict],
        lang:       str,
        voice_name: str,
    ) -> str:
        """
        Blocking inference — returns the full response string.

        Raises RuntimeError on Ollama failure so the LLM router can
        fall back to Gemini automatically.
        """
        messages = self._build_messages(history, lang, voice_name)
        t0 = time.perf_counter()
        try:
            r = self._post(messages, stream=False)
            r.raise_for_status()
            data = r.json()
            text = (data.get("message", {}).get("content") or "").strip()
            if not text:
                raise RuntimeError("Ollama returned empty content")
            latency = (time.perf_counter() - t0) * 1000
            logger.debug(
                "[Ollama] generate done  model=%s  latency=%.0fms  tokens=%s",
                self.model, latency,
                data.get("eval_count", "?"),
            )
            return text
        except requests.exceptions.Timeout:
            logger.error("[Ollama] timeout after %ds  model=%s", self.timeout, self.model)
            raise RuntimeError(f"Ollama timeout ({self.timeout}s)")
        except requests.exceptions.ConnectionError:
            logger.error("[Ollama] connection refused — is Ollama running?")
            raise RuntimeError("Ollama not reachable")
        except Exception as exc:
            logger.exception("[Ollama] generate error  model=%s", self.model)
            raise RuntimeError(str(exc)) from exc

    def generate_streaming(
        self,
        history:    List[dict],
        lang:       str,
        voice_name: str,
    ) -> Generator[str, None, None]:
        """
        Streaming inference — yields token chunks as they arrive.

        Useful for sentence-segmented TTS to cut first-audio latency.
        Each yielded string is a partial token; callers must buffer to
        sentence boundaries before feeding TTS.
        """
        messages = self._build_messages(history, lang, voice_name)
        try:
            r = self._post(messages, stream=True)
            r.raise_for_status()
            import json as _json
            for line in r.iter_lines():
                if not line:
                    continue
                try:
                    chunk = _json.loads(line)
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        yield token
                    if chunk.get("done"):
                        break
                except _json.JSONDecodeError:
                    continue
        except Exception as exc:
            logger.exception("[Ollama] streaming error  model=%s", self.model)
            raise RuntimeError(str(exc)) from exc

    def health_check(self) -> bool:
        """Return True if the Ollama server is reachable."""
        try:
            r = requests.get(
                self.chat_url.replace("/api/chat", "/api/tags"),
                timeout=3,
            )
            return r.status_code == 200
        except Exception:
            return False


# ------------------------------------------------------------------
# Module-level sync function — mirrors _qwen_sync / _gemini_sync API
# ------------------------------------------------------------------

def _build_ollama_system(lang: str, voice_name: str) -> str:
    """Full system prompt for Ollama — same as Gemini path for parity."""
    from backend.core.persona import build_system_prompt
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


def _ollama_sync(
    history:    List[dict],
    lang:       str,
    voice_name: str,
    model:      Optional[str] = None,
) -> str:
    """
    Drop-in replacement for ``_qwen_sync`` — uses the shared
    OllamaResponder instance cached in ``_m["ollama"]``.

    Falls back to a fresh responder if the cached one is missing.
    """
    responder: Optional[OllamaResponder] = _m.get("ollama")
    if responder is None:
        logger.warning("[Ollama] no cached responder — creating ad-hoc")
        responder = OllamaResponder(model=model or DEFAULT_MODEL)

    if model and model != responder.model:
        # Hot-swap: create a temporary responder for this model
        temp = OllamaResponder(model=model)
        return temp.generate(history, lang, voice_name)

    return responder.generate(history, lang, voice_name)
