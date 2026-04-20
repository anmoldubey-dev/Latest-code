"""
engine.py — AI Call Routing Engine
Routes incoming calls to the right AI agent (voice + LLM) based on rules.
No human agents yet — all routes go to AI bot.
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .rules import RuleLoader, RoutingRule

logger = logging.getLogger("callcenter.routing.engine")


@dataclass
class CallRequest:
    lang:       str = "en"
    source:     str = "browser"   # browser | sip | phone
    priority:   int = 0
    caller_id:  str = ""
    session_id: str = ""


@dataclass
class RoutingDecision:
    rule_name:      str
    queue_name:     str
    voice:          str    # AI voice to use
    llm:            str    # LLM to use: gemini | ollama
    lang:           str    # resolved language
    fallback_action: str
    matched:        bool
    ai_config:      Dict[str, Any] = field(default_factory=dict)
    ts:             float = field(default_factory=lambda: __import__("time").time())


class RoutingEngine:
    def __init__(self) -> None:
        self._loader = RuleLoader()

    def load_rules(self) -> None:
        self._loader.load()

    def reload_rules(self) -> int:
        self._loader.load()
        return len(self._loader.rules)

    def rules_snapshot(self) -> List[Dict]:
        return self._loader.to_dict_list()

    async def route(self, req: CallRequest) -> RoutingDecision:
        now_utc = datetime.now(timezone.utc)
        matched: Optional[RoutingRule] = None

        for rule in self._loader.rules:
            if not rule.enabled:
                continue
            if self._matches(rule.conditions, req, now_utc):
                matched = rule
                break

        if matched is None:
            # Default: use request lang as-is, pick first available voice
            return RoutingDecision(
                rule_name      = "default",
                queue_name     = "ai-default",
                voice          = req.lang,   # frontend will resolve actual voice
                llm            = "gemini",
                lang           = req.lang,
                fallback_action = "ai_bot",
                matched        = False,
            )

        ai_cfg = matched.target.ai_config
        return RoutingDecision(
            rule_name      = matched.name,
            queue_name     = matched.target.queue_name,
            voice          = ai_cfg.get("voice", ""),
            llm            = ai_cfg.get("llm", "gemini"),
            lang           = ai_cfg.get("lang", req.lang),
            fallback_action = matched.target.fallback_action,
            matched        = True,
            ai_config      = ai_cfg,
        )

    @staticmethod
    def _matches(cond, req: CallRequest, now_utc: datetime) -> bool:
        if cond.lang is not None:
            if req.lang not in cond.lang:
                return False
        if cond.source is not None:
            if req.source not in cond.source:
                return False
        if cond.priority_gte:
            if req.priority < cond.priority_gte:
                return False
        if cond.caller_id_prefix:
            if not any(req.caller_id.startswith(p) for p in cond.caller_id_prefix):
                return False
        if cond.time_of_day_utc_between:
            start_s, end_s = cond.time_of_day_utc_between
            if not _in_window(now_utc, start_s, end_s):
                return False
        if cond.time_of_day_utc_outside:
            start_s, end_s = cond.time_of_day_utc_outside
            if _in_window(now_utc, start_s, end_s):
                return False
        return True


def _in_window(now: datetime, start: str, end: str) -> bool:
    try:
        sh, sm = map(int, start.split(":"))
        eh, em = map(int, end.split(":"))
        s = sh * 60 + sm
        e = eh * 60 + em
        c = now.hour * 60 + now.minute
        return (s <= c < e) if s <= e else (c >= s or c < e)
    except Exception:
        return True
