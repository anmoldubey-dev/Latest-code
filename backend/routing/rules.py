"""
rules.py — Routing rule loader for AI call routing.
Rules live in backend/routing/routing_rules.json
Each rule: conditions (lang, source, time) → target (voice, llm, queue, fallback)
"""
import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("callcenter.routing.rules")

_DEFAULT_RULES_PATH = Path(__file__).parent / "routing_rules.json"


@dataclass
class RuleConditions:
    lang:                    Optional[List[str]] = None   # req.lang in list
    source:                  Optional[List[str]] = None   # browser | sip | phone
    priority_gte:            int                 = 0
    caller_id_prefix:        Optional[List[str]] = None
    time_of_day_utc_between: Optional[List[str]] = None   # ["HH:MM", "HH:MM"]
    time_of_day_utc_outside: Optional[List[str]] = None


@dataclass
class RuleTarget:
    queue_name:       str            = "ai-default"
    priority_override: Optional[int] = None
    ai_config:        Dict[str, Any] = field(default_factory=dict)
    # ai_config keys: voice, llm, lang  (overrides for the AI agent)
    fallback_action:  str            = "ai_bot"   # ai_bot | voicemail | queue


@dataclass
class RoutingRule:
    name:       str
    priority:   int
    enabled:    bool
    conditions: RuleConditions
    target:     RuleTarget


class RuleLoader:
    def __init__(self, path: Optional[Path] = None) -> None:
        env_path = os.getenv("ROUTING_RULES_PATH")
        self._path: Path = Path(env_path) if env_path else (path or _DEFAULT_RULES_PATH)
        self._rules: List[RoutingRule] = []

    def load(self) -> None:
        try:
            with open(self._path, encoding="utf-8") as fh:
                raw = json.load(fh)
            rules = [self._parse(r) for r in raw.get("rules", [])]
            rules.sort(key=lambda r: r.priority)
            self._rules = rules
            logger.info("[RuleLoader] loaded %d rules from %s", len(rules), self._path)
        except FileNotFoundError:
            logger.warning("[RuleLoader] %s not found — empty ruleset", self._path)
            self._rules = []
        except Exception as exc:
            logger.exception("[RuleLoader] failed: %s", exc)

    def _parse(self, raw: Dict) -> RoutingRule:
        c = raw.get("conditions", {})
        t = raw.get("target", {})
        return RoutingRule(
            name     = raw.get("name", "unnamed"),
            priority = raw.get("priority", 999),
            enabled  = raw.get("enabled", True),
            conditions = RuleConditions(
                lang                    = c.get("lang"),
                source                  = c.get("source"),
                priority_gte            = c.get("priority_gte", 0),
                caller_id_prefix        = c.get("caller_id_prefix"),
                time_of_day_utc_between = c.get("time_of_day_utc_between"),
                time_of_day_utc_outside = c.get("time_of_day_utc_outside"),
            ),
            target = RuleTarget(
                queue_name        = t.get("queue_name", "ai-default"),
                priority_override = t.get("priority_override"),
                ai_config         = t.get("ai_config", {}),
                fallback_action   = t.get("fallback_action", "ai_bot"),
            ),
        )

    @property
    def rules(self) -> List[RoutingRule]:
        return self._rules

    def to_dict_list(self) -> List[Dict]:
        return [
            {
                "name":     r.name,
                "priority": r.priority,
                "enabled":  r.enabled,
                "conditions": {
                    "lang":                    r.conditions.lang,
                    "source":                  r.conditions.source,
                    "priority_gte":            r.conditions.priority_gte,
                    "caller_id_prefix":        r.conditions.caller_id_prefix,
                    "time_of_day_utc_between": r.conditions.time_of_day_utc_between,
                    "time_of_day_utc_outside": r.conditions.time_of_day_utc_outside,
                },
                "target": {
                    "queue_name":      r.target.queue_name,
                    "ai_config":       r.target.ai_config,
                    "fallback_action": r.target.fallback_action,
                },
            }
            for r in self._rules
        ]
