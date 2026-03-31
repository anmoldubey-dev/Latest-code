# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +--------------------------------------+
# | CallRoute()                          |
# | * ORM model for call_routes table    |
# +--------------------------------------+
#     |
#     |----> relationship()
#     |        * back-populates Call.routes
#
# ================================================================

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from ..database.connection import Base


class CallRoute(Base):
    __tablename__ = "call_routes"

    id                = Column(Integer, primary_key=True, index=True)
    call_id           = Column(Integer, ForeignKey("calls.id"), nullable=False)
    from_agent_id     = Column(Integer, ForeignKey("agents.id"), nullable=True)
    to_agent_id       = Column(Integer, ForeignKey("agents.id"), nullable=True)
    from_department   = Column(String(100), nullable=True)
    to_department     = Column(String(100), nullable=True)
    action_type       = Column(SAEnum("transfer", "ivr_redirect", "conference", name="route_action"), nullable=False)
    routed_at         = Column(DateTime, default=datetime.utcnow)

    call = relationship("Call", back_populates="routes")
