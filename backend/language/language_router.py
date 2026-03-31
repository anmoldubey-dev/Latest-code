# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +---------------------------+
# | _script_ratio()           |
# | * fraction chars in range |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | detect_language()         |
# | * heuristic lang detect   |
# +---------------------------+
#     |
#     |----> _script_ratio()
#     |        * check Unicode block ratio
#     |
#     v
# +---------------------------+
# | detect_code_switch()      |
# | * detect mixed-script text|
# +---------------------------+
#     |
#     |----> findall()
#     |        * find Latin words in text
#     |
#     v
# +---------------------------+
# | __init__()                |
# | * init session router     |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | update()                  |
# | * detect lang from text   |
# +---------------------------+
#     |
#     |----> detect_language()
#     |        * run heuristic detection
#     |
#     v
# +---------------------------+
# | tts_service_port()        |
# | * return TTS port 8003/4  |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | is_indic()                |
# | * check if Indic language |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | stats()                   |
# | * return session stats    |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | get_language_router()     |
# | * factory per session     |
# +---------------------------+
#     |
#     v
# [ END ]
#
# ================================================================

"""
language_router
===============
Multi-language routing and auto-detection utilities.

Responsibilities
----------------
- Detect language from short transcribed snippets (heuristic + script).
- Route a session to the correct TTS service and LLM language rule.
- Detect code-switching (e.g. Hinglish mid-sentence).
- Provide the correct script family for a BCP-47 code.

Detection approach
------------------
We use Unicode script block analysis (no ML dependency, < 1 ms):
- Devanagari → hi / mr / ne (disambiguate by Marathi-specific words)
- Latin only → en / es / fr / de (use common-word frequency)
- Arabic → ar
- Tamil script → ta
- Telugu script → te
- Malayalam script → ml
- Cyrillic → ru
- CJK → zh

When the snippet is ambiguous (< 4 chars, purely numeric, etc.) the
previous ``lang`` is preserved (last-known-good strategy).

License: Apache 2.0
"""

import logging
import re
import unicodedata
from typing import Dict, Optional, Tuple

logger = logging.getLogger("callcenter.language.router")

# ------------------------------------------------------------------
# Unicode block ranges (start, end) per script family
# ------------------------------------------------------------------

_SCRIPT_RANGES: Dict[str, Tuple[int, int]] = {
    "Devanagari": (0x0900, 0x097F),
    "Tamil":      (0x0B80, 0x0BFF),
    "Telugu":     (0x0C00, 0x0C7F),
    "Malayalam":  (0x0D00, 0x0D7F),
    "Kannada":    (0x0C80, 0x0CFF),
    "Bengali":    (0x0980, 0x09FF),
    "Gujarati":   (0x0A80, 0x0AFF),
    "Gurmukhi":   (0x0A00, 0x0A7F),
    "Oriya":      (0x0B00, 0x0B7F),
    "Arabic":     (0x0600, 0x06FF),
    "Cyrillic":   (0x0400, 0x04FF),
    "CJK":        (0x4E00, 0x9FFF),
}

# Marathi-specific words to disambiguate Devanagari from Hindi
_MARATHI_WORDS = {"आहे", "नाही", "करा", "माझा", "माझी", "तुमचा", "तुमची", "सांगा"}
_NEPALI_WORDS  = {"छ", "छैन", "गर्नुस्", "हजुर", "भन्नुस्", "गर्न"}

# Common words per Latin language
_LATIN_FINGERPRINTS: Dict[str, list] = {
    "es": ["hola", "que", "como", "gracias", "por", "favor", "tengo"],
    "fr": ["bonjour", "merci", "oui", "non", "je", "vous", "est", "pas"],
    "ru": [],  # Cyrillic — handled separately
    "de": ["ich", "bitte", "danke", "nein", "ja", "sie", "habe"],
    "pt": ["obrigado", "sim", "nao", "como", "por"],
}


