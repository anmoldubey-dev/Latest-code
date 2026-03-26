# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | CallStartRequest()               |
# | * POST /calls/start request body |
# +----------------------------------+
#     |
#     |----> caller_number / agent_id / department  * call init fields
#     |
#     v
# +----------------------------------+
# | TransferRequest()                |
# | * POST /calls/{id}/transfer body |
# +----------------------------------+
#     |
#     |----> to_agent_id / to_department / action_type  * transfer fields
#     |
#     v
# +----------------------------------+
# | CallRouteResponse()              |
# | * serialized route in responses  |
# +----------------------------------+
#     |
#     |----> id / from_department / to_department / action_type / routed_at
#     |
#     v
# +----------------------------------+
# | CallResponse()                   |
# | * full call data response model  |
# +----------------------------------+
#     |
#     |----> from_orm_with_agent()    * build response from ORM Call
#                 |
#                 |----> agent_name   * resolved from Call.agent
#                 |
#                 |----> routes       * List[CallRouteResponse]
#
# ================================================================

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class CallStartRequest(BaseModel):
    caller_number: str
    department: Optional[str] = "General"
    agent_id: Optional[int] = None


class TransferRequest(BaseModel):
    to_department: Optional[str] = None
    to_agent_id: Optional[int] = None
    action_type: str = "transfer"


class CallRouteResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    from_department: Optional[str]
    to_department: Optional[str]
    action_type: str
    routed_at: datetime


class CallResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    caller_number: str
    agent_id: Optional[int]
    agent_name: Optional[str] = None
    department: Optional[str]
    status: str
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: int
    recording_path: Optional[str]
    created_at: datetime
    routes: List[CallRouteResponse] = []

    @classmethod
    def from_orm_with_agent(cls, call):
        data = {
            "id": call.id,
            "caller_number": call.caller_number,
            "agent_id": call.agent_id,
            "agent_name": call.agent.name if call.agent else None,
            "department": call.department,
            "status": call.status,
            "started_at": call.started_at,
            "ended_at": call.ended_at,
            "duration_seconds": call.duration_seconds,
            "recording_path": call.recording_path,
            "created_at": call.created_at,
            "routes": call.routes,
        }
        return cls(**data)
