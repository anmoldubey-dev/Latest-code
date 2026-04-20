"""
stt.feedback
============
STT Feedback Loop — stores human corrections and applies them to improve
transcription quality over time without retraining the base model.

Sub-modules
-----------
correction_store : SQLite-backed store for (bad_text, corrected_text, lang)
feedback_loop    : Applies stored corrections to new STT output at inference time

License: Apache 2.0
"""

from .correction_store import CorrectionStore, get_correction_store
from .feedback_loop import FeedbackLoop, get_feedback_loop

__all__ = [
    "CorrectionStore",
    "get_correction_store",
    "FeedbackLoop",
    "get_feedback_loop",
]
