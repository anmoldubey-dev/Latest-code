# Call Center API Router — /cc/* endpoints
# Adapted from Routing/livekit/callcenter/api.py
# Key changes:
#   - token_service imported from local .token_service
#   - event_hub imported from local .event_hub
#   - livekit.websocket references replaced with local event_hub

import os
import time
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from . import db
from . import queue_engine
from . import business_hours
from .email_service import send_outbound_no_answer_email
from .event_hub import event_hub
from .token_service import generate_token, LIVEKIT_URL

logger    = logging.getLogger("callcenter.api")
cc_router = APIRouter(prefix="/cc", tags=["callcenter"])


# ═══════════════════════════════════════════════════════════════════════════════
# Request / Response Models
# ═══════════════════════════════════════════════════════════════════════════════

class AuthRequest(BaseModel):
    email: str

class CallRequest(BaseModel):
    email: str
    department:    str  = "General Support"
    skip_outbound: bool = False

class AgentOnlineRequest(BaseModel):
    agent_identity: str
    agent_name:     str
    department:     str

class AgentOfflineRequest(BaseModel):
    agent_identity: str

class AgentEndCallRequest(BaseModel):
    agent_identity: str
    session_id:     Optional[str] = None

class OutboundAcceptRequest(BaseModel):
    outbound_id:    int
    agent_identity: str

class OutboundCompleteRequest(BaseModel):
    outbound_id:    int
    agent_identity: str

class OutboundNoAnswerRequest(BaseModel):
    outbound_id:    int
    user_email:     str
    department:     str
    agent_identity: str

class OutboundUserRejectRequest(BaseModel):
    user_email:     str
    department:     str

class OutboundDeclineRequest(BaseModel):
    outbound_id:    int
    agent_identity: str
    reason:         str = ""
    snooze_minutes: int = 10

class OutboundResumeRequest(BaseModel):
    agent_identity: str

class HolidayRequest(BaseModel):
    message: str
    until:   str   # ISO datetime string

class AdminConfigRequest(BaseModel):
    key:   str
    value: str

class BusinessHoursRequest(BaseModel):
    work_start:             str       # "HH:MM"
    work_end:               str       # "HH:MM"
    work_days:              str       # comma-separated ints "0,1,2,3,4,5"
    timezone:               str = "Asia/Kolkata"
    avg_resolution_seconds: int = 300

class EmailConfigRequest(BaseModel):
    smtp_host:     str  = "smtp.gmail.com"
    smtp_port:     int  = 587
    smtp_user:     str
    smtp_password: str
    smtp_from:     str  = ""
    smtp_use_tls:  bool = True


# ═══════════════════════════════════════════════════════════════════════════════
# Caller auth (email-only — no password, just register/lookup)
# ═══════════════════════════════════════════════════════════════════════════════

