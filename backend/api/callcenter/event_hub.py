# EventHub — fan-out broadcast hub for call-center real-time events.
# Adapted from Routing/livekit/websocket/hub.py
# A module-level singleton `event_hub` is exported for use by all CC modules.

import asyncio
import logging
import time
from collections import deque
from typing import Any, Deque, Dict, Optional, Set

logger = logging.getLogger("callcenter.event_hub")

_MAX_QUEUE_SIZE = 200   # per subscriber
_HISTORY_SIZE   = 100   # recent events kept for new-subscriber catch-up


class EventHub:
    """
    Thread-safe (single asyncio loop) fan-out broadcast hub.
    """

    def __init__(self) -> None:
        self._subscribers: Set[asyncio.Queue] = set()
        self._history: Deque[Dict]            = deque(maxlen=_HISTORY_SIZE)
        self._lock                            = asyncio.Lock()
        self._total_published: int            = 0
        self._total_dropped:   int            = 0

    # ── Subscribe / unsubscribe ───────────────────────────────────────────────

    async def subscribe(self, replay_history: bool = True) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=_MAX_QUEUE_SIZE)
        async with self._lock:
            if replay_history:
                for evt in list(self._history):
                    try:
                        q.put_nowait(evt)
                    except asyncio.QueueFull:
                        break
            self._subscribers.add(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue) -> None:
        async with self._lock:
            self._subscribers.discard(q)

    # ── Publish ───────────────────────────────────────────────────────────────

    async def publish(self, event: Dict[str, Any]) -> None:
        """Broadcast an event to all subscribers. Stamps 'ts' if missing."""
        if "ts" not in event:
            event = {**event, "ts": time.time()}

        async with self._lock:
            self._history.append(event)
            self._total_published += 1
            for q in list(self._subscribers):
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                    try:
                        q.put_nowait(event)
                    except asyncio.QueueFull:
                        pass
                    self._total_dropped += 1

    def publish_sync(self, event: Dict[str, Any],
                     loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        """Fire-and-forget publish from synchronous code."""
        try:
            lp = loop or asyncio.get_event_loop()
            if lp.is_running():
                lp.create_task(self.publish(event))
        except Exception:
            pass

    # ── Stats ─────────────────────────────────────────────────────────────────

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def stats(self) -> Dict:
        return {
            "subscribers":     self.subscriber_count,
            "total_published": self._total_published,
            "total_dropped":   self._total_dropped,
            "history_size":    len(self._history),
        }


# Module-level singleton — import this everywhere
event_hub = EventHub()
