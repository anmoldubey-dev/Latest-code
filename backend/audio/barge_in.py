# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------+
# | trigger()                     |
# | * signal interruption state   |
# +-------------------------------+
#     |
#     |----> cancel()
#     |        * stop current task
#     |
#     |----> post()
#     |        * signal remote tts stop
#     |
#     v
# +-------------------------------+
# | consume()                     |
# | * reset and return status     |
# +-------------------------------+
#     |
#     v
# [ END ]
# ================================================================
"""
BargeInHandler
--------------
Manages barge-in (interruption) state for a WebSocket call session.
Cancels in-flight turn tasks and signals both TTS services to stop.
"""

import threading
from typing import Optional

import requests as _req

from backend.speech.tts_client import _INDIC_TTS_URL, _GLOBAL_TTS_URL


class BargeInHandler:
    def __init__(self) -> None:
        self.interrupted = False

    def trigger(self, current_task: Optional[object] = None) -> None:
        """Mark interrupted, cancel in-flight task, signal TTS services."""
        self.interrupted = True
        if current_task and not current_task.done():
            current_task.cancel()
        for url in (_INDIC_TTS_URL, _GLOBAL_TTS_URL):
            def _cancel(u=url):
                try: _req.post(f"{u}/cancel", timeout=1)
                except Exception: pass
            threading.Thread(target=_cancel, daemon=True).start()

    def consume(self) -> bool:
        """Returns True if interrupted and resets the flag."""
        if self.interrupted:
            self.interrupted = False
            return True
        return False
