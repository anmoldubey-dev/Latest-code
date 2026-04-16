# ======================== Deps ========================
# Deps -> JWT token validation and role-based access control dependencies for all protected routes.
# ||
# ||
# ||
# Functions/Methods -> get_current_user() -> Decode JWT -> Fetch user from DB -> Return user dict
# ||                 | require_admin()    -> Wrap get_current_user() -> Enforce admin role
# ||                 | require_superuser() -> Wrap get_current_user() -> Enforce superuser role
# ||                 | require_user()     -> Wrap get_current_user() -> Enforce any valid role
# ||                 |
# ||                 |---> Logic Flow -> Dependency resolution:
# ||                                  |
# ||                                  |--- get_current_user()
# ||                                  |    ├── Strip "Bearer " prefix from Authorization header
# ||                                  |    ├── IF no token -> Raise 401
# ||                                  |    ├── jwt.decode() -> Verify signature + expiry
# ||                                  |    ├── SELECT user WHERE id = payload["user_id"]
# ||                                  |    ├── IF user not found -> Raise 401
# ||                                  |    ├── IF token expired -> Raise 401
# ||                                  |    ├── IF invalid token -> Raise 401
# ||                                  |    └── Return -> dict(user)
# ||                                  |
# ||                                  |--- require_admin()
# ||                                  |    ├── Call get_current_user()
# ||                                  |    └── IF role != "admin" -> Raise 403
# ||                                  |
# ||                                  |--- require_superuser()
# ||                                  |    ├── Call get_current_user()
# ||                                  |    └── IF role != "superuser" -> Raise 403
# ||                                  |
# ||                                  |--- require_user()
# ||                                  |    ├── Call get_current_user()
# ||                                  |    └── IF role not in (user, admin, superuser) -> Raise 403
# ||
# ======================================================================

# ---------------------------------------------------------------
# SECTION: IMPORTS
# ---------------------------------------------------------------
import jwt
import psycopg2.extras
from fastapi import Header, HTTPException
from config import JWT_SECRET, JWT_ALGO
from models.db import get_db


# ---------------------------------------------------------------
# SECTION: AUTH DEPENDENCIES
# ---------------------------------------------------------------

# get_current_user -> Decodes JWT, fetches user row, returns dict
def get_current_user(authorization: str = Header(default="")):
    token = authorization.replace("Bearer ", "").strip()

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])  # Verify + decode
        conn   = get_db()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute("SELECT * FROM users WHERE id = %s", (payload["user_id"],))
        user = cursor.fetchone()
        cursor.close()
        conn.close()

        if not user:
            raise HTTPException(status_code=401, detail="User not found")  # Guard -> deleted user

        return dict(user)

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")   # Guard -> stale token

    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")   # Guard -> tampered token


# require_admin -> Enforces admin-only access
def require_admin(authorization: str = Header(default="")):
    user = get_current_user(authorization)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")  # Guard -> wrong role
    return user


# require_superuser -> Enforces superuser-only access
def require_superuser(authorization: str = Header(default="")):
    user = get_current_user(authorization)
    if user["role"] != "superuser":
        raise HTTPException(status_code=403, detail="Superuser access required")  # Guard -> wrong role
    return user


# require_user -> Allows any recognised role (user, admin, superuser, agent)
def require_user(authorization: str = Header(default="")):
    user = get_current_user(authorization)
    if user["role"] not in ("user", "admin", "superuser", "agent"):
        raise HTTPException(status_code=403, detail="Access denied")  # Guard -> unknown role
    return user