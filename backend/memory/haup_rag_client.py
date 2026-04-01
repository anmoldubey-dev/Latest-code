"""
haup_rag_client
===============
Thin async HTTP client for the HAUP v3.0 RAG microservice
(SahilRagSystem/haup/rag_api.py  →  http://localhost:8088).

One HAUPRagClient is shared across all calls (singleton).
Per-call session lifecycle is managed by the caller (ws_call):
  1. start_session(call_id)  → session_id
  2. get_context(session_id, query)  → context string for LLM prompt
  3. end_session(session_id)  → cleanup on WS close

Graceful degradation: every method catches connection errors and
returns safe defaults so the call pipeline never crashes due to
HAUP being unavailable.
"""

import logging
from typing import Optional

import httpx

logger = logging.getLogger("callcenter.haup_rag")

_HAUP_BASE_URL = "http://localhost:8088"
_ASK_TIMEOUT   = 5.0    # seconds — Smart RAG handles context; HAUP is best-effort
_FAST_TIMEOUT  =  3.0   # seconds — health check / session create / delete


class HAUPRagClient:
    """Async HTTP client wrapping the HAUP RAG API."""

    def __init__(self, base_url: str = _HAUP_BASE_URL) -> None:
        self._base = base_url.rstrip("/")

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    async def start_session(self, call_id: str) -> str:
        """
        POST /sessions  →  create a new RAG session.
        Returns the session_id string, or empty string on failure.
        """
        try:
            async with httpx.AsyncClient(timeout=_FAST_TIMEOUT) as client:
                r = await client.post(
                    f"{self._base}/sessions",
                    json={"call_id": call_id},
                )
                r.raise_for_status()
                session_id: str = r.json().get("session_id", "")
                logger.info("[HAUP] session started  call_id=%s  session_id=%s",
                            call_id, session_id)
                return session_id
        except Exception as exc:
            logger.warning("[HAUP] start_session failed (call_id=%s): %s", call_id, exc)
            return ""

    async def end_session(self, session_id: str) -> None:
        """
        DELETE /sessions/{session_id}  →  cleanup session resources.
        Silently swallowed on failure.
        """
        if not session_id:
            return
        try:
            async with httpx.AsyncClient(timeout=_FAST_TIMEOUT) as client:
                r = await client.delete(f"{self._base}/sessions/{session_id}")
                r.raise_for_status()
                logger.info("[HAUP] session ended  session_id=%s", session_id)
        except Exception as exc:
            logger.debug("[HAUP] end_session failed (session_id=%s): %s", session_id, exc)

    # ------------------------------------------------------------------
    # RAG query (replaces FAISS get_context_string)
    # ------------------------------------------------------------------

    async def get_context(self, session_id: str, query: str) -> str:
        """
        POST /sessions/{session_id}/ask  →  blocking RAG query.

        Returns the ``answer`` field as a plain string to inject into
        the LLM system prompt.  Returns "" on any failure so the LLM
        call proceeds without RAG context.
        """
        if not session_id or not query:
            return ""
        try:
            async with httpx.AsyncClient(timeout=_ASK_TIMEOUT) as client:
                r = await client.post(
                    f"{self._base}/sessions/{session_id}/ask",
                    json={"question": query},
                )
                r.raise_for_status()
                data = r.json()
                answer: str = data.get("answer", "")
                cache_hit    = data.get("cache_hit", False)
                latency_ms   = data.get("latency_ms", 0)
                logger.debug(
                    "[HAUP] ask ok  session=%s  latency=%.0fms  cache=%s",
                    session_id, latency_ms, cache_hit,
                )
                return answer
        except httpx.ConnectError:
            logger.warning("[HAUP] service unreachable — proceeding without RAG context")
            return ""
        except Exception as exc:
            logger.debug("[HAUP] get_context failed (session=%s): %s", session_id, exc)
            return ""

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    async def health_check(self) -> bool:
        """GET /health  →  True if HAUP RAG service is up and ok."""
        try:
            async with httpx.AsyncClient(timeout=_FAST_TIMEOUT) as client:
                r = await client.get(f"{self._base}/health")
                r.raise_for_status()
                status = r.json().get("status", "")
                return status in ("ok", "healthy", "degraded")
        except Exception as exc:
            logger.debug("[HAUP] health_check failed: %s", exc)
            return False


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_client: Optional[HAUPRagClient] = None


def get_haup_client() -> HAUPRagClient:
    global _client
    if _client is None:
        _client = HAUPRagClient()
    return _client
