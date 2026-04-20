"""
auth_routes.py — Login, register, forgot/reset password.
Uses the Srcom-soft Neon DB (same as pg_memory).
"""
import jwt, bcrypt, datetime, secrets, time, traceback, os
import psycopg2, psycopg2.extras
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

DB_URL          = os.getenv("DATABASE_URL",
    "postgresql://neondb_owner:npg_4U3AtckjizXN@ep-shiny-glitter-a1t4vbtj.ap-southeast-1.aws.neon.tech/Srcom-soft?sslmode=require")
JWT_SECRET      = os.getenv("JWT_SECRET", "srcomsoft-change-me")
JWT_ALGO        = "HS256"
JWT_EXPIRE_DAYS = 7

router = APIRouter(prefix="/api")
_reset_tokens: dict = {}


def get_db():
    return psycopg2.connect(DB_URL)


def _make_token(user_id, email=""):
    return jwt.encode(
        {"user_id": user_id, "email": email,
         "exp": datetime.datetime.utcnow() + datetime.timedelta(days=JWT_EXPIRE_DAYS)},
        JWT_SECRET, algorithm=JWT_ALGO,
    )


# ── Models ────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str; email: str; password: str; phone_number: str = ""

class LoginRequest(BaseModel):
    email: str; password: str; department: str = ""

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str; code: str; new_password: str


# ── Register ──────────────────────────────────────────────────────
@router.post("/register")
def register(body: RegisterRequest):
    name  = body.name.strip()
    email = body.email.strip().lower()
    if not name or not email or not body.password:
        raise HTTPException(400, "All fields are required")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    try:
        conn = get_db(); cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "INSERT INTO users (name, email, password_hash, phone_number, role) VALUES (%s,%s,%s,%s,%s) RETURNING id",
            (name, email, pw_hash, body.phone_number.strip() or None, "user"),
        )
        uid = cur.fetchone()["id"]; conn.commit(); cur.close(); conn.close()
        return {"message": "Account created", "token": _make_token(uid, email),
                "user": {"id": uid, "name": name, "email": email, "role": "user"}}
    except Exception as e:
        traceback.print_exc()
        if "duplicate key" in str(e).lower():
            raise HTTPException(409, "Email already registered")
        raise HTTPException(500, str(e))


# ── Login ─────────────────────────────────────────────────────────
@router.post("/login")
async def login(body: LoginRequest):
    email = body.email.strip().lower()
    try:
        conn = get_db(); cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM users WHERE email=%s", (email,))
        user = cur.fetchone(); cur.close(); conn.close()
    except Exception as e:
        raise HTTPException(500, str(e))
    if not user:
        raise HTTPException(401, "Invalid email or password")
    if not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(401, "Invalid email or password")
    return {
        "message": "Login successful",
        "token": _make_token(user["id"], user["email"]),
        "user": {
            "id": user["id"], "name": user["name"],
            "email": user["email"], "role": user.get("role") or "user",
            "phone_number": user.get("phone_number", ""),
            "department": body.department if user.get("role") == "agent" else "",
        },
    }


# ── Forgot password ───────────────────────────────────────────────
@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    email = body.email.strip().lower()
    try:
        conn = get_db(); cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM users WHERE email=%s", (email,)); user = cur.fetchone()
        cur.close(); conn.close()
    except Exception as e:
        raise HTTPException(500, str(e))
    if user:
        code = str(secrets.randbelow(900000) + 100000)
        _reset_tokens[email] = (code, time.time() + 600)
        try:
            from backend.routing_ivr.email_service import send_email
            await send_email(email, "SR Comsoft — Password Reset Code",
                             f"Your reset code is: {code}\nExpires in 10 minutes.")
        except Exception:
            pass  # code still valid even if email fails
    return {"message": "If this email is registered, a reset code has been sent."}


# ── Reset password ────────────────────────────────────────────────
@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest):
    email = body.email.strip().lower()
    entry = _reset_tokens.get(email)
    if not entry:
        raise HTTPException(400, "Invalid or expired reset code")
    code, exp = entry
    if time.time() > exp:
        _reset_tokens.pop(email, None); raise HTTPException(400, "Reset code has expired")
    if body.code.strip() != code:
        raise HTTPException(400, "Incorrect reset code")
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    pw_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute("UPDATE users SET password_hash=%s WHERE email=%s", (pw_hash, email))
        conn.commit(); cur.close(); conn.close()
    except Exception as e:
        raise HTTPException(500, str(e))
    _reset_tokens.pop(email, None)
    return {"message": "Password updated successfully. You can now log in."}
