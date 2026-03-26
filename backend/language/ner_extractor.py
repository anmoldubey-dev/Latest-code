# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------------------+
# | __init__()                                   |
# | * compile regex per entity type             |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | extract()                                    |
# | * run all extractors on text                 |
# +----------------------------------------------+
#     |
#     |----> _extract_phones()
#     |----> _extract_emails()
#     |----> _extract_names()
#     |----> _extract_locations()
#     |----> _extract_intents()
#     |----> _extract_numbers()
#     |----> _extract_dates()
#     |
#     v
# [ RETURN NERResult dict ]
#
# ================================================================
"""
NERExtractor
============
Named Entity Recognition for call-center transcripts.

Approach: regex + keyword heuristics (no ML dependency) for sub-millisecond
latency on the hot path. An optional spaCy/transformers upgrade path is
provided but not required for production.

Entities extracted
------------------
- phone_numbers  : Indian / international formats
- emails         : Standard RFC-like pattern
- names          : Proper nouns (capitalised, preceded by name cues)
- locations      : City / state names for India + common English
- intents        : Categorised customer intents (billing, technical, etc.)
- order_ids      : Alphanumeric ticket/order references
- amounts        : Currency amounts (₹, $, Rs)
- dates          : ISO, spoken ("next Monday", "kal"), DD/MM/YYYY

License: Apache 2.0
"""

import logging
import re
from typing import Dict, List, Optional

logger = logging.getLogger("callcenter.language.ner")


# ------------------------------------------------------------------
# Compiled patterns (module-level for zero-init overhead per call)
# ------------------------------------------------------------------

_PHONE_PATTERNS = [
    # Indian mobile: 10 digits, optional +91/0 prefix
    re.compile(r"(?:\+91[-\s]?|0)?[6-9]\d{9}\b"),
    # International: +CC NNNN NNNN
    re.compile(r"\+\d{1,3}[-\s]\d{4,5}[-\s]\d{4,5}\b"),
]

_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"
)

_ORDER_RE = re.compile(
    r"\b(?:order|ticket|case|ref|reference|id)[:\s#]*([A-Z0-9]{4,16})\b",
    re.IGNORECASE,
)

_AMOUNT_RE = re.compile(
    r"(?:₹|Rs\.?|INR|USD|\$)\s*[\d,]+(?:\.\d{1,2})?"
    r"|\b[\d,]+(?:\.\d{1,2})?\s*(?:rupee[s]?|dollar[s]?|paisa)\b",
    re.IGNORECASE,
)

_DATE_RE = re.compile(
    r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"               # DD/MM/YYYY
    r"|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{4})?"  # "March 5th 2024"
    r"|(?:next|last|this)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
    r"|(?:aaj|kal|parso|agle|pichle)\b"                   # Hindi date words
    r")\b",
    re.IGNORECASE,
)

# Intent keywords (multilingual — English + common Hinglish)
_INTENT_KEYWORDS: Dict[str, List[str]] = {
    "billing":    [
        "bill", "invoice", "payment", "charge", "refund", "amount", "due",
        "bill nahi", "payment nahi", "paisa", "recharge",
    ],
    "technical":  [
        "error", "not working", "crash", "hang", "freeze", "slow", "lag",
        "kaam nahi", "nahi chal raha", "band ho gaya", "problem",
    ],
    "account":    [
        "login", "password", "account", "username", "forgot", "reset",
        "locked", "access", "sign in", "log in", "bhool gaya",
    ],
    "delivery":   [
        "delivery", "shipping", "courier", "parcel", "track", "not received",
        "deliver", "item", "order", "package",
    ],
    "cancel":     [
        "cancel", "cancellation", "stop", "disconnect", "terminate",
        "band karo", "band kar do", "cancel karna",
    ],
    "escalation": [
        "manager", "supervisor", "complaint", "escalate", "senior",
        "not happy", "disappointed", "angry", "frustrated",
        "manager se baat", "complaint",
    ],
    "greeting":   [
        "hello", "hi", "hey", "namaste", "namaskar", "salam", "vanakkam",
    ],
    "farewell":   [
        "bye", "goodbye", "thank you", "thanks", "dhanyawad", "shukriya",
        "alvida",
    ],
}

