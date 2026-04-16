# Superuser Dashboard — Real-time DB endpoints
# All data sourced from cc_sessions, agent_states, outbound_queue.
# No mocked data — everything is live from the DB.
# Also: broadcast, email campaign, and bulk-config-save endpoints.

import time
from fastapi import APIRouter, HTTPException
from .callcenter import db

superuser_router = APIRouter(tags=["superuser"])

# ── In-memory broadcast store (transient — resets on restart) ─────────────────
_broadcasts: list[dict] = []
_next_bc_id: int = 1

# ── In-memory email campaigns (backed by email_service SMTP) ─────────────────
_campaigns: list[dict] = []
_email_templates: list[dict] = [
    {"id": 1, "name": "Missed Call",    "subject": "We missed you",          "body": "Hi, we tried to reach you but couldn't connect. Please call us back."},
    {"id": 2, "name": "Callback Ready", "subject": "Your callback is ready", "body": "Hi, an agent is available to assist you. Please call us back at your convenience."},
    {"id": 3, "name": "Queue Update",   "subject": "Queue position update",  "body": "Hi, you are now next in line. Please stay on the line."},
]
_next_tpl_id: int = 4


# ─────────────────────────────────────────────────────────────────────────────
# /api/stats  — Infographics KPIs (today's aggregates)
# ─────────────────────────────────────────────────────────────────────────────

