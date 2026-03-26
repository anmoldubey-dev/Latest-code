# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +--------------------------------------+
# | Transcript()                         |
# | * ORM model for transcripts table    |
# +--------------------------------------+
#     |
#     |----> call_id              * FK to calls table
#     |
#     |----> speaker              * agent / caller / system
#     |
#     |----> text                 * transcribed speech content
#     |
#     |----> created_at           * timestamp of turn
#     |
#     |----> <relationship> -> Call()   * back-populates Call.transcripts
#                                         ordered by created_at ascending
#
# ================================================================

from datetime import datetime
from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from ..database.connection import Base


class Transcript(Base):
    __tablename__ = "transcripts"

    id         = Column(Integer, primary_key=True, index=True)
    call_id    = Column(Integer, ForeignKey("calls.id"), nullable=False)
    speaker    = Column(SAEnum("agent", "caller", "system", name="speaker_role"), nullable=False)
    text       = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    call = relationship("Call", back_populates="transcripts")
