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
#     |----> <auth_service> -> authenticate_user()  * verify username and password
#     |           |
#     |           |----> <db> -> query()             * lookup User by username
#     |           |
#     |           |----> verify_password()           * compare password hash
#     |
#     |----> <auth_service> -> create_token()        * sign HS256 JWT
#     |
#     |----> return TokenResponse()                  * access_token and role
#     |
#     v
# +----------------------------------+
# | me()                             |
# | * GET /auth/me current profile   |
# +----------------------------------+
#     |
#     |----> <auth_service> -> get_current_user()   * decode JWT bearer token
#     |
#     |----> return UserResponse()                  * id name email role
#
# ================================================================

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database.connection import get_db
from ..schemas.auth import LoginRequest, TokenResponse, UserResponse
from ..services.auth_service import authenticate_user, create_token, get_current_user
from ..models.user import User

router = APIRouter(tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, req.username, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_token(user.id, user.username, user.role)
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
