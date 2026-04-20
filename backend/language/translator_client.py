# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +---------------------------+
# | translate_text()          |
# | * HTTP POST to translator |
# +---------------------------+
#     |
#     |----> post()
#     |        * send text + lang codes
#     |
#     |----> raise_for_status()
#     |        * raise on HTTP error
#     |
#     v
# +---------------------------+
# | is_available()            |
# | * check service health    |
# +---------------------------+
#     |
#     |----> get()
#     |        * GET /health endpoint
#     |
#     v
# [ END ]
#
# ================================================================

"""
translator_client
=================
Thin HTTP client for the Translator microservice (port 8002).

The translator service exposes a REST endpoint added for backend integration:
    POST /translate
        Body : {"text": str, "src_lang": str, "tgt_lang": str}
        Returns: {"translated": str, ...}

Language codes follow M2M-100 conventions: "en", "hi", "ta", "te", "ml",
"mr", "bn", "gu", "pa", "kn", "ur", "fr", "de", "es", "zh", "ja", etc.

Falls back to returning the original text if the service is unavailable,
so callers never have to handle an exception.

License: Apache 2.0
"""

import logging
import os
from typing import Optional

import requests

logger = logging.getLogger("callcenter.services.translator_client")

TRANSLATOR_URL = os.getenv("TRANSLATOR_URL", "http://localhost:8002")
_TIMEOUT       = 10  # seconds


def translate_text(
    text:     str,
    src_lang: str,
    tgt_lang: str,
) -> str:
    """
    Translate *text* from *src_lang* to *tgt_lang* via the translator service.

    Returns the translated string on success, or the original *text* on any
    failure (connection error, timeout, HTTP error).

    Parameters
    ----------
    text     : Source text to translate (max 512 chars enforced server-side).
    src_lang : BCP-47 / M2M-100 source language code (e.g. "hi").
    tgt_lang : BCP-47 / M2M-100 target language code (e.g. "en").
    """
    if not text or src_lang == tgt_lang:
        return text

    try:
        r = requests.post(
            f"{TRANSLATOR_URL}/translate",
            json    = {"text": text, "src_lang": src_lang, "tgt_lang": tgt_lang},
            timeout = _TIMEOUT,
        )
        r.raise_for_status()
        return r.json().get("translated", text) or text
    except requests.exceptions.ConnectionError:
        logger.warning(
            "[TranslatorClient] translator service not reachable at %s", TRANSLATOR_URL
        )
    except requests.exceptions.HTTPError as exc:
        logger.warning(
            "[TranslatorClient] HTTP %s — %s",
            exc.response.status_code, exc.response.text[:120],
        )
    except Exception:
        logger.exception("[TranslatorClient] translate request failed")

    return text  # graceful fallback


def is_available() -> bool:
    """Return True if the translator service is reachable."""
    try:
        r = requests.get(f"{TRANSLATOR_URL}/health", timeout=3)
        return r.status_code == 200
    except Exception:
        return False
