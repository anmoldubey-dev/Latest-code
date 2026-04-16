# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------------------+
# | summarize()                                  |
# | * build prompt from conversation history    |
# +----------------------------------------------+
#     |
#     |----> _build_summary_prompt()
#     |        * format history into summarisation prompt
#     |
#     |----> _run_llm()
#     |        * Ollama → parse JSON summary
#     |
#     |----> _parse_summary()
#     |        * extract structured fields
#     |
#     v
# +----------------------------------------------+
# | format_readable()                            |
# | * convert JSON summary to human-readable     |
# +----------------------------------------------+
#
# ================================================================
"""
CallSummarizer
==============
Automatic call summarisation for voice AI sessions.

Output format (JSON + readable)
--------------------------------
{
    "session_id"   : "abc123",
    "language"     : "en",
    "duration_secs": 142,
    "caller_name"  : "Rahul",
    "phone_number" : "+919876543210",
    "primary_intent": "technical",
    "issue_summary" : "Caller reported website not loading after last update.",
    "resolution"    : "Agent restarted the server-side cache.",
    "follow_up"     : "Send confirmation email within 24 hours.",
    "sentiment"     : "neutral",
    "crm_tags"      : ["website", "cache", "technical"],
    "turns"         : 14,
    "generated_at"  : "2026-03-25T10:30:00Z"
}

CRM integration: the JSON output is designed to be POSTed directly to
any CRM webhook. Add your CRM client in services/crm_client.py.

License: Apache 2.0
"""

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

from backend.core.config import OLLAMA_URL, OLLAMA_MODEL, LANGUAGE_CONFIG

logger = logging.getLogger("callcenter.summarization.summarizer")

_SUMMARY_MODEL   = OLLAMA_MODEL
_SUMMARY_TIMEOUT = 45   # seconds
_MAX_TURNS_CTX   = 30   # how many last turns to include in the prompt


