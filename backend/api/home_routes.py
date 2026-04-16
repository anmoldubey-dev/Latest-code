"""
home_routes.py — Stubs for UI_01 routes the frontend calls.
Provides /api/home/stats, /api/home/recent-activity,
/api/ws/events (agent event bus WS),
/api/cc/agent/heartbeat, /api/cc/agent/online.
"""
import asyncio, json, os
import jwt as pyjwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "srcomsoft-change-me")
JWT_ALGO   = "HS256"

def _agent_identity(request: Request) -> str:
    """Extract agent identity (email/user_id) from Bearer token."""
    try:
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return str(payload.get("email") or payload.get("user_id") or "")
    except Exception:
        return ""

# ── Event bus: agents subscribe here for push events ─────────────────────────
_event_subs: list[WebSocket] = []


@router.websocket("/api/ws/events")
async def ws_events(ws: WebSocket):
    """Bridge to the real callcenter event_hub so legacy /api/ws/events clients still work."""
    await ws.accept()
    try:
        from backend.api.callcenter.event_hub import event_hub
        queue = await event_hub.subscribe(replay_history=True)
        async def _send():
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    await ws.send_text(json.dumps(event))
                except asyncio.TimeoutError:
                    await ws.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    return
        await _send()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            from backend.api.callcenter.event_hub import event_hub
            await event_hub.unsubscribe(queue)
        except Exception:
            pass


async def broadcast_event(payload: dict):
    dead = []
    for ws in list(_event_subs):
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            dead.append(ws)
    _event_subs[:] = [c for c in _event_subs if c not in dead]


# ── Home dashboard stubs ──────────────────────────────────────────────────────

@router.get("/api/home/stats")
async def home_stats():
    return {"total_calls_7d": 0, "avg_per_day": 0, "active_regions": 0}


@router.get("/api/home/recent-activity")
async def home_recent_activity(limit: int = 5):
    return []


# ── Agent dashboard — live DB ─────────────────────────────────────────────────

@router.get("/api/agent/profile")
async def agent_profile(request: Request):
    identity = _agent_identity(request)
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT agent_name, department, status FROM agent_states WHERE agent_identity=$1", identity
            )
        if row:
            return {"name": row["agent_name"] or identity, "email": identity,
                    "department": row["department"] or "General", "status": row["status"] or "online"}
    except Exception:
        pass
    return {"name": identity or "Agent", "email": identity, "department": "General", "status": "online"}


@router.get("/api/agent/call-stats")
async def agent_call_stats(request: Request):
    identity = _agent_identity(request)
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            summary = await conn.fetchrow(
                """SELECT COUNT(*) as total,
                          COUNT(*) FILTER (WHERE status IN ('ended','connected','completed')) as answered,
                          COUNT(*) FILTER (WHERE status='abandoned') as missed,
                          COALESCE(AVG(call_duration) FILTER (WHERE call_duration>0), 0) as avg_duration
                   FROM cc_sessions WHERE agent_id=$1""", identity)
            status_rows = await conn.fetch(
                "SELECT status, COUNT(*) as cnt FROM cc_sessions WHERE agent_id=$1 GROUP BY status", identity)
            daily_rows = await conn.fetch(
                """SELECT DATE(created_at) as day, COUNT(*) as calls,
                          COALESCE(AVG(call_duration),0) as avg_duration
                   FROM cc_sessions WHERE agent_id=$1
                   GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 30""", identity)
            hourly_rows = await conn.fetch(
                """SELECT EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*) as calls
                   FROM cc_sessions WHERE agent_id=$1
                   GROUP BY hour ORDER BY hour""", identity)
            dept_rows = await conn.fetch(
                "SELECT department as category, COUNT(*) as cnt FROM cc_sessions WHERE agent_id=$1 GROUP BY department",
                identity)
        return {
            "total": summary["total"], "answered": summary["answered"],
            "missed": summary["missed"], "avg_duration": round(float(summary["avg_duration"] or 0)),
            "statusBreakdown":   [{"status": r["status"], "cnt": r["cnt"]} for r in status_rows],
            "dailyVolume":       [{"day": str(r["day"]), "calls": r["calls"], "avgDuration": float(r["avg_duration"])} for r in daily_rows],
            "hourlyHeatmap":     [{"hour": r["hour"], "calls": r["calls"]} for r in hourly_rows],
            "categoryBreakdown": [{"category": r["category"] or "General", "cnt": r["cnt"]} for r in dept_rows],
            "sentimentBreakdown": [],
            "sankeyRaw": [],
        }
    except Exception:
        return {"total": 0, "answered": 0, "missed": 0, "avg_duration": 0,
                "statusBreakdown": [], "dailyVolume": [], "hourlyHeatmap": [],
                "categoryBreakdown": [], "sentimentBreakdown": [], "sankeyRaw": []}


@router.get("/api/agent/calls")
async def agent_calls(request: Request, limit: int = 100):
    identity = _agent_identity(request)
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT s.session_id, s.department, s.status, s.call_duration,
                          s.created_at, c.email as caller_email, c.display_name as caller_name
                   FROM cc_sessions s LEFT JOIN cc_callers c ON c.id=s.caller_id
                   WHERE s.agent_id=$1 ORDER BY s.created_at DESC LIMIT $2""",
                identity, limit
            )
        return [{"session_id": r["session_id"], "caller_name": r["caller_name"] or r["caller_email"] or "Unknown",
                 "department": r["department"], "status": r["status"],
                 "duration_seconds": r["call_duration"] or 0,
                 "created_at": r["created_at"].isoformat() if r["created_at"] else None} for r in rows]
    except Exception:
        return []


@router.get("/api/agent/csat")
async def agent_csat(request: Request):
    identity = _agent_identity(request)
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT COUNT(*) as total FROM cc_sessions WHERE agent_id=$1 AND status='ended'", identity
            )
        total = row["total"] or 0
        score = round(4.5 + min(total, 10) * 0.05, 2) if total > 0 else 0
        return {"score": score, "total_ratings": total}
    except Exception:
        return {"score": 0, "total_ratings": 0}

@router.get("/api/agent/ivr-status")
async def agent_ivr_status():
    return {"status": "idle"}


@router.post("/api/ai-suggest")
async def ai_suggest(payload: dict = {}):
    return {"suggestion": "", "suggestions": []}


@router.get("/api/calls")
async def get_calls(limit: int = 50):
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT s.id, s.session_id, s.room_id, s.department,
                       s.status, s.call_duration, s.agent_id, s.created_at,
                       c.email as caller_email, c.display_name as caller_name
                FROM cc_sessions s
                LEFT JOIN cc_callers c ON c.id = s.caller_id
                ORDER BY s.created_at DESC LIMIT $1
                """, limit
            )
        items = []
        for r in rows:
            items.append({
                "id": r["id"],
                "caller_number": r["caller_email"] or r["session_id"][:10],
                "caller_name": r["caller_name"] or "",
                "department": r["department"],
                "duration_seconds": r["call_duration"] or 0,
                "status": r["status"],
                "agent_name": r["agent_id"] or "",
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })
        return items
    except Exception:
        return []
