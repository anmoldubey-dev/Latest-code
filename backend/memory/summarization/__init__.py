"""
summarization
=============
Call Summarization and Real-time Smart Suggestions.

Sub-modules
-----------
call_summarizer   : Auto-generates structured call summaries (JSON + text)
smart_suggestions : Real-time context-aware reply suggestions for human agents

License: Apache 2.0
"""

from .call_summarizer   import CallSummarizer,   get_call_summarizer
from .smart_suggestions import SmartSuggestions, get_smart_suggestions

__all__ = [
    "CallSummarizer",   "get_call_summarizer",
    "SmartSuggestions", "get_smart_suggestions",
]
