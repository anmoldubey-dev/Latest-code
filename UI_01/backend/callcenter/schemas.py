# Pydantic schemas used by the call center queue engine.

from typing import Optional
from pydantic import BaseModel


class QueueCallEvent(BaseModel):
    """Event for synchronizing queue state across instances via Kafka."""
    event_type:    str            # enqueue | dequeue | pop
    session_id:    str
    room_id:       Optional[str]   = None
    caller_id:     Optional[str]   = None
    user_email:    Optional[str]   = None
    department:    Optional[str]   = None
    joined_at:     Optional[float] = None
    call_log_id:   Optional[int]   = None
    user_id:       Optional[int]   = None
    skip_outbound: Optional[bool]  = False
    reason:        Optional[str]   = None  # for dequeue: abandoned / completed
