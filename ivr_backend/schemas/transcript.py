# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +------------------------------------------+
# | TranscriptCreate()                        |
# | * POST transcript request schema          |
# +------------------------------------------+
#     |
#     v
# +------------------------------------------+
# | TranscriptResponse()                      |
# | * serialized transcript response schema   |
# +------------------------------------------+
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
