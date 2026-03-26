# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +------------------------------------------+
# | TranscriptCreate()                        |
# | * POST /calls/{id}/transcript request     |
# +------------------------------------------+
#     |
#     |----> speaker              * agent / caller / system
#     |
#     |----> text                 * transcribed speech content
#     |
#     v
# +------------------------------------------+
# | TranscriptResponse()                      |
# | * serialized transcript response model    |
# +------------------------------------------+
#     |
#     |----> id / call_id / speaker / text / created_at  * response fields
#
# ================================================================

from pydantic import BaseModel
from datetime import datetime


class TranscriptCreate(BaseModel):
    speaker: str
    text: str


class TranscriptResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    call_id: int
    speaker: str
    text: str
    created_at: datetime
