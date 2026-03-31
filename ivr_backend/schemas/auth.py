# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | LoginRequest()                   |
# | * POST /auth/login request body  |
# +----------------------------------+
#     |
#     v
# +----------------------------------+
# | TokenResponse()                  |
# | * JWT auth response model        |
# +----------------------------------+
#     |
#     v
# +----------------------------------+
# | UserResponse()                   |
# | * GET /auth/me profile model     |
# +----------------------------------+
#
# ================================================================

from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    user_id: int


class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    username: str
    email: Optional[str]
    role: str
    is_active: bool