class CallSummarizer:
    """
    Generates structured call summaries using the local Ollama LLM.

    Designed for both AI agent sessions and human-to-human conversations.
    """

    def __init__(
        self,
        model:   str = _SUMMARY_MODEL,
        ollama_url: str = OLLAMA_URL,
    ) -> None:
        self.model      = model
        self.ollama_url = ollama_url
        logger.info("[CallSummarizer] ready  model=%s", model)

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------

    def _build_summary_prompt(
        self,
        history:    List[dict],
        lang:       str,
        session_id: str,
        entities:   Optional[dict] = None,
    ) -> str:
        turns_text = "\n".join(
            f"[{t.get('role', 'user').upper()}]: {t.get('text', '')}"
            for t in history[-_MAX_TURNS_CTX:]
        )

        entity_hint = ""
        if entities:
            if entities.get("names"):
                entity_hint += f"\nCaller name detected: {', '.join(entities['names'])}"
            if entities.get("phones"):
                entity_hint += f"\nPhone: {entities['phones'][0]}"
            if entities.get("intents"):
                entity_hint += f"\nPrimary intent: {entities['intents'][0]}"

        return (
            "You are an expert call center QA analyst. "
            "Summarise the following call transcript as a JSON object.\n\n"
            "TRANSCRIPT:\n"
            f"{turns_text}\n"
            f"{entity_hint}\n\n"
            "Return ONLY valid JSON with these exact keys:\n"
            "caller_name, phone_number, primary_intent, issue_summary, "
            "resolution, follow_up, sentiment (positive/neutral/negative), "
            "crm_tags (array of strings).\n"
            "Be concise. JSON only, no markdown."
        )

    # ------------------------------------------------------------------
    # LLM call
    # ------------------------------------------------------------------

    def _run_llm(self, prompt: str) -> str:
        payload = {
            "model":    self.model,
            "messages": [
                {"role": "system", "content": "You are a call-center summarisation AI."},
                {"role": "user",   "content": prompt},
            ],
            "stream":     False,
            "keep_alive": -1,
            "options": {
                "temperature": 0.1,
                "num_predict": 400,
                "num_ctx":     4096,
            },
        }
        try:
            r = requests.post(self.ollama_url, json=payload, timeout=_SUMMARY_TIMEOUT)
            r.raise_for_status()
            return r.json()["message"]["content"].strip()
        except Exception as exc:
            logger.warning("[CallSummarizer] Ollama failed: %s — using fallback", exc)
            return "{}"

    # ------------------------------------------------------------------
    # Parsing
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_summary(raw: str) -> dict:
        """Extract JSON from LLM output, stripping markdown fences."""
        raw = raw.strip()
        # Strip ```json ... ``` fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.lower().startswith("json"):
                raw = raw[4:]
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Attempt to find first { ... }
            start = raw.find("{")
            end   = raw.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    return json.loads(raw[start:end])
                except Exception:
                    pass
        return {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def summarize(
        self,
        history:       List[dict],
        lang:          str         = "en",
        session_id:    str         = "",
        start_time:    float       = 0.0,
        entities:      Optional[dict] = None,
    ) -> Dict[str, Any]:
        """
        Generate a structured summary of a call conversation.

        Parameters
        ----------
        history    : List of ``{"role": str, "text": str}`` dicts.
        lang       : Session language.
        session_id : Used as identifier in the output.
        start_time : ``time.perf_counter()`` at call start.
        entities   : Pre-extracted NER entities (optional, for enrichment).

        Returns
        -------
        Structured summary dict (JSON-serialisable).
        """
        if not history:
            return self._empty_summary(session_id, lang)

        prompt      = self._build_summary_prompt(history, lang, session_id, entities)
        raw_summary = self._run_llm(prompt)
        parsed      = self._parse_summary(raw_summary)

        duration = int(time.perf_counter() - start_time) if start_time else 0

        summary = {
            "session_id":     session_id[:8] if session_id else "",
            "language":       lang,
            "duration_secs":  duration,
            "turns":          len(history),
            "generated_at":   datetime.now(timezone.utc).isoformat(),
            # LLM-extracted fields
            "caller_name":     parsed.get("caller_name",    ""),
            "phone_number":    parsed.get("phone_number",   ""),
            "primary_intent":  parsed.get("primary_intent", "unknown"),
            "issue_summary":   parsed.get("issue_summary",  ""),
            "resolution":      parsed.get("resolution",     ""),
            "follow_up":       parsed.get("follow_up",      ""),
            "sentiment":       parsed.get("sentiment",      "neutral"),
            "crm_tags":        parsed.get("crm_tags",       []),
        }

        logger.info(
            "[CallSummarizer] done  session=%s  intent=%s  sentiment=%s  turns=%d",
            session_id[:8], summary["primary_intent"], summary["sentiment"], summary["turns"],
        )
        return summary

    def format_readable(self, summary: Dict[str, Any]) -> str:
        """Convert a structured summary to a human-readable paragraph."""
        lines = [
            f"📞 Call Summary — Session {summary.get('session_id', '')}",
            f"Language     : {summary.get('language', '')}",
            f"Duration     : {summary.get('duration_secs', 0)}s  ({summary.get('turns', 0)} turns)",
            f"Caller       : {summary.get('caller_name') or 'Unknown'}",
            f"Phone        : {summary.get('phone_number') or '—'}",
            f"Intent       : {summary.get('primary_intent', '')}",
            f"Sentiment    : {summary.get('sentiment', '')}",
            "",
            f"Issue   : {summary.get('issue_summary', '')}",
            f"Resolved: {summary.get('resolution', '')}",
            f"Follow-up   : {summary.get('follow_up', '')}",
            f"CRM tags : {', '.join(summary.get('crm_tags', []))}",
        ]
        return "\n".join(lines)

    @staticmethod
    def _empty_summary(session_id: str, lang: str) -> dict:
        return {
            "session_id":    session_id[:8] if session_id else "",
            "language":      lang,
            "duration_secs": 0,
            "turns":         0,
            "generated_at":  datetime.now(timezone.utc).isoformat(),
            "caller_name":   "",
            "phone_number":  "",
            "primary_intent":"unknown",
            "issue_summary": "",
            "resolution":    "",
            "follow_up":     "",
            "sentiment":     "neutral",
            "crm_tags":      [],
        }


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_summarizer: Optional[CallSummarizer] = None


def get_call_summarizer() -> CallSummarizer:
    global _summarizer
    if _summarizer is None:
        _summarizer = CallSummarizer()
    return _summarizer