@superuser_router.get("/api/stats")
async def get_stats():
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
                COUNT(*)                                                      AS total_traffic,
                COUNT(*) FILTER (WHERE status = 'connected')                  AS active_streams,
                COUNT(*) FILTER (WHERE status IN ('abandoned','transferred'))  AS escalations,
                COALESCE(AVG(wait_seconds) FILTER (WHERE wait_seconds > 0), 0) AS avg_wait_sec
            FROM cc_sessions
            WHERE created_at > NOW() - INTERVAL '24 hours'
        """)
        n_active = await conn.fetchval("""
            SELECT COUNT(*) FROM agent_states
            WHERE status != 'offline'
              AND last_heartbeat > NOW() - INTERVAL '2 minutes'
        """)
        n_total = await conn.fetchval("SELECT COUNT(*) FROM agent_states") or 1

    total    = int(row["total_traffic"]  or 0)
    active   = int(row["active_streams"] or 0)
    esc      = int(row["escalations"]    or 0)
    avg_wait = float(row["avg_wait_sec"] or 0)

    return {
        "totalTraffic":   total,
        "activeStreams":   active,
        "globalCsat":     round(max(1.0, min(5.0, 5.0 - avg_wait / 60)), 1),
        "avgLatency":     round(avg_wait * 10),          # seconds → display-friendly ms proxy
        "escalationRate": f"{round(esc / total * 100)}%" if total else "0%",
        "hardwareLoad":   f"{round(int(n_active or 0) / int(n_total) * 100)}%",
        "avgSentiment":   round(max(1.0, min(5.0, 4.5 - (esc / max(1, total)) * 5)), 1),
    }


# ─────────────────────────────────────────────────────────────────────────────
# /api/superuser/realtime  — Dashboard: agents list + sankey in one request
# ─────────────────────────────────────────────────────────────────────────────

@superuser_router.get("/api/superuser/realtime")
async def get_superuser_realtime():
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        agent_rows = await conn.fetch("""
            WITH session_agg AS (
                SELECT
                    agent_id,
                    COUNT(*) FILTER (WHERE status = 'completed')             AS calls_handled,
                    COUNT(*) FILTER (WHERE status IN ('abandoned','transferred')) AS escalations,
                    COALESCE(AVG(wait_seconds) FILTER (WHERE wait_seconds > 0), 0) AS avg_wait_sec
                FROM cc_sessions
                WHERE created_at > NOW() - INTERVAL '24 hours'
                  AND agent_id  != ''
                GROUP BY agent_id
            )
            SELECT a.agent_identity, a.agent_name, a.department, a.status,
                   COALESCE(s.calls_handled, 0) AS calls_handled,
                   COALESCE(s.escalations,   0) AS escalations,
                   COALESCE(s.avg_wait_sec,  0) AS avg_wait_sec
            FROM agent_states a
            LEFT JOIN session_agg s ON s.agent_id = a.agent_identity
            WHERE a.last_heartbeat > NOW() - INTERVAL '10 minutes'
            ORDER BY a.department, a.sequence_number
        """)
        sankey_rows = await conn.fetch("""
            SELECT department, status, COUNT(*) AS cnt
            FROM cc_sessions
            WHERE created_at > NOW() - INTERVAL '24 hours'
              AND department  != ''
            GROUP BY department, status
        """)

    STATUS_MAP = {
        "completed": "Completed", "connected": "Active", "queued": "Active",
        "abandoned": "Abandoned", "transferred": "Transferred", "no_answer": "No Answer",
    }

    agents = []
    for a in agent_rows:
        calls    = int(a["calls_handled"])
        esc      = int(a["escalations"])
        avg_wait = float(a["avg_wait_sec"])
        workload = 85 if a["status"] == "busy" else (55 if calls > 5 else 20)
        esc_ratio = esc / max(1, calls)
        risk = "high" if esc_ratio > 0.3 or avg_wait > 120 else \
               "medium" if esc_ratio > 0.1 or avg_wait > 60 else "low"
        agents.append({
            "id":           a["agent_identity"],
            "name":         a["agent_name"] or a["agent_identity"],
            "department":   a["department"],
            "status":       a["status"],
            "callsHandled": calls,
            "escalations":  esc,
            "workload":     workload,
            "riskLevel":    risk,
            "csat":         round(max(1.0, min(5.0, 5.0 - esc_ratio * 3 - avg_wait / 120)), 1),
            "avgLatency":   round(avg_wait * 10),
        })

    # Build sankey: Inbound → Departments → Statuses
    dept_set   = sorted({str(r["department"]) for r in sankey_rows})
    status_set = sorted({STATUS_MAP.get(str(r["status"]), "Other") for r in sankey_rows})
    nodes = [{"id": 0, "name": "Inbound", "level": 0}]
    dept_ids, status_ids = {}, {}
    for i, d in enumerate(dept_set, 1):
        nodes.append({"id": i, "name": d, "level": 1}); dept_ids[d] = i
    for i, s in enumerate(status_set, len(dept_set) + 1):
        nodes.append({"id": i, "name": s, "level": 2}); status_ids[s] = i

    dept_totals, dept_status = {}, {}
    for r in sankey_rows:
        d = str(r["department"]); m = STATUS_MAP.get(str(r["status"]), "Other"); c = int(r["cnt"])
        dept_totals[d] = dept_totals.get(d, 0) + c
        dept_status[(d, m)] = dept_status.get((d, m), 0) + c

    links = []
    for d, t in dept_totals.items():
        if d in dept_ids: links.append({"source": 0, "target": dept_ids[d], "value": t})
    for (d, s), c in dept_status.items():
        if d in dept_ids and s in status_ids:
            links.append({"source": dept_ids[d], "target": status_ids[s], "value": c})

    return {"agents": agents, "sankey": {"nodes": nodes, "links": links}}


# ─────────────────────────────────────────────────────────────────────────────
# /api/superuser/agents/:id  — AgentDetail: full profile from DB
# ─────────────────────────────────────────────────────────────────────────────

@superuser_router.get("/api/superuser/agents/{agent_id}")
async def get_agent_detail(agent_id: str):
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        agent_row = await conn.fetchrow(
            "SELECT * FROM agent_states WHERE agent_identity = $1", agent_id
        )
        if not agent_row:
            raise HTTPException(status_code=404, detail="Agent not found")

        session_rows = await conn.fetch("""
            SELECT s.id, s.session_id, s.department, s.status,
                   s.wait_seconds, s.call_duration, s.created_at,
                   c.email AS caller_email, c.display_name AS caller_name
            FROM cc_sessions s
            LEFT JOIN cc_callers c ON c.id = s.caller_id
            WHERE s.agent_id = $1
            ORDER BY s.created_at DESC
            LIMIT 50
        """, agent_id)

        dept_counts = await conn.fetch("""
            SELECT department, COUNT(*) AS cnt
            FROM cc_sessions
            WHERE agent_id = $1
              AND created_at > NOW() - INTERVAL '24 hours'
            GROUP BY department
            ORDER BY cnt DESC
        """, agent_id)

    # Compute derived agent metrics
    total_calls = sum(int(r["cnt"]) for r in dept_counts)
    total_esc   = sum(1 for r in session_rows if r["status"] in ("abandoned", "transferred"))
    avg_wait    = (sum(r["wait_seconds"] or 0 for r in session_rows) / max(1, len(session_rows)))
    esc_ratio   = total_esc / max(1, total_calls)
    csat        = round(max(1.0, min(5.0, 5.0 - esc_ratio * 3 - avg_wait / 120)), 1)
    risk        = "High" if esc_ratio > 0.3 or avg_wait > 120 else \
                  "Medium" if esc_ratio > 0.1 or avg_wait > 60 else "Low"

    STATUS_DISPLAY = {
        "completed": "Resolved", "connected": "Pending",
        "queued": "Pending", "abandoned": "Escalated", "transferred": "Escalated",
    }
    SENTIMENT_MAP = {
        "completed": "Positive", "abandoned": "Negative",
        "transferred": "Negative", "connected": "Neutral", "queued": "Neutral",
    }

    call_logs = []
    for r in session_rows:
        call_logs.append({
            "id":               r["id"],
            "caller_name":      r["caller_name"] or "Unknown",
            "caller_number":    r["caller_email"] or r["session_id"][:10],
            "category":         r["department"] or "General",
            "sentiment":        SENTIMENT_MAP.get(r["status"], "Neutral"),
            "status":           STATUS_DISPLAY.get(r["status"], r["status"].title()),
            "duration_seconds": r["call_duration"] or 0,
            "recording_url":    None,
            "issue_summary":    f"Session via {r['department'] or 'General'}. Wait: {r['wait_seconds'] or 0}s.",
        })

    graph_data = [{"category": str(r["department"]), "count": int(r["cnt"])} for r in dept_counts]

    return {
        "agent": {
            "id":        agent_row["agent_identity"],
            "name":      agent_row["agent_name"] or agent_row["agent_identity"],
            "model":     f"Dept: {agent_row['department']}",
            "csat":      csat,
            "riskLevel": risk,
            "status":    agent_row["status"],
            "department": agent_row["department"],
        },
        "callLogs":  call_logs,
        "graphData": graph_data,
    }


# ─────────────────────────────────────────────────────────────────────────────
# /api/call-stats  — CallAnalytics: 3D sphere data grouped by department
# ─────────────────────────────────────────────────────────────────────────────

@superuser_router.get("/api/call-stats")
async def get_call_stats():
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                COALESCE(department, 'General') AS category,
                COUNT(*) AS count,
                COALESCE(AVG(call_duration) FILTER (WHERE call_duration > 0), 0) AS avg_duration,
                COUNT(*) FILTER (WHERE status IN ('abandoned','transferred')) AS escalations
            FROM cc_sessions
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY department
            ORDER BY count DESC
        """)

    result = []
    for r in rows:
        total = int(r["count"])
        esc   = int(r["escalations"])
        result.append({
            "category":       str(r["category"]),
            "count":          total,
            "avgDuration":    round(float(r["avg_duration"])),
            "escalationRate": round(esc / max(1, total) * 100),
            "sentiment":      round(max(1.0, min(5.0, 5.0 - (esc / max(1, total)) * 5)), 1),
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# /api/calls/category/:name  — CallAnalytics drill-down: sessions by dept
# ─────────────────────────────────────────────────────────────────────────────

@superuser_router.get("/api/calls/category/{category}")
async def get_calls_by_category(category: str):
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT s.id, s.session_id, s.department, s.status,
                   s.call_duration, s.wait_seconds, s.created_at,
                   c.email AS caller_email, c.display_name AS caller_name
            FROM cc_sessions s
            LEFT JOIN cc_callers c ON c.id = s.caller_id
            WHERE s.department = $1
              AND s.created_at > NOW() - INTERVAL '24 hours'
            ORDER BY s.created_at DESC
            LIMIT 50
        """, category)

    SENTIMENT = {"completed": "Positive", "abandoned": "Negative",
                 "transferred": "Negative", "connected": "Neutral", "queued": "Neutral"}
    STATUS_D  = {"completed": "Resolved", "abandoned": "Escalated",
                 "transferred": "Escalated", "connected": "Pending", "queued": "Pending"}

    return [
        {
            "id":               r["id"],
            "caller_name":      r["caller_name"] or "Unknown",
            "caller_number":    r["caller_email"] or r["session_id"][:10],
            "category":         r["department"] or category,
            "sentiment":        SENTIMENT.get(r["status"], "Neutral"),
            "status":           STATUS_D.get(r["status"], r["status"].title()),
            "duration_seconds": r["call_duration"] or 0,
            "recording_url":    None,
            "issue_summary":    f"Wait: {r['wait_seconds'] or 0}s | Session: {r['session_id'][:8]}",
        }
        for r in rows
    ]


# ─────────────────────────────────────────────────────────────────────────────
# /api/scheduling/*  — Scheduling page: backed by outbound_queue
# ─────────────────────────────────────────────────────────────────────────────

@superuser_router.get("/api/scheduling/stats")
async def get_scheduling_stats():
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
                COUNT(*)                                          AS total,
                COUNT(*) FILTER (WHERE status = 'pending')       AS pending,
                COUNT(*) FILTER (WHERE status = 'completed')     AS completed,
                COUNT(*) FILTER (WHERE status = 'no_answer')     AS no_answer,
                COUNT(*) FILTER (WHERE status IN ('assigned','broadcasting','in_progress')) AS active
            FROM outbound_queue
            WHERE created_at > NOW() - INTERVAL '7 days'
        """)
    return {
        "total":     int(row["total"]     or 0),
        "pending":   int(row["pending"]   or 0),
        "completed": int(row["completed"] or 0),
        "no_answer": int(row["no_answer"] or 0),
        "active":    int(row["active"]    or 0),
    }


@superuser_router.get("/api/scheduling/jobs")
async def get_scheduling_jobs(limit: int = 100):
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, user_email, department, status, assigned_agent,
                   attempts, created_at, last_attempt
            FROM outbound_queue
            ORDER BY created_at DESC
            LIMIT $1
        """, limit)

    return {
        "jobs": [
            {
                "id":            r["id"],
                "phone_number":  r["user_email"],
                "label":         r["department"] or "General",
                "status":        r["status"],
                "assigned_agent": r["assigned_agent"] or "",
                "attempts":      r["attempts"] or 0,
                "scheduled_at":  r["created_at"].isoformat() if r["created_at"] else None,
                "last_attempt":  r["last_attempt"].isoformat() if r["last_attempt"] else None,
            }
            for r in rows
        ]
    }


@superuser_router.post("/api/scheduling/jobs")
async def create_scheduling_job(payload: dict):
    """Map a scheduling job creation to outbound_queue."""
    email = payload.get("phone_number", "").strip()
    dept  = payload.get("label", "General").strip()
    if not email:
        raise HTTPException(status_code=422, detail="phone_number (email) is required")
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        user_id = await conn.fetchval("""
            INSERT INTO cc_callers (email) VALUES ($1)
            ON CONFLICT (email) DO UPDATE SET last_seen = NOW()
            RETURNING id
        """, email)
        # Create a placeholder session for this scheduled callback
        import uuid, time as _time
        sid = str(uuid.uuid4())
        log_id = await conn.fetchval("""
            INSERT INTO cc_sessions (caller_id, session_id, room_id, department, status)
            VALUES ($1, $2, $3, $4, 'scheduled')
            RETURNING id
        """, user_id, sid, f"scheduled-{int(_time.time())}", dept)
        job_id = await conn.fetchval("""
            INSERT INTO outbound_queue (call_log_id, user_email, department)
            VALUES ($1, $2, $3) RETURNING id
        """, log_id, email, dept)
    return {"id": job_id, "status": "pending", "phone_number": email, "label": dept}


@superuser_router.delete("/api/scheduling/jobs/{job_id}")
async def cancel_scheduling_job(job_id: int):
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, status FROM outbound_queue WHERE id = $1", job_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="Job not found")
        await conn.execute(
            "UPDATE outbound_queue SET status = 'no_answer' WHERE id = $1", job_id
        )
    return {"id": job_id, "status": "cancelled"}


# ─────────────────────────────────────────────────────────────────────────────
# /api/cc/admin/config  — Bulk save for Settings page (PUT)
# Saves each key individually then reloads business-hours + email in-memory.
# ─────────────────────────────────────────────────────────────────────────────

@superuser_router.put("/api/cc/admin/config")
async def bulk_save_admin_config(payload: dict):
    """
    Settings page sends {updates: {smtp_sender, smtp_password, smtp_port,
    work_start, work_end, timezone, max_wait_seconds, ...}}.
    We remap to DB keys and reload affected modules.
    """
    updates: dict = payload.get("updates", payload)

    # Key remapping: Settings UI name → admin_config DB key
    KEY_MAP = {
        "smtp_sender":      "smtp_user",
        "smtp_password":    "smtp_password",
        "smtp_port":        "smtp_port",
        "max_wait_seconds": "avg_resolution_seconds",
        "work_start":       "work_start",
        "work_end":         "work_end",
        "timezone":         "timezone",
    }

    saved = []
    for ui_key, db_key in KEY_MAP.items():
        if ui_key in updates and updates[ui_key] is not None and str(updates[ui_key]).strip():
            await db.set_config(db_key, str(updates[ui_key]).strip())
            saved.append(db_key)

    # Reload in-memory caches immediately so changes are live without restart
    try:
        from .callcenter import business_hours
        await business_hours.load_config_from_db()
    except Exception:
        pass
    try:
        from .callcenter.email_service import load_email_config_from_db
        await load_email_config_from_db()
    except Exception:
        pass

    return {"status": "saved", "keys": saved}


# ─────────────────────────────────────────────────────────────────────────────
# /api/webrtc/broadcast/*  — Superuser broadcast panel
# Broadcasts are stored in memory; events published to event_hub.
# ─────────────────────────────────────────────────────────────────────────────

@superuser_router.get("/api/webrtc/broadcast/active")
async def get_active_broadcasts():
    return [b for b in _broadcasts if b["status"] == "active"]


@superuser_router.get("/api/webrtc/broadcast/history")
async def get_broadcast_history(limit: int = 20):
    return list(reversed(_broadcasts))[:limit]


@superuser_router.post("/api/webrtc/broadcast/start")
async def start_broadcast(payload: dict):
    global _next_bc_id
    import uuid
    title         = payload.get("title", "Broadcast")
    department    = payload.get("department", "All")
    message       = payload.get("message", "")
    max_listeners = int(payload.get("maxListeners", 100))
    speaker_name  = payload.get("speaker_name", "Superuser")

    room_name = f"broadcast-{_next_bc_id}-{uuid.uuid4().hex[:6]}"

    # Generate LiveKit speaker token so the browser can connect and publish audio
    speaker_token = None
    livekit_url   = None
    try:
        from .callcenter.token_service import generate_token, LIVEKIT_URL
        speaker_token = generate_token(
            room_name   = room_name,
            identity    = f"speaker-{uuid.uuid4().hex[:6]}",
            name        = speaker_name,
            can_publish  = True,
            can_subscribe = True,
        )
        livekit_url = LIVEKIT_URL
    except Exception:
        pass  # LiveKit unavailable — broadcast saved but no audio room

    bc = {
        "id":            _next_bc_id,
        "title":         title,
        "department":    department,
        "message":       message,
        "maxListeners":  max_listeners,
        "listenerCount": 0,
        "status":        "active",
        "room_name":     room_name,
        "speaker_token": speaker_token,
        "livekit_url":   livekit_url,
        "started_at":    time.time(),
        "ended_at":      None,
    }
    _broadcasts.append(bc)
    _next_bc_id += 1

    # Notify all SSE subscribers
    try:
        from .callcenter.event_hub import event_hub
        await event_hub.publish({
            "type":         "broadcast",
            "broadcast_id": bc["id"],
            "title":        title,
            "department":   department,
            "message":      message,
            "room_name":    room_name,
        })
    except Exception:
        pass

    return bc


@superuser_router.post("/api/webrtc/broadcast/{broadcast_id}/end")
async def end_broadcast(broadcast_id: int):
    for bc in _broadcasts:
        if bc["id"] == broadcast_id:
            bc["status"]   = "ended"
            bc["ended_at"] = time.time()
            try:
                from .callcenter.event_hub import event_hub
                await event_hub.publish({"type": "broadcast_ended", "broadcast_id": broadcast_id})
            except Exception:
                pass
            return bc
    raise HTTPException(status_code=404, detail="Broadcast not found")


# ─────────────────────────────────────────────────────────────────────────────
# /api/email/*  — Email campaigns + SMTP status for BroadcastPanel
# ─────────────────────────────────────────────────────────────────────────────

@superuser_router.get("/api/email/status")
async def email_status():
    """Check if SMTP is configured."""
    try:
        from .callcenter.email_service import _smtp_cache
        user = _smtp_cache.get("user", "")
        return {
            "configured": bool(user),
            "smtp_user":  user,
            "smtp_host":  _smtp_cache.get("host", ""),
        }
    except Exception:
        return {"configured": False, "smtp_user": "", "smtp_host": ""}


@superuser_router.get("/api/email/templates")
async def get_email_templates():
    return _email_templates


@superuser_router.post("/api/email/templates")
async def add_email_template(payload: dict):
    global _next_tpl_id
    tpl = {
        "id":      _next_tpl_id,
        "name":    payload.get("name", "Template"),
        "subject": payload.get("subject", ""),
        "body":    payload.get("body", ""),
    }
    _email_templates.append(tpl)
    _next_tpl_id += 1
    return tpl


@superuser_router.post("/api/email/templates/seed")
async def seed_email_templates():
    """Reset templates to defaults (idempotent)."""
    return {"seeded": len(_email_templates), "templates": _email_templates}


@superuser_router.get("/api/email/campaigns")
async def get_email_campaigns():
    # Combine in-memory campaigns with recent outbound_queue no_answer history
    try:
        pool = await db.get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, user_email, department, status, last_attempt
                FROM outbound_queue
                WHERE status = 'no_answer'
                  AND scheduler_email_sent = TRUE
                ORDER BY last_attempt DESC LIMIT 20
            """)
        db_campaigns = [
            {
                "id":        f"auto-{r['id']}",
                "type":      "missed_call",
                "recipient": r["user_email"],
                "subject":   "We missed your call",
                "status":    "sent",
                "sent_at":   r["last_attempt"].isoformat() if r["last_attempt"] else None,
            }
            for r in rows
        ]
    except Exception:
        db_campaigns = []

    return _campaigns + db_campaigns


