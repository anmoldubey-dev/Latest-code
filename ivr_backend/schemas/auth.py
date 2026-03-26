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
#     |----> username                * login identifier field
#     |
#     |----> password                * plain text password field
#     |
#     v
# +----------------------------------+
# | TokenResponse()                  |
# | * JWT auth response model        |
# +----------------------------------+
#     |
#     |----> access_token            * signed HS256 JWT string
#     |
#     |----> token_type              * bearer string
#     |
#     |----> role                    * user or admin
#     |
#     |----> username                * authenticated user name
#     |
#     |----> user_id                 * authenticated user ID
#     |
#     v
# +----------------------------------+
# | UserResponse()                   |
# | * GET /auth/me profile model     |
# +----------------------------------+
#     |
#     |----> id / username / email / role / is_active  * profile fields
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
