# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#    |
#    v
# +-------------------------------+
# | __init__()                    |
# | * init session dict and lock  |
# +-------------------------------+
#    |
#    v
# +-------------------------------+
# | add()                         |
# | * register session by id      |
# +-------------------------------+
#    |
#    |----> <Lock> -> acquire()
#    |        * lock registry for write
#    |
#    v
# +-------------------------------+
# | get()                         |
# | * lookup session by id        |
# +-------------------------------+
#    |
#    v
# +-------------------------------+
# | remove()                      |
# | * pop session from registry   |
# +-------------------------------+
#    |
#    |----> <Lock> -> acquire()
#    |        * lock registry for write
#    |
#    v
# +-------------------------------+
# | cleanup_session()             |
# | * stop audio and mark closed  |
# +-------------------------------+
#    |
#    |----> remove()
#    |        * deregister session
#    |
#    |----> <TtsAudioSource> -> stop()
#    |        * cancel audio pump task
#    |
#    v
# +-------------------------------+
# | cleanup_all()                 |
# | * teardown all sessions       |
# +-------------------------------+
#    |
#    |----> cleanup_session()
#    |        * teardown each session
#    |
#    v
# +-------------------------------+
# | count()                       |
# | * return active session count |
# +-------------------------------+
#
# ================================================================

import asyncio
import logging
from typing import Dict, Optional

from .livekit_session import LiveKitSession

logger = logging.getLogger("callcenter.livekit.sessions")


class LiveKitSessionManager:

    def __init__(self) -> None:
        self._sessions: Dict[str, LiveKitSession] = {}
        self._lock = asyncio.Lock()

    async def add(self, session: LiveKitSession) -> None:
        async with self._lock:
            self._sessions[session.session_id] = session
        logger.info(
            "[Sessions] + added   session=%s  total=%d",
            session.session_id[:8], len(self._sessions),
        )

    async def remove(self, session_id: str) -> Optional[LiveKitSession]:
        async with self._lock:
            session = self._sessions.pop(session_id, None)
        if session:
            logger.info(
                "[Sessions] - removed session=%s  total=%d",
                session_id[:8], len(self._sessions),
            )
        return session

    def get(self, session_id: str) -> Optional[LiveKitSession]:
        return self._sessions.get(session_id)

    async def cleanup_session(self, session_id: str) -> None:
        session = await self.remove(session_id)
        if session is None:
            return

        if session.closed:
            return

        session.closed = True

        if session.audio_source is not None:
            try:
                session.audio_source.stop()
            except Exception:
                pass

        logger.info("[Sessions] cleanup done  session=%s", session_id[:8])

    async def cleanup_all(self) -> None:
        async with self._lock:
            ids = list(self._sessions.keys())
        for sid in ids:
            await self.cleanup_session(sid)
        logger.info("[Sessions] all sessions cleaned up")

    @property
    def count(self) -> int:
        return len(self._sessions)

    @property
    def session_ids(self) -> list:
        return list(self._sessions.keys())


livekit_session_manager = LiveKitSessionManager()