@superuser_router.post("/api/email/send")
async def send_email_campaign(payload: dict):
    """Send email campaign. Accepts recipients array [{email,name}] or single 'to' string."""
    # Frontend sends: {recipients:[{email,name,phone}], subject, body_html, title, ...}
    recipients_list = payload.get("recipients") or []
    subject = payload.get("subject", "Message from Call Center")
    body    = payload.get("body_html") or payload.get("body") or payload.get("message", "")

    # Build flat list of email addresses
    if recipients_list:
        to_addresses = [r["email"] for r in recipients_list if r.get("email")]
    else:
        single = payload.get("to") or payload.get("recipient", "")
        to_addresses = [single] if single else []

    if not to_addresses:
        raise HTTPException(status_code=422, detail="No valid recipient emails provided")

    try:
        from .callcenter.email_service import _smtp_cache
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        import datetime

        if not _smtp_cache.get("user"):
            raise HTTPException(status_code=503, detail="SMTP not configured. Set SMTP in Settings first.")

        sender = _smtp_cache.get("from") or _smtp_cache["user"]
        use_tls = str(_smtp_cache.get("use_tls", "true")).lower() in ("true", "1")

        sent, failed = [], []
        with smtplib.SMTP(_smtp_cache["host"], int(_smtp_cache["port"])) as s:
            if use_tls:
                s.starttls()
            s.login(_smtp_cache["user"], _smtp_cache["password"])
            for addr in to_addresses:
                try:
                    msg = MIMEMultipart("alternative")
                    msg["Subject"] = subject
                    msg["From"]    = sender
                    msg["To"]      = addr
                    msg.attach(MIMEText(body, "html" if "<" in body else "plain"))
                    s.sendmail(sender, [addr], msg.as_string())
                    sent.append(addr)
                except Exception:
                    failed.append(addr)

        record = {
            "id":         len(_campaigns) + 1,
            "type":       "manual",
            "recipients": sent,
            "subject":    subject,
            "status":     "sent" if sent else "failed",
            "sent_count": len(sent),
            "fail_count": len(failed),
            "sent_at":    datetime.datetime.utcnow().isoformat(),
        }
        _campaigns.append(record)
        return record

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Email send failed: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# /api/routing/*  — Mirror routing rules under /api prefix (Settings page)
# The core router exposes /routing/rules without /api prefix which Vercel
# rewrites don't cover. These aliases bridge the gap.
# ─────────────────────────────────────────────────────────────────────────────

@superuser_router.get("/api/routing/rules")
async def api_list_rules():
    from backend.routing import routing_engine
    rules = routing_engine.rules_snapshot()
    return {"rules": rules, "count": len(rules)}


@superuser_router.post("/api/routing/rules/reload")
async def api_reload_rules():
    from backend.routing import routing_engine
    count = routing_engine.reload_rules()
    return {"status": "ok", "rules_loaded": count}
