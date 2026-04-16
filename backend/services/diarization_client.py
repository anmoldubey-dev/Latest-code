# =============================================================================
# FILE: diarization_client.py
# DESC: Async HTTP client for the diarization microservice (singleton).
# =============================================================================
#
# EXECUTION FLOW
# =============================================================================
#
#  +--------------------------------+
#  | __init__()                     |
#  | * set base URL                 |
#  +--------------------------------+
#           |
#           v
#  +--------------------------------+
#  | health_check()                 |
#  | * GET /health, return bool     |
#  +--------------------------------+
#           |
#           |----> <AsyncClient> -> get()
#           |
#           v
#  +--------------------------------+
#  | diarize()                      |
#  | * POST /diarize, get segments  |
#  +--------------------------------+
#           |
#           |----> <AsyncClient> -> post()
#           |
#           v
#  +--------------------------------+
#  | get_diarization_client()       |
#  | * return module singleton      |
#  +--------------------------------+
#
# =============================================================================
"""
diarization_client
==================
Thin async HTTP client for the diarization microservice
(services/diarization_service/server.py  →  http://localhost:8001).

Usage in the call pipeline:
  1. At startup: init singleton, run health_check(), log result.
  2. Post-call: save audio to disk, then call diarize(file_path, hf_token).
     Run as asyncio.create_task() — do NOT await inline so WS teardown
     is not delayed.

Graceful degradation: all methods catch connection errors and return
safe defaults ([] or False) so the call pipeline never crashes if the
diarization service is down.
"""

import logging
from typing import List, Optional

import httpx

logger = logging.getLogger("callcenter.diarization")

_DIARIZATION_BASE_URL = "http://localhost:8001"
_DIARIZE_TIMEOUT      = 120.0   # seconds — diarization can be slow on CPU
_HEALTH_TIMEOUT       =   3.0   # seconds


class DiarizationClient:
    """Async HTTP client for the diarization microservice."""

    def __init__(self, base_url: str = _DIARIZATION_BASE_URL) -> None:
        self._base = base_url.rstrip("/")

    async def diarize(self, file_path: str, hf_token: str) -> List[dict]:
        """
        POST /diarize  →  returns list of speaker segments.

        Each segment: {"start": float, "end": float, "speaker": str}
        Returns [] on any failure — never raises.
        """
        try:
            async with httpx.AsyncClient(timeout=_DIARIZE_TIMEOUT) as client:
                r = await client.post(
                    f"{self._base}/diarize",
                    json={"file_path": file_path, "hf_token": hf_token},
                )
                r.raise_for_status()
                segments: List[dict] = r.json().get("segments", [])
                logger.info(
                    "[Diarization] complete  file=%s  segments=%d",
                    file_path, len(segments),
                )
                return segments
        except httpx.ConnectError:
            logger.warning("[Diarization] service unreachable — skipping diarization")
            return []
        except Exception as exc:
            logger.warning("[Diarization] diarize failed (file=%s): %s", file_path, exc)
            return []

    async def health_check(self) -> bool:
        """
        Light connectivity check — GET /health or a HEAD to /diarize.
        Returns True if service responds, False otherwise.
        """
        try:
            async with httpx.AsyncClient(timeout=_HEALTH_TIMEOUT) as client:
                # The diarization service may not have a /health endpoint;
                # a GET to root or /health both return usable status info.
                r = await client.get(f"{self._base}/health")
                return r.status_code < 500
        except Exception as exc:
            logger.debug("[Diarization] health_check failed: %s", exc)
            return False


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_client: Optional[DiarizationClient] = None


def get_diarization_client() -> DiarizationClient:
    global _client
    if _client is None:
        _client = DiarizationClient()
    return _client
