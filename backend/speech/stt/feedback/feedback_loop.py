# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------------------+
# | __init__()                                   |
# | * load store and build lang cache           |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | apply()                                      |
# | * scan STT text → apply corrections          |
# +----------------------------------------------+
#     |
#     |----> _load_for_lang()
#     |        * lazy load lang corrections into cache
#     |
#     |----> _apply_corrections()
#     |        * substring replace, longest-first
#     |
#     v
# +----------------------------------------------+
# | record_correction()                          |
# | * persist new correction + invalidate cache  |
# +----------------------------------------------+
#
# ================================================================
"""
FeedbackLoop
============
Applies stored STT corrections to transcribed text at runtime.

Strategy
--------
- Corrections are loaded per-language and cached in memory.
- At apply() time, each correction is tried as a case-insensitive
  substring match; longest matches are tried first to avoid partial
  clobbering (e.g. "thier" before "the").
- Cache is invalidated whenever a new correction is added so it
  stays consistent without a service restart.
- Thread-safe: cache protected by threading.Lock.

Performance
-----------
Typical call transcripts are < 200 chars. Even with 1,000 corrections
per language the scan is sub-millisecond.

License: Apache 2.0
"""

import logging
import re
import threading
from typing import Dict, List, Optional, Tuple

from .correction_store import CorrectionStore, get_correction_store

logger = logging.getLogger("callcenter.stt.feedback_loop")

# Cache entry: list of (id, bad_regex, corrected)
_CacheEntry = List[Tuple[int, re.Pattern, str]]


class FeedbackLoop:
    """
    Applies STT corrections derived from human agent feedback.

    Parameters
    ----------
    store : CorrectionStore
        Backing store (defaults to the module-level singleton).
    """

    def __init__(self, store: Optional[CorrectionStore] = None) -> None:
        self._store: CorrectionStore      = store or get_correction_store()
        self._cache: Dict[str, _CacheEntry] = {}
        self._lock  = threading.Lock()
        logger.info("[FeedbackLoop] initialised")

    # ------------------------------------------------------------------
    # Cache management
    # ------------------------------------------------------------------

    def _load_for_lang(self, lang: str) -> _CacheEntry:
        """Build and cache compiled regex patterns for a language."""
        with self._lock:
            if lang in self._cache:
                return self._cache[lang]

        rows = self._store.get_corrections(lang)
        # Sort by length descending so longest patterns are tried first
        rows_sorted = sorted(rows, key=lambda r: len(r[1]), reverse=True)
        compiled = [
            (rid, re.compile(re.escape(bad), re.IGNORECASE), corrected)
            for rid, bad, corrected in rows_sorted
        ]
        with self._lock:
            self._cache[lang] = compiled
        logger.debug("[FeedbackLoop] loaded %d corrections for lang=%s", len(compiled), lang)
        return compiled

    def _invalidate(self, lang: str) -> None:
        with self._lock:
            self._cache.pop(lang, None)

    # ------------------------------------------------------------------
    # Core logic
    # ------------------------------------------------------------------

    def apply(self, text: str, lang: str) -> str:
        """
        Apply all stored corrections for ``lang`` to ``text``.

        Parameters
        ----------
        text : Raw STT output.
        lang : BCP-47 language code.

        Returns
        -------
        Corrected text (unchanged if no corrections match).
        """
        if not text:
            return text

        patterns = self._load_for_lang(lang)
        if not patterns:
            return text

        result = text
        applied = []
        for rid, pattern, corrected in patterns:
            new_result, count = pattern.subn(corrected, result)
            if count:
                applied.append((rid, count))
                result = new_result

        if applied:
            logger.debug(
                "[FeedbackLoop] applied %d corrections  lang=%s  original=%r  corrected=%r",
                len(applied), lang, text[:60], result[:60],
            )
            # Increment hit counters asynchronously (best-effort)
            for rid, _ in applied:
                try:
                    self._store.increment_hit(rid)
                except Exception:
                    pass

        return result

    def record_correction(
        self,
        bad_text:  str,
        corrected: str,
        lang:      str,
    ) -> int:
        """
        Persist a new correction and invalidate the lang cache.

        Returns
        -------
        DB row id of the new / updated correction.
        """
        row_id = self._store.add_correction(lang, bad_text, corrected)
        self._invalidate(lang)
        logger.info(
            "[FeedbackLoop] correction added  lang=%s  bad=%r  corrected=%r  id=%d",
            lang, bad_text[:40], corrected[:40], row_id,
        )
        return row_id

    def delete_correction(self, correction_id: int, lang: str) -> None:
        """Remove a correction and invalidate the lang cache."""
        self._store.delete_correction(correction_id)
        self._invalidate(lang)

    def list_corrections(self, lang: Optional[str] = None) -> list:
        """Return corrections for admin console display."""
        if lang:
            return [
                {"id": rid, "bad_text": bad, "corrected": cor}
                for rid, bad, cor in self._store.get_corrections(lang)
            ]
        return self._store.get_all()

    def feedback_stats(self) -> dict:
        return self._store.stats()


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_loop: Optional[FeedbackLoop] = None


def get_feedback_loop() -> FeedbackLoop:
    global _loop
    if _loop is None:
        _loop = FeedbackLoop()
    return _loop
