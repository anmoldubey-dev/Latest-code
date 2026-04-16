# =============================================================================
# FILE: session_routes.py
# DESC: REST endpoints for sessions, turns, and HAUP proxy routes.
# =============================================================================
#
# EXECUTION FLOW
# =============================================================================
#
#  +-----------------------------+
#  | api_sessions()              |
#  | * fetch recent sessions     |
#  +-----------------------------+
#           |
#           |----> <pgm> -> get_recent_sessions()
#
#  +-----------------------------+
#  | api_session_detail()        |
#  | * fetch single session      |
#  +-----------------------------+
#           |
#           |----> <pgm> -> get_session_by_id()
#
#  +-----------------------------+
#  | api_turns()                 |
#  | * fetch conversation turns  |
#  +-----------------------------+
#           |
#           |----> _fetch()
#                    |
#                    |----> <_connect> -> execute()
#
#  +-----------------------------+
#  | haup_create_session()       |
#  | * proxy POST to HAUP        |
#  +-----------------------------+
#           |
#           |----> <AsyncClient> -> post()
#
#  +-----------------------------+
#  | haup_ask()                  |
#  | * proxy ask to HAUP session |
#  +-----------------------------+
#           |
#           |----> <AsyncClient> -> post()
#
#  +-----------------------------+
#  | haup_health()               |
#  | * check HAUP service status |
#  +-----------------------------+
#           |
#           |----> <AsyncClient> -> get()
#
# =============================================================================

import asyncio

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.core.state import _m

router = APIRouter()


@router.get("/api/sessions")
async def api_sessions(limit: int = 100):
    pgm = _m.get("pg_memory")
    if not pgm:
        return {"sessions": [], "total": 0}
    records = await asyncio.get_event_loop().run_in_executor(None, pgm.get_recent_sessions, limit)
    return {"sessions": records, "total": len(records)}


@router.get("/api/sessions/{session_id}")
async def api_session_detail(session_id: str):
    pgm = _m.get("pg_memory")
    if not pgm:
        return {"error": "pg_memory unavailable"}
    record = await asyncio.get_event_loop().run_in_executor(None, pgm.get_session_by_id, session_id)
    if record is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    return record


@router.get("/api/turns")
async def api_turns(limit: int = 200):
    pgm = _m.get("pg_memory")
    if not pgm:
        return {"turns": [], "total": 0}

    def _fetch():
        from backend.memory.pg_memory import _connect
        try:
            with _connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """SELECT session_id, role, text, lang, ts
                           FROM conversation_turns
                           ORDER BY ts DESC LIMIT %s""",
                        (limit,),
                    )
                    rows = cur.fetchall()
            return [
                {"session_id": r[0], "role": r[1], "text": r[2],
                 "lang": r[3], "ts": r[4].isoformat() if r[4] else None}
                for r in rows
            ]
        except Exception:
            return []

    turns = await asyncio.get_event_loop().run_in_executor(None, _fetch)
    return {"turns": turns, "total": len(turns)}


@router.get("/api/analytics")
async def api_analytics(days: int = 30):
    pgm = _m.get("pg_memory")
    if not pgm:
        return {
            "kpis": {"total_calls": 0, "avg_duration": 0, "avg_turns": 0, "avg_response_ms": 0},
            "lang_distribution": [], "sentiment_distribution": [],
            "agent_distribution": [], "llm_distribution": [], "daily_volume": [],
        }
    data = await asyncio.get_event_loop().run_in_executor(
        None, pgm.get_analytics_overview, days
    )
    return data


@router.post("/haup/sessions")
async def haup_create_session(request: Request):
    async with httpx.AsyncClient(timeout=5) as c:
        r = await c.post("http://localhost:8088/sessions",
                         content=await request.body(),
                         headers={"Content-Type": "application/json"})
    return JSONResponse(r.json(), status_code=r.status_code)


@router.post("/haup/sessions/{session_id}/ask")
async def haup_ask(session_id: str, request: Request):
    async with httpx.AsyncClient(timeout=600) as c:
        r = await c.post(f"http://localhost:8088/sessions/{session_id}/ask",
                         content=await request.body(),
                         headers={"Content-Type": "application/json"})
    return JSONResponse(r.json(), status_code=r.status_code)


@router.get("/haup/health")
async def haup_health():
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get("http://localhost:8088/health")
        return JSONResponse(r.json(), status_code=r.status_code)
    except Exception:
        return JSONResponse({"status": "offline"}, status_code=503)


# ── Capacity config ───────────────────────────────────────────────────────────

@router.get("/api/config/capacity")
async def get_capacity():
    from backend.routing_ivr.call_queue import get_stats, get_max_calls, _max_per_voice
    import psutil
    cpu  = psutil.cpu_percent(interval=0.2)
    ram  = psutil.virtual_memory()
    stats = get_stats()
    # Recommend max calls based on available RAM (rough: 512MB per call)
    free_mb   = ram.available // (1024 * 1024)
    recommend = max(1, min(20, free_mb // 512))
    return {
        **stats,
        "system": {
            "cpu_pct":      cpu,
            "ram_total_gb": round(ram.total / 1024**3, 1),
            "ram_free_gb":  round(ram.available / 1024**3, 1),
            "ram_pct":      ram.percent,
        },
        "recommended_max": recommend,
    }


@router.post("/api/config/capacity")
async def set_capacity(max_calls: int):
    from backend.routing_ivr.call_queue import set_max_calls
    max_calls = max(1, min(50, max_calls))
    set_max_calls(max_calls)
    return {"ok": True, "max_calls": max_calls}
