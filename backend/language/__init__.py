"""
language
========
Language Intelligence module.

Sub-modules
-----------
ner_extractor          : Named Entity Recognition (names, phones, locations, intents)
interruption_detector  : Real-time barge-in / interruption detection
language_router        : Multi-language routing and detection utilities

License: Apache 2.0
"""

from .ner_extractor         import NERExtractor,         get_ner_extractor
from .interruption_detector import InterruptionDetector, get_interruption_detector
from .language_router       import LanguageRouter,       get_language_router

__all__ = [
    "NERExtractor",         "get_ner_extractor",
    "InterruptionDetector", "get_interruption_detector",
    "LanguageRouter",       "get_language_router",
]
