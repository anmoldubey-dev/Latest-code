"""
home_routes.py — Stubs for UI_01 routes the frontend calls.
Provides /api/home/stats, /api/home/recent-activity,
/api/ws/events (agent event bus WS),
/api/cc/agent/heartbeat, /api/cc/agent/online.
"""
import asyncio, json, os
import jwt as pyjwt
# [Sentiment] Added Body for ai-suggest payload parsing
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, Body

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
                          COUNT(*) FILTER (WHERE status IN ('ended','completed')) as resolved,
                          COUNT(*) FILTER (WHERE status='escalated') as escalated,
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
            "resolved": summary["resolved"], "escalated": summary["escalated"],
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


# [Sentiment] Replaced empty stub with real ML sentiment analysis via SentimentEngine
@router.post("/api/ai-suggest")
async def ai_suggest(payload: dict = Body({})):
    text = payload.get("text", "").strip()
    if not text:
        return {"sentiment": "NEUTRAL", "score": 0.5, "suggestion": "", "source": "none"}
    from backend.api.sentiment_engine import SentimentEngine
    result = await asyncio.get_event_loop().run_in_executor(
        None, SentimentEngine.get().analyze, text
    )
    return {
        "sentiment":  result["display"],   # "HAPPY" | "ANGRY" | "NEUTRAL"
        "score":      result["score"],
        "suggestion": result["suggestion"],
        "label":      result["label"],
        "source":     result["source"],
    }


_POSITIVE = {"great","thanks","thank","good","excellent","perfect","happy","helpful","awesome","wonderful","resolved","satisfied","appreciate","pleased"}
_NEGATIVE = {"bad","terrible","awful","horrible","angry","frustrated","useless","wrong","broken","issue","problem","error","worst","never","hate","disappointed","rude","slow","unacceptable"}

def _simple_sentiment(text: str) -> str:
    words = set(text.lower().split())
    pos = len(words & _POSITIVE)
    neg = len(words & _NEGATIVE)
    if pos > neg: return "positive"
    if neg > pos: return "negative"
    return "neutral"


_ACTIVE_STATUSES = ('queued', 'connected', 'on_hold', 'conference', 'ringing', 'dialing')
_ENDED_STATUSES  = ('completed', 'ended', 'transferred', 'abandoned', 'cancelled')

def _fmt_session(r) -> dict:
    return {
        "id":             r["id"],
        "caller_number":  r["caller_email"] or (r["session_id"] or "")[:12],
        "caller_name":    r["caller_name"] or "",
        "department":     r["department"] or "General",
        "status":         r["status"],
        "agent_name":     r["agent_id"] or "",
        "duration_seconds": r["call_duration"] or (
            int((r["ended_at"] - r["created_at"]).total_seconds())
            if r["ended_at"] and r["created_at"] else 0
        ),
        "started_at":     r["created_at"].isoformat() if r["created_at"] else None,
        "created_at":     r["created_at"].isoformat() if r["created_at"] else None,
        "ended_at":       r["ended_at"].isoformat() if r["ended_at"] else None,
        "call_type":      "browser",
        "recording_url":     r["recording_url"] or None,       # [Recording] real URL from DB
        "recording_consent": r["recording_consent"] or None,   # [Recording] admitted/denied/None
        "sla_target_seconds": None,
        "sla_breached":   False,
    }

_SELECT_SESSIONS = """
    SELECT s.id, s.session_id, s.department, s.status, s.call_duration,
           s.agent_id, s.created_at, s.ended_at,
           s.recording_url, s.recording_consent,
           c.email as caller_email, c.display_name as caller_name
    FROM cc_sessions s
    LEFT JOIN cc_callers c ON c.id = s.caller_id
"""

@router.get("/api/calls/active")
async def get_active_calls():
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                _SELECT_SESSIONS +
                "WHERE s.status = ANY($1) AND s.ended_at IS NULL "
                "AND s.created_at > NOW() - INTERVAL '4 hours' "
                "ORDER BY s.created_at DESC",
                list(_ACTIVE_STATUSES)
            )
        return [_fmt_session(r) for r in rows]
    except Exception:
        return []


@router.get("/api/calls/history")
async def get_call_history(limit: int = 50):
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                _SELECT_SESSIONS + "WHERE s.status = ANY($1) ORDER BY s.created_at DESC LIMIT $2",
                list(_ENDED_STATUSES), limit
            )
        return [_fmt_session(r) for r in rows]
    except Exception:
        return []


