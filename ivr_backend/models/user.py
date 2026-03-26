# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------+
# | User()                        |
# | * ORM model for users table   |
# +-------------------------------+
#     |
#     |----> id / name / email / password_hash  * account fields
#     |
#     |----> is_active             * account status flag
#     |
#     |----> <relationship> -> Agent()  * one-to-one to Agent
#     |
#     v
# +-------------------------------+
# | Agent()                       |
# | * ORM model for agents table  |
# +-------------------------------+
#     |
#     |----> user_id              * FK to users table
#     |
#     |----> name / persona / voice_model  * AI agent identity
#     |
#     |----> last_sentiment        * latest sentiment score
#     |
#     |----> <relationship> -> User()   * back-populates User.agent
#     |
#     |----> <relationship> -> Call()   * one-to-many list of calls
#
# ================================================================

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from ..database.connection import Base


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String(100), nullable=False)
    email         = Column(String(100), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=True)
    phone_number  = Column(String(20), nullable=True)
    country_code  = Column(String(10), nullable=True)
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, nullable=True)

    agent = relationship("Agent", back_populates="user", uselist=False)


class Agent(Base):
    __tablename__ = "agents"

    id                     = Column(Integer, primary_key=True, index=True)
    user_id                = Column(Integer, ForeignKey("users.id"), nullable=False)
    name                   = Column(String(100), nullable=False)
    persona                = Column(String(255), nullable=True)
    voice_model            = Column(String(50), nullable=True)
    phone_number           = Column(String(20), nullable=True)
    total_calls            = Column(Integer, default=0)
    total_duration_seconds = Column(Integer, default=0)
    last_call_at           = Column(DateTime, nullable=True)
    last_sentiment         = Column(String(50), nullable=True)
    is_active              = Column(Boolean, default=True)
    created_at             = Column(DateTime, default=datetime.utcnow)

    user  = relationship("User", back_populates="agent")
    calls = relationship("Call", back_populates="agent")
