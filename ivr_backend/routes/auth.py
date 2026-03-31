# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +----------------------------------+
# | login()                          |
# | * POST /auth/login issue JWT     |
# +----------------------------------+
#     |
#     |----> authenticate_user()
#     |        * verify username and password
#     |
#     |----> create_token()
#     |        * sign HS256 JWT
#     |
#     |----> <TokenResponse> -> __init__()
#     |        * build access_token response
#     |
#     v
# +----------------------------------+
# | me()                             |
# | * GET /auth/me current profile   |
# +----------------------------------+
#     |
#     |----> get_current_user()
#     |        * decode JWT bearer token
#     |
#     |----> <UserResponse> -> __init__()
#     |        * build profile response
#
# ================================================================

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ..database.connection import get_db
from ..schemas.auth import LoginRequest, TokenResponse, UserResponse
from ..services.auth_service import authenticate_user, create_token, get_current_user
from ..models.user import User

router = APIRouter(tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, req.username, req.password)
    if not user:
        logger.warning("[auth route] login failed  username=%s", req.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_token(user.id, user.username, user.role)
    logger.info("[auth route] login success  username=%s  role=%s", user.username, user.role)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=user.role,
        username=user.username,
        user_id=user.id,
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
