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

from typing import Optional


class BargeInHandler:
    def __init__(self) -> None:
        self.interrupted = False

    def trigger(self, current_task: Optional[object] = None) -> None:
        """Mark interrupted and cancel in-flight task."""
        self.interrupted = True
        if current_task and not current_task.done():
            current_task.cancel()

    def consume(self) -> bool:
        """Returns True if interrupted and resets the flag."""
        if self.interrupted:
            self.interrupted = False
            return True
        return False