# [Sentiment] Added _generate_call_summary — aggregates transcript sentiment per speaker at call end
async def _generate_call_summary(session_id: str, call_id: int, duration_secs: int):
    """Aggregate all transcript turns for session → compute per-speaker sentiment → save to call_summaries."""
    try:
        import json as _json
        from collections import defaultdict
        from backend.api.callcenter.db import get_pool
        from backend.api.sentiment_engine import SentimentEngine

        pool = await get_pool()
        engine = SentimentEngine.get()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT speaker, text, sentiment FROM transcripts WHERE session_id=$1 ORDER BY created_at ASC",
                session_id
            )

        if not rows:
            return

        speaker_data = defaultdict(lambda: {"turns": [], "sentiments": []})
        for row in rows:
            spk  = row["speaker"] or "unknown"
            sent = row["sentiment"] or "neutral"
            score_f = engine.score_to_float(sent, 0.7 if sent != "neutral" else 0.0)
            speaker_data[spk]["turns"].append(row["text"])
            speaker_data[spk]["sentiments"].append((sent, score_f))

        speakers_json = []
        all_scores    = []

        for spk, data in speaker_data.items():
            sentiments  = data["sentiments"]
            turn_count  = len(sentiments)
            scores      = [s[1] for s in sentiments]
            avg_score   = sum(scores) / len(scores) if scores else 0.0
            labels      = [s[0] for s in sentiments]

            pos_pct = round(100 * labels.count("positive") / turn_count)
            neg_pct = round(100 * labels.count("negative") / turn_count)
            neu_pct = 100 - pos_pct - neg_pct

            if   avg_score >= 0.1:  sent_label = "positive"
            elif avg_score <= -0.1: sent_label = "negative"
            else:                   sent_label = "neutral"

            speakers_json.append({
                "speaker":         spk,
                "turn_count":      turn_count,
                "avg_sentiment":   round(avg_score, 4),
                "sentiment_label": sent_label,
                "positive_pct":    pos_pct,
                "negative_pct":    neg_pct,
                "neutral_pct":     neu_pct,
            })
            all_scores.extend(scores)

        total_avg = sum(all_scores) / len(all_scores) if all_scores else 0.0
        if   total_avg >= 0.1:  overall_label = "positive"
        elif total_avg <= -0.1: overall_label = "negative"
        else:                   overall_label = "neutral"

        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO call_summaries
                   (session_id, call_id, num_speakers, speakers, avg_sentiment,
                    sentiment_label, total_turns, duration_secs)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                   ON CONFLICT DO NOTHING""",
                session_id,
                call_id,
                len(speaker_data),
                _json.dumps(speakers_json),
                round(total_avg, 4),
                overall_label,
                len(rows),
                duration_secs,
            )
        logger.info(
            "[CallSummary] saved for session %s — %d speakers, avg_sentiment=%.3f (%s)",
            session_id, len(speaker_data), total_avg, overall_label,
        )
    except Exception as exc:
        logger.warning("[CallSummary] generation failed for session %s: %s", session_id, exc)


@router.post("/api/calls/{call_id}/end")
async def end_call_by_id(call_id: int):
    try:
        from backend.api.callcenter.db import get_pool
        from datetime import datetime, timezone
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT session_id, created_at FROM cc_sessions WHERE id=$1", call_id
            )
            if row:
                duration = int((datetime.now(timezone.utc) - row["created_at"].replace(tzinfo=timezone.utc)).total_seconds())
                await conn.execute(
                    "UPDATE cc_sessions SET status='ended', ended_at=NOW(), call_duration=$1 WHERE id=$2",
                    duration, call_id
                )
                # [Sentiment] Fire-and-forget: generate call summary after session ends
                asyncio.create_task(
                    _generate_call_summary(row["session_id"], call_id, duration)
                )
            updated = await conn.fetchrow(
                _SELECT_SESSIONS + "WHERE s.id=$1", call_id
            )
        return _fmt_session(updated) if updated else {"status": "ended"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/api/calls/{call_id}/transfer")
async def transfer_call_by_id(call_id: int, payload: dict = {}):
    dept = payload.get("to_department", "General")
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE cc_sessions SET status='transferred', department=$1 WHERE id=$2",
                dept, call_id
            )
            updated = await conn.fetchrow(_SELECT_SESSIONS + "WHERE s.id=$1", call_id)
        return _fmt_session(updated) if updated else {"status": "transferred"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/api/calls/{call_id}/takeover")
async def takeover_call(call_id: int):
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT session_id, room_id FROM cc_sessions WHERE id=$1", call_id)
        if row:
            return {"status": "takeover", "session_id": row["session_id"], "room_id": row["room_id"]}
        return {"status": "not_found"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.delete("/api/calls/{call_id}")
async def delete_call(call_id: int):
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM cc_sessions WHERE id=$1", call_id)
        return {"status": "deleted"}
    except Exception:
        return {"status": "error"}


@router.get("/api/calls/{call_id}/transcript")
async def get_call_transcript(call_id: int):
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS transcripts (
                    id         SERIAL PRIMARY KEY,
                    call_id    INTEGER,
                    session_id VARCHAR(200),
                    speaker    VARCHAR(50),
                    text       TEXT,
                    sentiment  VARCHAR(20) DEFAULT 'neutral',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            # First try direct call_id match
            rows = await conn.fetch(
                """SELECT speaker, text, sentiment, created_at
                   FROM transcripts WHERE call_id=$1 ORDER BY created_at ASC""",
                call_id
            )
            if not rows:
                # Fall back: look up session_id/room_id from cc_sessions then match transcripts.session_id
                sess = await conn.fetchrow(
                    "SELECT session_id, room_id FROM cc_sessions WHERE id=$1", call_id
                )
                if sess:
                    # Transcripts store the LiveKit room name as session_id, so prefer room_id
                    sid = sess["room_id"] or sess["session_id"]
                    rows = await conn.fetch(
                        """SELECT speaker, text, sentiment, created_at
                           FROM transcripts WHERE session_id=$1 ORDER BY created_at ASC""",
                        sid
                    )
        return [
            {"speaker": r["speaker"], "text": r["text"],
             "sentiment": r["sentiment"], "created_at": r["created_at"].isoformat() if r["created_at"] else None}
            for r in rows
        ]
    except Exception:
        return []


@router.post("/api/calls/{call_id}/transcript")
async def add_call_transcript(call_id: int, payload: dict = {}):
    speaker = payload.get("speaker", "agent")
    text = (payload.get("text") or "").strip()
    if not text:
        return {"status": "error", "message": "text required"}
    sentiment = payload.get("sentiment") or _simple_sentiment(text)
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            sess = await conn.fetchrow(
                "SELECT session_id, room_id FROM cc_sessions WHERE id=$1", call_id
            )
            session_id = (sess["session_id"] or sess["room_id"]) if sess else None
            row = await conn.fetchrow(
                """INSERT INTO transcripts (call_id, session_id, speaker, text, sentiment)
                   VALUES ($1, $2, $3, $4, $5)
                   RETURNING speaker, text, sentiment, created_at""",
                call_id, session_id, speaker, text, sentiment
            )
        return {
            "speaker": row["speaker"], "text": row["text"],
            "sentiment": row["sentiment"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/api/calls")
async def get_calls(limit: int = 50):
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Ensure optional recording columns exist before querying them
            await conn.execute("""
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='cc_sessions' AND column_name='recording_url') THEN
                        ALTER TABLE cc_sessions ADD COLUMN recording_url TEXT DEFAULT NULL;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_name='cc_sessions' AND column_name='recording_consent') THEN
                        ALTER TABLE cc_sessions ADD COLUMN recording_consent VARCHAR(10) DEFAULT NULL;
                    END IF;
                END $$;
            """)
            rows = await conn.fetch(
                """
                SELECT s.id, s.session_id, s.room_id, s.department,
                       s.status, s.call_duration, s.agent_id, s.created_at, s.ended_at,
                       s.recording_url, s.recording_consent,
                       c.email as caller_email, c.display_name as caller_name
                FROM cc_sessions s
                LEFT JOIN cc_callers c ON c.id = s.caller_id
                ORDER BY s.created_at DESC LIMIT $1
                """, limit
            )
            # Aggregate per-call sentiment from transcripts table
            session_ids = [r["session_id"] for r in rows if r["session_id"]]
            room_ids    = [r["room_id"] for r in rows if r["room_id"]]
            all_ids     = list(set(session_ids + room_ids))
            sentiment_map: dict = {}
            if all_ids:
                try:
                    t_rows = await conn.fetch(
                        "SELECT session_id, sentiment FROM transcripts WHERE session_id = ANY($1::text[])",
                        all_ids
                    )
                    counts: dict = {}
                    for t in t_rows:
                        sid = t["session_id"]
                        s   = t["sentiment"] or "neutral"
                        counts.setdefault(sid, {"positive": 0, "negative": 0, "neutral": 0})
                        counts[sid][s] = counts[sid].get(s, 0) + 1
                    for sid, c in counts.items():
                        if c["positive"] > c["negative"]:
                            sentiment_map[sid] = "positive"
                        elif c["negative"] > c["positive"]:
                            sentiment_map[sid] = "negative"
                        else:
                            sentiment_map[sid] = "neutral"
                except Exception:
                    pass  # transcripts table may not exist yet

        items = []
        for r in rows:
            sid = r["session_id"] or r["room_id"]
            items.append({
                "id": r["id"],
                "caller_number": r["caller_email"] or (r["session_id"] or "")[:10],
                "caller_name": r["caller_name"] or r["caller_email"] or "",
                "department": r["department"] or "General",
                "duration_seconds": r["call_duration"] or (
                    int((r["ended_at"] - r["created_at"]).total_seconds())
                    if r["ended_at"] and r["created_at"] else 0
                ),
                "status": r["status"],
                "agent_name": r["agent_id"] or "",
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "ended_at": r["ended_at"].isoformat() if r["ended_at"] else None,
                "sentiment": sentiment_map.get(sid) or sentiment_map.get(r["room_id"]) or None,
                "recording_url": r["recording_url"] or None,
            })
        return items
    except Exception as e:
        import logging
        logging.getLogger("home_routes").error("/api/calls error: %s", e)
        return []


# ── Admin endpoints ──────────────────────────────────────────────────────────

@router.get("/api/admin/stats")
async def admin_stats():
    try:
        import psycopg2
        DB_URL = os.getenv("DATABASE_URL",
            "postgresql://neondb_owner:npg_4U3AtckjizXN@ep-shiny-glitter-a1t4vbtj.ap-southeast-1.aws.neon.tech/Srcom-soft?sslmode=require")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM users")
        total_users = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM users WHERE is_active = TRUE")
        active_users = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM users WHERE role = 'agent'")
        total_agents = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM cc_sessions")
        total_calls = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM cc_sessions WHERE status IN ('connected','on_hold','conference','queued','ringing')")
        active_calls = cur.fetchone()[0]
        conn.close()
        return {
            "total_users": total_users,
            "active_users": active_users,
            "inactive_users": total_users - active_users,
            "total_agents": total_agents,
            "total_calls": total_calls,
            "active_calls": active_calls,
        }
    except Exception as e:
        return {"total_users": 0, "active_users": 0, "inactive_users": 0,
                "total_agents": 0, "total_calls": 0, "active_calls": 0}


@router.get("/api/admin/users")
async def admin_users():
    try:
        import psycopg2
        DB_URL = os.getenv("DATABASE_URL",
            "postgresql://neondb_owner:npg_4U3AtckjizXN@ep-shiny-glitter-a1t4vbtj.ap-southeast-1.aws.neon.tech/Srcom-soft?sslmode=require")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT id, name, email, role, is_active, phone_number, created_at
            FROM users ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        cols = [d[0] for d in cur.description]
        conn.close()
        result = []
        for row in rows:
            d = dict(zip(cols, row))
            d["created_at"] = d["created_at"].isoformat() if d.get("created_at") else None
            d["credits"] = 0
            result.append(d)
        return result
    except Exception as e:
        return []


@router.put("/api/admin/users/{user_id}/status")
async def admin_toggle_user_status(user_id: int):
    try:
        import psycopg2
        DB_URL = os.getenv("DATABASE_URL",
            "postgresql://neondb_owner:npg_4U3AtckjizXN@ep-shiny-glitter-a1t4vbtj.ap-southeast-1.aws.neon.tech/Srcom-soft?sslmode=require")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("UPDATE users SET is_active = NOT is_active WHERE id = %s RETURNING is_active", (user_id,))
        row = cur.fetchone()
        conn.commit(); conn.close()
        return {"is_active": row[0] if row else False}
    except Exception as e:
        return {"error": str(e)}


@router.put("/api/admin/users/{user_id}/role")
async def admin_change_user_role(user_id: int, payload: dict = {}):
    role = payload.get("role", "user")
    try:
        import psycopg2
        DB_URL = os.getenv("DATABASE_URL",
            "postgresql://neondb_owner:npg_4U3AtckjizXN@ep-shiny-glitter-a1t4vbtj.ap-southeast-1.aws.neon.tech/Srcom-soft?sslmode=require")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("UPDATE users SET role = %s WHERE id = %s RETURNING role", (role, user_id))
        row = cur.fetchone()
        conn.commit(); conn.close()
        return {"role": row[0] if row else role}
    except Exception as e:
        return {"error": str(e)}


@router.put("/api/admin/users/{user_id}/credits")
async def admin_add_credits(user_id: int, payload: dict = {}):
    return {"status": "ok", "credits": payload.get("amount", 0)}