def _script_ratio(text: str, start: int, end: int) -> float:
    """Return fraction of chars in the given Unicode range."""
    chars = [c for c in text if c.strip()]
    if not chars:
        return 0.0
    count = sum(1 for c in chars if start <= ord(c) <= end)
    return count / len(chars)


def detect_language(text: str, prev_lang: str = "en") -> str:
    """
    Heuristic language detection from a short transcript snippet.

    Parameters
    ----------
    text      : Transcribed text (typically 5–50 words).
    prev_lang : Session's current language (fallback / last-known-good).

    Returns
    -------
    BCP-47 language code string.
    """
    if not text or len(text.strip()) < 3:
        return prev_lang

    text_clean = text.strip()

    # ── Script-based detection ─────────────────────────────────────
    for script, (start, end) in _SCRIPT_RANGES.items():
        ratio = _script_ratio(text_clean, start, end)
        if ratio < 0.25:
            continue

        if script == "Devanagari":
            words = set(text_clean.split())
            if words & _NEPALI_WORDS:
                return "ne"
            if words & _MARATHI_WORDS:
                return "mr"
            return "hi"

        script_to_lang = {
            "Tamil":    "ta",
            "Telugu":   "te",
            "Malayalam":"ml",
            "Kannada":  "kn",
            "Bengali":  "bn",
            "Gujarati": "gu",
            "Gurmukhi": "pa",
            "Arabic":   "ar",
            "Cyrillic": "ru",
            "CJK":      "zh",
        }
        if script in script_to_lang:
            return script_to_lang[script]

    # ── Latin-script disambiguation ────────────────────────────────
    lower = text_clean.lower()
    for lang_code, fingerprints in _LATIN_FINGERPRINTS.items():
        if any(fp in lower for fp in fingerprints):
            return lang_code

    return prev_lang


def detect_code_switch(text: str, primary_lang: str) -> bool:
    """
    Return True if the text appears to be code-switched (mixes English
    words into a non-English script sentence).
    """
    if primary_lang == "en":
        return False

    # Check for Latin words in a non-Latin-primary text
    latin_words = re.findall(r"\b[A-Za-z]{2,}\b", text)
    total_words = text.split()
    if not total_words:
        return False

    ratio = len(latin_words) / len(total_words)
    # Mixed if 10–80% is Latin (pure Latin would be a language shift)
    return 0.10 <= ratio <= 0.80


class LanguageRouter:
    """
    Per-session language router.

    Tracks session language, detects switches, and exposes TTS service
    routing information.
    """

    # Languages served by Indic TTS (port 8004)
    _INDIC_TTS_LANGS = {"hi", "mr", "te", "ta", "ml", "kn", "bn", "gu", "pa", "or", "as", "ur", "ne"}

    def __init__(self, initial_lang: str = "en") -> None:
        self.current_lang = initial_lang
        self._switch_count = 0
        logger.info("[LanguageRouter] init  lang=%s", initial_lang)

    def update(self, text: str) -> str:
        """
        Detect language from new text and update internal state.

        Returns the (possibly new) language code.
        """
        new_lang = detect_language(text, self.current_lang)
        if new_lang != self.current_lang:
            logger.info(
                "[LanguageRouter] language switch  %s → %s",
                self.current_lang, new_lang,
            )
            self.current_lang = new_lang
            self._switch_count += 1
        return self.current_lang

    def tts_service_port(self, lang: Optional[str] = None) -> int:
        """Return the TTS service port for the given language."""
        l = lang or self.current_lang
        return 8004 if l in self._INDIC_TTS_LANGS else 8003

    def is_indic(self, lang: Optional[str] = None) -> bool:
        return (lang or self.current_lang) in self._INDIC_TTS_LANGS

    def stats(self) -> dict:
        return {
            "current_lang":  self.current_lang,
            "switch_count":  self._switch_count,
            "is_indic":      self.is_indic(),
            "tts_port":      self.tts_service_port(),
        }


def get_language_router(lang: str = "en") -> LanguageRouter:
    """Create a new LanguageRouter for a session."""
    return LanguageRouter(initial_lang=lang)
