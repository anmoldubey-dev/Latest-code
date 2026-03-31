# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +---------------------------+
# | __init__()                |
# | * init per-call memory    |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | add_turn()                |
# | * append conversation turn|
# +---------------------------+
#     |
#     |----> <TurnRecord> -> __init__()
#     |        * build per-turn record object
#     |
#     v
# +---------------------------+
# | set_metadata()            |
# | * store key-value metadata|
# +---------------------------+
#     |
#     v
# +---------------------------+
# | get_history()             |
# | * return last n turns     |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | get_turn_records()        |
# | * return all turns as dict|
# +---------------------------+
#     |
#     v
# +---------------------------+
# | get_entities_aggregate()  |
# | * merge entities all turns|
# +---------------------------+
#     |
#     v
# +---------------------------+
# | stats()                   |
# | * return session metrics  |
# +---------------------------+
#     |
#     v
# +---------------------------+
# | to_json()                 |
# | * full JSON snapshot      |
# +---------------------------+
#     |
#     v
# [ END ]
#
# ================================================================

"""
session_memory
==============
Real-time in-memory session storage for a single call session.

Design
------
- One SessionMemory instance per LiveKit session (created in ai_worker).
- Stores full conversation history, extracted entities, per-turn metadata,
  and running latency stats.
- Thread-safe (asyncio.Lock for write operations).
- Serialisable to JSON for CRM handoff / post-call persistence.

License: Apache 2.0
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("callcenter.memory.session")


@dataclass
class TurnRecord:
    """One conversational turn."""
    turn_id:    int
    role:       str   # "user" | "assistant"
    text:       str
    lang:       str
    timestamp:  float = field(default_factory=time.perf_counter)
    entities:   Dict[str, Any] = field(default_factory=dict)
    latency_ms: Dict[str, float] = field(default_factory=dict)  # stt/llm/tts

    def to_dict(self) -> dict:
        return {
            "turn_id":   self.turn_id,
            "role":      self.role,
            "text":      self.text,
            "lang":      self.lang,
            "entities":  self.entities,
            "latency_ms": self.latency_ms,
            "ts":        self.timestamp,
        }


class SessionMemory:
    """
    Per-call ephemeral memory store.

    Attributes
    ----------
    session_id  : UUID of the LiveKit session.
    agent_name  : Voice agent name.
    lang        : Session language code.
    start_time  : ``time.perf_counter()`` at session start.
    """

    def __init__(
        self,
        session_id: str,
        agent_name: str = "",
        lang:       str = "en",
    ) -> None:
        self.session_id  = session_id
        self.agent_name  = agent_name
        self.lang        = lang
        self.start_time  = time.perf_counter()

        self._turns:     List[TurnRecord]   = []
        self._metadata:  Dict[str, Any]     = {}
        self._lock       = asyncio.Lock()

        # Running stats
        self._stt_ms:  List[float] = []
        self._llm_ms:  List[float] = []
        self._tts_ms:  List[float] = []

        logger.info(
            "[SessionMemory] created  session=%s  lang=%s",
            session_id[:8], lang,
        )

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def add_turn(
        self,
        role:       str,
        text:       str,
        lang:       str         = "",
        entities:   Optional[dict] = None,
        latency_ms: Optional[dict] = None,
    ) -> TurnRecord:
        """Append a new conversation turn."""
        async with self._lock:
            turn = TurnRecord(
                turn_id    = len(self._turns),
                role       = role,
                text       = text,
                lang       = lang or self.lang,
                entities   = entities   or {},
                latency_ms = latency_ms or {},
            )
            self._turns.append(turn)
            # Track latencies for metrics
            if latency_ms:
                if "stt" in latency_ms:
                    self._stt_ms.append(latency_ms["stt"])
                if "llm" in latency_ms:
                    self._llm_ms.append(latency_ms["llm"])
                if "tts" in latency_ms:
                    self._tts_ms.append(latency_ms["tts"])
        return turn

    def set_metadata(self, key: str, value: Any) -> None:
        self._metadata[key] = value

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get_history(self, n: int = 0) -> List[dict]:
        """Return last n turns as dicts (0 = all)."""
        turns = self._turns[-n:] if n else self._turns
        return [{"role": t.role, "text": t.text} for t in turns]

    def get_turn_records(self) -> List[dict]:
        return [t.to_dict() for t in self._turns]

    def get_entities_aggregate(self) -> Dict[str, List]:
        """Merge entities from all user turns."""
        agg: Dict[str, List] = {}
        for turn in self._turns:
            if turn.role == "user":
                for k, v in turn.entities.items():
                    agg.setdefault(k, []).extend(v)
        return agg

    # ------------------------------------------------------------------
    # Stats / Metrics
    # ------------------------------------------------------------------

    def stats(self) -> dict:
        """Return per-session performance metrics."""
        def _avg(lst):
            return round(sum(lst) / len(lst), 1) if lst else 0.0

        return {
            "session_id":       self.session_id[:8],
            "lang":             self.lang,
            "agent_name":       self.agent_name,
            "uptime_secs":      round(time.perf_counter() - self.start_time, 1),
            "total_turns":      len(self._turns),
            "user_turns":       sum(1 for t in self._turns if t.role == "user"),
            "agent_turns":      sum(1 for t in self._turns if t.role == "assistant"),
            "avg_stt_ms":       _avg(self._stt_ms),
            "avg_llm_ms":       _avg(self._llm_ms),
            "avg_tts_ms":       _avg(self._tts_ms),
            "metadata":         self._metadata,
        }

    def to_json(self) -> dict:
        """Full JSON-serialisable snapshot for post-call persistence."""
        return {
            "session_id":  self.session_id,
            "agent_name":  self.agent_name,
            "lang":        self.lang,
            "start_time":  datetime.fromtimestamp(
                self.start_time, tz=timezone.utc
            ).isoformat(),
            "stats":       self.stats(),
            "turns":       self.get_turn_records(),
            "entities":    self.get_entities_aggregate(),
            "metadata":    self._metadata,
        }
