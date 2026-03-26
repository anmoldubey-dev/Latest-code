# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------+
# | Call()                        |
# | * ORM model for calls table   |
# +-------------------------------+
#     |
#     |----> caller_number        * incoming caller ID column
#     |
#     |----> agent_id             * FK to agents table
#     |
#     |----> status               * dialing/connected/ended etc.
#     |
#     |----> <relationship> -> Agent()         * resolve agent ORM
#     |
#     |----> <relationship> -> CallRoute()     * list of call routes
#     |
#     |----> <relationship> -> Transcript()    * ordered transcripts
#
# ================================================================

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from ..database.connection import Base

CALL_STATUSES = ("dialing", "ringing", "connected", "on_hold", "transferred", "conference", "ended")


class Call(Base):
    __tablename__ = "calls"

    id               = Column(Integer, primary_key=True, index=True)
    caller_number    = Column(String(20), nullable=False)
    agent_id         = Column(Integer, ForeignKey("agents.id"), nullable=True)
    department       = Column(String(100), nullable=True)
    status           = Column(SAEnum(*CALL_STATUSES, name="call_status"), default="dialing")
    started_at       = Column(DateTime, default=datetime.utcnow)
    ended_at         = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)
    recording_path   = Column(String(255), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)

    agent       = relationship("Agent", back_populates="calls")
    routes      = relationship("CallRoute", back_populates="call", cascade="all, delete-orphan")
    transcripts = relationship("Transcript", back_populates="call", cascade="all, delete-orphan",
                               order_by="Transcript.created_at")