# Common Indian city / state names for location extraction
_INDIA_LOCATIONS = {
    "mumbai", "delhi", "bangalore", "bengaluru", "chennai", "hyderabad",
    "kolkata", "pune", "ahmedabad", "jaipur", "surat", "lucknow",
    "kanpur", "nagpur", "indore", "bhopal", "visakhapatnam", "patna",
    "vadodara", "ghaziabad", "ludhiana", "agra", "nashik", "faridabad",
    "meerut", "rajkot", "varanasi", "srinagar", "aurangabad", "amritsar",
    "navi mumbai", "allahabad", "ranchi", "howrah", "coimbatore",
    "kerala", "goa", "maharashtra", "gujarat", "rajasthan", "punjab",
    "karnataka", "tamilnadu", "andhra", "telangana", "odisha",
}

# Name-cue tokens that precede a proper name
_NAME_CUES = re.compile(
    r"(?:my name is|i am|i'm|call me|this is|speaking with|talking to|"
    r"mera naam|main|mai|mujhe|baat kar rahe|naam hai)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)",
    re.IGNORECASE,
)


class NERExtractor:
    """
    Lightweight, regex-based Named Entity Recogniser.

    Designed for real-time call-center transcripts. No external model
    required — add spaCy integration if higher precision is needed.
    """

    def __init__(self) -> None:
        logger.info("[NER] initialised (regex mode)")

    # ------------------------------------------------------------------
    # Per-entity extractors
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_phones(text: str) -> List[str]:
        found = []
        for pat in _PHONE_PATTERNS:
            found.extend(pat.findall(text))
        # Deduplicate preserving order
        seen = set()
        return [x for x in found if not (x in seen or seen.add(x))]

    @staticmethod
    def _extract_emails(text: str) -> List[str]:
        return _EMAIL_RE.findall(text)

    @staticmethod
    def _extract_names(text: str) -> List[str]:
        return _NAME_CUES.findall(text)

    @staticmethod
    def _extract_locations(text: str) -> List[str]:
        words = re.findall(r"\b[A-Za-z]+\b", text)
        return [w for w in words if w.lower() in _INDIA_LOCATIONS]

    @staticmethod
    def _extract_intents(text: str) -> List[str]:
        text_lower = text.lower()
        matched = []
        for intent, keywords in _INTENT_KEYWORDS.items():
            if any(kw in text_lower for kw in keywords):
                matched.append(intent)
        return matched

    @staticmethod
    def _extract_order_ids(text: str) -> List[str]:
        return _ORDER_RE.findall(text)

    @staticmethod
    def _extract_amounts(text: str) -> List[str]:
        return _AMOUNT_RE.findall(text)

    @staticmethod
    def _extract_dates(text: str) -> List[str]:
        return _DATE_RE.findall(text)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract(self, text: str, lang: str = "en") -> Dict[str, List[str]]:
        """
        Run all extractors and return a structured entity dict.

        Parameters
        ----------
        text : Transcribed utterance text.
        lang : Language code (currently unused — patterns work cross-lang).

        Returns
        -------
        Dict with keys: phones, emails, names, locations, intents,
                        order_ids, amounts, dates
        """
        if not text:
            return self._empty()

        result = {
            "phones":    self._extract_phones(text),
            "emails":    self._extract_emails(text),
            "names":     self._extract_names(text),
            "locations": self._extract_locations(text),
            "intents":   self._extract_intents(text),
            "order_ids": self._extract_order_ids(text),
            "amounts":   self._extract_amounts(text),
            "dates":     self._extract_dates(text),
        }

        if any(result.values()):
            logger.debug(
                "[NER] extracted  intents=%s  phones=%d  names=%d  lang=%s",
                result["intents"], len(result["phones"]), len(result["names"]), lang,
            )
        return result

    @staticmethod
    def _empty() -> Dict[str, List[str]]:
        return {k: [] for k in (
            "phones", "emails", "names", "locations",
            "intents", "order_ids", "amounts", "dates",
        )}

    def primary_intent(self, text: str, lang: str = "en") -> Optional[str]:
        """Return the single most-likely intent, or None."""
        intents = self._extract_intents(text)
        return intents[0] if intents else None


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_extractor: Optional[NERExtractor] = None


def get_ner_extractor() -> NERExtractor:
    global _extractor
    if _extractor is None:
        _extractor = NERExtractor()
    return _extractor
