# ======================== Admin Router ========================
# Admin Router -> Handles platform stats, user management, and call log CRUD.
# ======================================================================

import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from deps import require_admin, get_current_user # 🟢 Added get_current_user
from models.db import get_db

router = APIRouter()

class CreditsRequest(BaseModel):
    amount: int

# ---------------------------------------------------------------
# SECTION: ADMIN ONLY ROUTES
# ---------------------------------------------------------------

@router.get("/admin/stats")
def get_stats(user=Depends(require_admin)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute("SELECT COUNT(*) as total FROM users")
    total_users = cursor.fetchone()["total"]
    cursor.execute("SELECT COUNT(*) as total FROM call_logs")
    total_calls = cursor.fetchone()["total"]
    cursor.execute("SELECT COUNT(*) as total FROM agents")
    total_agents = cursor.fetchone()["total"]
    cursor.close()
    conn.close()
    return {
        "totalUsers":  total_users,
        "totalCalls":  total_calls,
        "totalAgents": total_agents,
        "creditsUsed": 0,
    }

@router.get("/admin/users")
def get_users(user=Depends(require_admin)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute("SELECT id, name, email, role, is_active FROM users ORDER BY id DESC")
    users = cursor.fetchall()
    cursor.close()
    conn.close()
    return users

@router.put("/admin/users/{user_id}/status")
def toggle_status(user_id: int, user=Depends(require_admin)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute("SELECT is_active FROM users WHERE id = %s", (user_id,))
    target = cursor.fetchone()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    new_status = not target["is_active"]
    cursor.execute("UPDATE users SET is_active = %s WHERE id = %s", (new_status, user_id))
    conn.commit()
    cursor.close()
    conn.close()
    return {"success": True, "is_active": new_status}

@router.put("/admin/users/{user_id}/credits")
def add_credits(user_id: int, body: CreditsRequest, user=Depends(require_admin)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute("UPDATE users SET credits = COALESCE(credits, 0) + %s WHERE id = %s", (body.amount, user_id))
    conn.commit()
    cursor.close()
    conn.close()
    return {"success": True}

# ---------------------------------------------------------------
# SECTION: SHARED CALL ROUTES (OPEN FOR AGENTS 🔓)
# ---------------------------------------------------------------

# 🟢 Changed from require_admin to get_current_user
@router.get("/calls")
def get_calls(user=Depends(get_current_user)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute("""
        SELECT cl.id, cl.caller_name, cl.caller_number, cl.category,
               cl.sentiment, cl.status, cl.duration_seconds,
               cl.issue_summary, cl.created_at,
               a.name AS agent_name
        FROM call_logs cl
        LEFT JOIN agents a ON cl.agent_id = a.id
        ORDER BY cl.created_at DESC
        LIMIT 100
    """)
    calls = cursor.fetchall()
    for call in calls:
        if call.get("created_at"):
            call["created_at"] = str(call["created_at"])
    cursor.close()
    conn.close()
    return calls

@router.post("/calls")
def create_call(call: dict, user=Depends(get_current_user)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute("""
        INSERT INTO call_logs (caller_name, caller_number, category, status, issue_summary)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
    """, (
        call.get("caller_name"), call.get("caller_number"),
        call.get("category"), call.get("status", "unknown"),
        call.get("issue_summary"),
    ))
    new_id = cursor.fetchone()["id"]
    conn.commit()
    cursor.close()
    conn.close()
    return {"id": new_id}

@router.put("/calls/{call_id}")
def update_call(call_id: int, call: dict, user=Depends(get_current_user)):
    conn   = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute("UPDATE call_logs SET status=%s WHERE id=%s", (call.get("status"), call_id))
    conn.commit()
    cursor.close()
    conn.close()
    return {"success": True}


# ---------------------------------------------------------------
# SECTION: CALL CENTER ADMIN CONFIG (live DB-backed settings)
# ---------------------------------------------------------------

class ConfigUpdateRequest(BaseModel):
    """Batch update: send a dict of { key: value } pairs."""
    updates: dict


@router.get("/admin/config")
async def get_cc_config(_user=Depends(require_admin)):
    """Return all call-center admin_config key-value pairs."""
    try:
        from callcenter.db import get_all_config
        config = await get_all_config()
        return {"config": config}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"CC config unavailable: {exc}")


@router.put("/admin/config")
async def update_cc_config(body: ConfigUpdateRequest, _user=Depends(require_admin)):
    """
    Batch-update admin_config.  Accepts { "updates": { "work_start": "09:00", ... } }.
    After saving, reloads business-hours and SMTP caches immediately.
    """
    try:
        from callcenter.db import set_config
        from callcenter.business_hours import load_config_from_db
        from callcenter.email_service  import load_email_config_from_db

        for key, value in body.updates.items():
            await set_config(str(key), str(value))

        # Reload in-memory caches so changes take effect without restart
        await load_config_from_db()
        await load_email_config_from_db()

        return {"status": "saved", "updated_keys": list(body.updates.keys())}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"CC config save failed: {exc}")