@cc_router.post("/auth")
async def auth_user(req: AuthRequest):
    normalized = req.email.strip().lower()
    user_id    = await db.upsert_user(normalized)
    user       = await db.get_user_by_email(normalized)
    return {
        "user_id":      user_id,
        "email":        user["email"],
        "display_name": user.get("display_name", ""),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Caller entry
# ═══════════════════════════════════════════════════════════════════════════════

@cc_router.post("/call")
async def start_call(req: CallRequest):
    # 1. Business hours check
    if business_hours.should_reject_call():
        offline_msg = business_hours.get_offline_tts_message()
        status      = business_hours.get_status()
        return {
            "rejected":        True,
            "offline_message": offline_msg,
            "work_days_names": status.get("work_days_names", []),
            "work_start":      status.get("work_start", ""),
            "work_end":        status.get("work_end", ""),
        }

    normalized = req.email.strip().lower()

    # 2. Upsert caller
    user_id = await db.upsert_user(normalized)

    # 3. Generate IDs + token
    session_id      = str(uuid.uuid4())
    room_id         = f"call-{int(time.time())}-{uuid.uuid4().hex[:8]}"
    caller_identity = f"caller-{uuid.uuid4().hex[:8]}"

    token = generate_token(
        room_name     = room_id,
        identity      = caller_identity,
        name          = f"Caller ({normalized.split('@')[0][:12]})",
        can_publish   = True,
        can_subscribe = True,
    )

    # 4. Pre-calculate queue position
    queue_engine._ensure_dept(req.department)
    position = len(queue_engine._department_queues[req.department]) + 1

    # 5. Persist cc_sessions row
    call_log_id = await db.create_call_log(
        user_id        = user_id,
        session_id     = session_id,
        room_id        = room_id,
        department     = req.department,
        queue_position = position,
    )

    # 6. Enqueue
    queue_info = await queue_engine.enqueue_caller(
        session_id    = session_id,
        room_id       = room_id,
        caller_id     = caller_identity,
        user_email    = normalized,
        department    = req.department,
        user_id       = user_id,
        call_log_id   = call_log_id,
        skip_outbound = req.skip_outbound,
    )

    return {
        "rejected":         False,
        "token":            token,
        "url":              LIVEKIT_URL,
        "room":             room_id,
        "session_id":       session_id,
        "caller_identity":  caller_identity,
        "queue_position":   queue_info["position"],
        "wait_seconds":     queue_info["wait_seconds"],
        "wait_message":     queue_info["wait_message"],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Caller disconnect
# ═══════════════════════════════════════════════════════════════════════════════

@cc_router.delete("/call/{session_id}")
async def disconnect_call(session_id: str):
    removed = await queue_engine.dequeue_caller(session_id, reason="abandoned")
    if removed:
        return {"removed": True,  "session_id": session_id}
    return      {"removed": False, "session_id": session_id}


# ═══════════════════════════════════════════════════════════════════════════════
# Queue info
# ═══════════════════════════════════════════════════════════════════════════════

@cc_router.get("/queue")
async def get_queue(department: str = Query("")):
    if department:
        callers = await queue_engine.get_queue_for_department(department)
        return {
            "department":          department,
            "queue_depth":         len(callers),
            "callers":             callers,
            "wait_per_caller_sec": queue_engine._WAIT_PER_CALLER_SEC,
        }
    return await queue_engine.get_all_queues()


@cc_router.get("/queue/all")
async def get_all_queues():
    return await queue_engine.get_all_queues()


# ═══════════════════════════════════════════════════════════════════════════════
# Agent operations
# ═══════════════════════════════════════════════════════════════════════════════

@cc_router.post("/agent/online")
async def agent_go_online(req: AgentOnlineRequest):
    agent = await db.upsert_agent_state(
        agent_identity = req.agent_identity,
        agent_name     = req.agent_name,
        department     = req.department,
        status         = "online",
    )
    return {
        "agent_identity": agent["agent_identity"],
        "agent_name":     agent["agent_name"],
        "department":     agent["department"],
        "sequence_number":agent["sequence_number"],
        "status":         agent["status"],
    }


@cc_router.post("/agent/offline")
async def agent_go_offline(req: AgentOfflineRequest):
    await db.set_agent_offline(req.agent_identity)
    return {"status": "offline", "agent_identity": req.agent_identity}


@cc_router.get("/agent/department/{department:path}")
async def get_department_agents(department: str):
    agents = await db.get_agents_in_department(department)
    return {
        "department": department,
        "agents": [
            {
                "agent_identity":          a["agent_identity"],
                "agent_name":              a["agent_name"],
                "status":                  a["status"],
                "sequence_number":         a["sequence_number"],
                "ignore_outbounds_until":  (
                    a["ignore_outbounds_until"].isoformat()
                    if a.get("ignore_outbounds_until") else None
                ),
            }
            for a in agents
        ],
    }


@cc_router.get("/agents/status")
async def get_all_agents_status():
    """Return all non-offline agents for the QueueMonitor frontend view."""
    agents = await db.get_all_online_agents()
    return {
        "agents": [
            {
                "agent_identity": a["agent_identity"],
                "agent_name":     a["agent_name"],
                "department":     a["department"],
                "status":         a["status"],
            }
            for a in agents
        ]
    }


@cc_router.post("/agent/accept/{session_id}")
async def agent_accept_call(
    session_id:     str,
    agent_identity: str = Query(...),
    agent_name:     str = Query("Agent"),
):
    entry = await queue_engine.pop_caller(session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Session not found in queue")

    room_id  = entry["room_id"]
    wait_sec = int(time.time() - entry["joined_at"])

    await db.update_call_log_status(
        session_id, "connected",
        wait_seconds = wait_sec,
        agent_id     = agent_identity,
    )
    await db.set_agent_busy(agent_identity)

    # Kick piper-tts from the room (requires livekit SDK)
    try:
        from livekit.api import LiveKitAPI, ListParticipantsRequest
        api_key    = os.getenv("LIVEKIT_API_KEY",    "devkey")
        api_secret = os.getenv("LIVEKIT_API_SECRET", "devsecret")
        lk_url     = LIVEKIT_URL.replace("wss://", "https://")

        async with LiveKitAPI(lk_url, api_key, api_secret) as api:
            participants = await api.room.list_participants(
                ListParticipantsRequest(room=room_id)
            )
            for p in participants.participants:
                if p.identity.startswith("piper-tts"):
                    try:
                        await api.room.remove_participant(room=room_id, identity=p.identity)
                    except Exception:
                        await api.room.remove_participant(room_id, p.identity)
                    logger.info("Kicked TTS %s from %s", p.identity, room_id)
    except Exception as exc:
        logger.warning("Could not kick TTS agent: %s", exc)

    token = generate_token(
        room_name     = room_id,
        identity      = agent_identity,
        name          = agent_name,
        can_publish   = True,
        can_subscribe = True,
    )

    return {
        "token":      token,
        "room":       room_id,
        "url":        LIVEKIT_URL,
        "session_id": session_id,
        "caller_id":  entry["caller_id"],
        "user_email": entry["user_email"],
    }


@cc_router.post("/agent/end-call")
async def agent_end_call(req: AgentEndCallRequest):
    call_log = await db.get_call_log(req.session_id) if req.session_id else None
    if call_log:
        created = call_log["created_at"]
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        duration = int((datetime.now(timezone.utc) - created).total_seconds())
        await db.update_call_log_status(
            req.session_id, "completed", call_duration=duration
        )

    # Mark any in_progress outbound as completed (agent ended the call normally — no email)
    # "We tried to reach you" email only fires via outbound_engine timeout or outbound/user-reject
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        outbound = await conn.fetchrow(
            "SELECT id FROM outbound_queue WHERE assigned_agent=$1 AND status='in_progress' LIMIT 1",
            req.agent_identity
        )
        if outbound:
            await db.complete_outbound(outbound["id"], "completed")

    await db.set_agent_free(req.agent_identity)
    return {"status": "ended", "agent_identity": req.agent_identity}


# ═══════════════════════════════════════════════════════════════════════════════
# Outbound callbacks
# ═══════════════════════════════════════════════════════════════════════════════

@cc_router.post("/outbound/accept")
async def outbound_accept(req: OutboundAcceptRequest):
    outbound = await db.get_outbound(req.outbound_id)
    if not outbound:
        raise HTTPException(status_code=404, detail="Outbound callback not found")

    current_status = outbound.get("status")
    if current_status in ("completed", "no_answer", "declined"):
        return {"outbound_id": req.outbound_id, "status": current_status, "already_handled": True}
    if current_status == "in_progress":
        return {"outbound_id": req.outbound_id, "status": "in_progress", "already_handled": True}
    if (current_status == "assigned"
            and outbound.get("assigned_agent")
            and outbound.get("assigned_agent") != req.agent_identity):
        raise HTTPException(
            status_code=409,
            detail="Outbound callback already assigned to another agent",
        )

    await db.mark_outbound_in_progress(req.outbound_id, req.agent_identity)

    room_id = f"outbound-{int(time.time())}-{uuid.uuid4().hex[:8]}"
    token   = generate_token(
        room_name     = room_id,
        identity      = req.agent_identity,
        name          = "Agent",
        can_publish   = True,
        can_subscribe = True,
    )
    await db.set_agent_busy(req.agent_identity)

    # Tell all other agents who were notified that this outbound is taken
    await event_hub.publish({
        "type":        "outbound_accepted",
        "outbound_id": req.outbound_id,
        "by_agent":    req.agent_identity,
    })

    if outbound.get("user_email"):
        # Notify the user that an agent is calling them back
        await event_hub.publish({
            "type":        "caller_pickup",
            "user_email":  outbound["user_email"],
            "room":        room_id,
            "department":  outbound.get("department", "Support"),
            "outbound_id": req.outbound_id,   # for frontend deduplication
        })

    return {
        "token":       token,
        "room":        room_id,
        "url":         LIVEKIT_URL,
        "outbound_id": req.outbound_id,
        "status":      "in_progress",
    }


@cc_router.get("/outbound/caller-token")
async def get_caller_token(room: str, user_email: str):
    token = generate_token(
        room_name     = room,
        identity      = user_email,
        name          = "Caller",
        can_publish   = True,
        can_subscribe = True,
    )
    return {"token": token, "url": LIVEKIT_URL}


@cc_router.post("/outbound/complete")
async def outbound_complete(req: OutboundCompleteRequest):
    current = await db.get_outbound(req.outbound_id)
    if not current:
        raise HTTPException(status_code=404, detail="Outbound callback not found")

    if current.get("status") in ("completed", "no_answer", "declined"):
        await db.set_agent_free(req.agent_identity)
        return {
            "status":          current.get("status"),
            "outbound_id":     req.outbound_id,
            "already_handled": True,
        }

    await db.complete_outbound(req.outbound_id, "completed")
    await db.set_agent_free(req.agent_identity)
    return {"status": "completed", "outbound_id": req.outbound_id}


@cc_router.post("/outbound/no-answer")
async def outbound_no_answer(req: OutboundNoAnswerRequest):
    current = await db.get_outbound(req.outbound_id)
    if current and current.get("status") in ("completed", "no_answer", "declined"):
        return {
            "status":          current.get("status"),
            "outbound_id":     req.outbound_id,
            "already_handled": True,
        }

    await db.complete_outbound(req.outbound_id, "no_answer")
    await db.set_agent_free(req.agent_identity)

    if req.user_email:
        await send_outbound_no_answer_email(req.user_email, req.department)
        await event_hub.publish({
            "type":       "outbound_cancelled",
            "user_email": req.user_email,
        })

    return {"status": "no_answer", "outbound_id": req.outbound_id}


@cc_router.post("/outbound/user-reject")
async def outbound_user_reject(req: OutboundUserRejectRequest):
    """Called by the frontend when user clicks 'Decline' or the 20s notification expires."""
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        outbound = await conn.fetchrow(
            "SELECT id, assigned_agent FROM outbound_queue WHERE user_email=$1 AND status='in_progress' LIMIT 1",
            req.user_email
        )
        if outbound:
            await db.complete_outbound(outbound["id"], "no_answer")
            await db.set_agent_free(outbound["assigned_agent"])

            # Tell the agent's browser to hang up — they are waiting in a LiveKit room
            # but the user never joined, so the call is effectively dead.
            await event_hub.publish({
                "type":           "outbound_agent_hangup",
                "outbound_id":    outbound["id"],
                "assigned_agent": outbound["assigned_agent"],
                "user_email":     req.user_email,
            })

            from .email_service import send_outbound_no_answer_email
            await send_outbound_no_answer_email(req.user_email, req.department)
            return {"status": "no_answer_handled"}

    return {"status": "not_found"}


@cc_router.post("/outbound/decline")
async def outbound_decline(req: OutboundDeclineRequest):
    # Snooze this agent so they won't be re-notified for snooze_minutes.
    # The outbound stays 'broadcasting' so other free agents can still accept it.
    # If nobody accepts within 25s the stuck-cleanup will mark it no_answer.
    until = datetime.now(timezone.utc) + timedelta(minutes=req.snooze_minutes)
    await db.set_agent_ignoring_outbounds(req.agent_identity, until, req.reason)
    return {"status": "declined", "snooze_until": until.isoformat()}


@cc_router.post("/outbound/resume")
async def outbound_resume(req: OutboundResumeRequest):
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        agent = await conn.fetchrow(
            "SELECT department FROM agent_states WHERE agent_identity = $1",
            req.agent_identity,
        )
        await conn.execute(
            """
            UPDATE agent_states
            SET status                 = 'online',
                ignore_outbounds_until = NULL,
                ignore_reason          = '',
                last_heartbeat         = NOW()
            WHERE agent_identity = $1
            """,
            req.agent_identity,
        )
    if agent:
        await db.reset_recent_no_answer_to_pending(agent["department"], minutes=30)
    return {"status": "resumed", "agent_identity": req.agent_identity}


@cc_router.get("/outbound/history")
async def get_outbound_history(department: Optional[str] = None, limit: int = 50):
    records = await db.get_outbound_history(department=department, limit=limit)
    result  = []
    for r in records:
        result.append({
            "id":             r["id"],
            "user_email":     r["user_email"],
            "department":     r["department"],
            "status":         r["status"],
            "assigned_agent": r.get("assigned_agent", ""),
            "attempts":       r.get("attempts", 0),
            "created_at":     r["created_at"].isoformat() if r.get("created_at") else None,
            "last_attempt":   r["last_attempt"].isoformat() if r.get("last_attempt") else None,
        })
    return {"history": result}


# ═══════════════════════════════════════════════════════════════════════════════
# Business hours / holiday
# ═══════════════════════════════════════════════════════════════════════════════

@cc_router.get("/business-hours")
async def get_business_hours():
    return business_hours.get_status()


@cc_router.post("/holiday")
async def set_holiday(req: HolidayRequest):
    try:
        until_dt = datetime.fromisoformat(req.until)
        if until_dt.tzinfo is None:
            import pytz as _pytz
            tz       = _pytz.timezone(business_hours._config.get("timezone", "Asia/Kolkata"))
            until_dt = tz.localize(until_dt)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ISO datetime for 'until'")
    business_hours.set_holiday(req.message, until_dt)
    return {"status": "holiday_set", "message": req.message, "until": req.until}


@cc_router.delete("/holiday")
async def clear_holiday():
    business_hours.clear_holiday()
    return {"status": "holiday_cleared"}


# ═══════════════════════════════════════════════════════════════════════════════
# Admin config  (also exposed at /api/admin/config — see routes/admin.py)
# ═══════════════════════════════════════════════════════════════════════════════

@cc_router.get("/admin/config")
async def get_admin_config():
    config = await db.get_all_config()
    return {"config": config}


@cc_router.get("/admin/config/get")
async def get_single_config(key: str):
    value = await db.get_config(key)
    return {"key": key, "value": value}


@cc_router.post("/admin/config")
async def set_admin_config(req: AdminConfigRequest):
    await db.set_config(req.key, req.value)
    return {"status": "saved", "key": req.key, "value": req.value}


@cc_router.post("/admin/business-hours")
async def set_business_hours(req: BusinessHoursRequest):
    await db.set_config("work_start", req.work_start)
    await db.set_config("work_end",   req.work_end)
    await db.set_config("work_days",  req.work_days)
    await db.set_config("timezone",   req.timezone)
    await db.set_config("avg_resolution_seconds", str(req.avg_resolution_seconds))
    await business_hours.load_config_from_db()
    return {"status": "updated", **req.model_dump()}


@cc_router.post("/admin/email-config")
async def set_email_config(req: EmailConfigRequest):
    await db.set_config("smtp_host",     req.smtp_host)
    await db.set_config("smtp_port",     str(req.smtp_port))
    await db.set_config("smtp_user",     req.smtp_user)
    await db.set_config("smtp_password", req.smtp_password)
    await db.set_config("smtp_from",     req.smtp_from or req.smtp_user)
    await db.set_config("smtp_use_tls",  "true" if req.smtp_use_tls else "false")
    from .email_service import load_email_config_from_db
    await load_email_config_from_db()
    return {"status": "saved", "smtp_user": req.smtp_user, "smtp_host": req.smtp_host}


@cc_router.get("/admin/email-config")
async def get_email_config():
    config = await db.get_all_config()
    return {
        "smtp_host":        config.get("smtp_host",    "smtp.gmail.com"),
        "smtp_port":        config.get("smtp_port",    "587"),
        "smtp_user":        config.get("smtp_user",    ""),
        "smtp_from":        config.get("smtp_from",    ""),
        "smtp_use_tls":     config.get("smtp_use_tls", "true"),
        "smtp_password_set": bool(config.get("smtp_password", "")),
    }


@cc_router.post("/admin/clear-queues")
async def clear_queues():
    """⚠️ DESTRUCTIVE — for testing only."""
    result = await db.clear_queues()
    return {"message": "Cleared outbound_queue, cc_sessions, offline agents", **result}


# ── Agent heartbeat ───────────────────────────────────────────────────────────

class HeartbeatRequest(BaseModel):
    agent_identity: str

@cc_router.post("/agent/heartbeat")
async def agent_heartbeat(req: HeartbeatRequest):
    """
    Keep agent status alive. Call every 30 s while the dashboard is open.
    Updates last_heartbeat column without changing the agent's current status.
    """
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE agent_states
               SET last_heartbeat = NOW(),
                   status = CASE WHEN status = 'offline' THEN 'online' ELSE status END
             WHERE agent_identity = $1
            RETURNING agent_identity, status
            """,
            req.agent_identity,
        )
    if not row:
        # Agent hasn't called /agent/online yet — don't crash, just report
        return {"status": "not_registered", "agent_identity": req.agent_identity}
    return {"status": row["status"], "agent_identity": row["agent_identity"]}


# ── Reset stuck in_progress outbounds back to pending ─────────────────────────
@cc_router.post("/outbound/reset-stuck")
async def reset_stuck_outbound():
    """Reset in_progress outbounds with no active agent back to pending so engine retries."""
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            UPDATE outbound_queue
               SET status = 'pending', attempts = 0, assigned_agent = NULL
             WHERE status = 'in_progress'
               AND (assigned_agent IS NULL
                    OR assigned_agent NOT IN (
                        SELECT agent_identity FROM agent_states
                        WHERE status != 'offline'
                          AND last_heartbeat > NOW() - INTERVAL '2 minutes'
                    ))
            RETURNING id, user_email
            """
        )
    logger.info("reset-stuck: reset %d in_progress outbounds to pending", len(rows))
    return {"reset": len(rows), "items": [dict(r) for r in rows]}


# ── Agent offline (sendBeacon on browser close) ───────────────────────────────
@cc_router.post("/agent/offline")
async def agent_offline(request: Request):
    """Accepts sendBeacon payload (raw JSON body) and sets agent offline immediately."""
    try:
        body = await request.json()
        agent_identity = body.get("agent_identity", "")
    except Exception:
        return {"status": "error"}
    if agent_identity:
        await db.set_agent_offline(agent_identity)
        logger.info("[Agent] offline beacon received: %s", agent_identity)
    return {"status": "offline"}


# ── Call Transfer ─────────────────────────────────────────────────────────────

class TransferCallRequest(BaseModel):
    department:    str  = "General"
    transfer_type: str  = "cold"   # "cold" | "warm"
    agent_identity: str = ""

@cc_router.post("/calls/{session_id}/transfer")
async def transfer_call(session_id: str, req: TransferCallRequest):
    """
    Transfer an active call to a different department.
    - Marks the current call log as 'transferred'
    - Re-enqueues the caller into the target department queue
    """
    try:
        # 1. Mark old call log as transferred
        await db.update_call_log_status(session_id, "transferred")
    except Exception as exc:
        logger.warning("Could not update call log status for transfer: %s", exc)

    try:
        # 2. Re-enqueue the caller in the new department (best-effort)
        from .queue_engine import enqueue_caller, find_caller, dequeue_caller

        # Check if the caller is still in any queue (from the call log)
        call_log = await db.get_call_log(session_id)
        if call_log:
            user_id     = call_log.get("user_id", 0)
            user_email  = call_log.get("user_email", "")
            room_id     = call_log.get("room_id", session_id)

            # Remove from current queue (if still there)
            await dequeue_caller(session_id, reason="transferred")

            # Enqueue in new department — skip_outbound so no callback email fires
            new_log_id = await db.create_call_log(
                user_id        = user_id,
                session_id     = f"{session_id}-xfr",
                room_id        = room_id,
                department     = req.department,
                queue_position = 1,
            )
            await enqueue_caller(
                session_id    = f"{session_id}-xfr",
                room_id       = room_id,
                caller_id     = f"caller-{session_id[:8]}",
                user_email    = user_email,
                department    = req.department,
                user_id       = user_id,
                call_log_id   = new_log_id,
                skip_outbound = True,
            )
    except Exception as exc:
        logger.warning("Re-enqueue on transfer failed (non-fatal): %s", exc)

    # 3. Free the agent
    if req.agent_identity:
        try:
            await db.set_agent_free(req.agent_identity)
        except Exception:
            pass

    return {
        "status":      "transferred",
        "session_id":  session_id,
        "department":  req.department,
        "type":        req.transfer_type,
    }
