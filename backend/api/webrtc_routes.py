"""
webrtc_routes.py — Human-agent WebRTC call routing.

Endpoints:
  WebSocket GET /api/webrtc/ws/{agent_id}?department=  — agent presence channel
  POST /api/webrtc/calls/initiate                       — user starts call, rings agents + enqueues
  POST /api/webrtc/calls/accept/{call_id}               — agent accepts
  POST /api/webrtc/calls/cancel/{call_id}               — user cancels + triggers outbound/email
  GET  /api/webrtc/livekit/token                        — issue LiveKit JWT for room
  GET  /api/webrtc/agents/online                        — list connected agents
"""
import json
import logging
import os
import uuid
import time

from fastapi import APIRouter, Query, Request, WebSocket, WebSocketDisconnect
from livekit.api import AccessToken, VideoGrants
from pydantic import BaseModel
from typing import Optional

LIVEKIT_API_KEY    = os.getenv("LIVEKIT_API_KEY",    "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "devsecret")
LIVEKIT_URL        = os.getenv("LIVEKIT_URL",         "ws://localhost:7880")

logger = logging.getLogger("webrtc")
router = APIRouter(prefix="/api/webrtc", tags=["webrtc"])

# call_id → {session_id, email, dept}  (so cancel can dequeue + email)
_cc_session_map: dict[str, dict] = {}


# ── Connection manager ─────────────────────────────────────────────────────────

class _Manager:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}   # agent_id → ws
        self.departments: dict[str, str]       = {}   # agent_id → dept

    async def connect(self, ws: WebSocket, agent_id: str, dept: str):
        await ws.accept()
        self.connections[agent_id] = ws
        self.departments[agent_id] = dept

    def disconnect(self, agent_id: str, ws: WebSocket = None):
        if ws is None or self.connections.get(agent_id) is ws:
            self.connections.pop(agent_id, None)
            self.departments.pop(agent_id, None)

    async def _send(self, ws: WebSocket, msg: dict, agent_id: str):
        try:
            await ws.send_text(json.dumps(msg))
            return True
        except Exception:
            self.disconnect(agent_id, ws)
            return False

    async def send_to_agent(self, agent_id: str, msg: dict) -> bool:
        ws = self.connections.get(agent_id)
        return bool(ws and await self._send(ws, msg, agent_id))

    async def broadcast_to_dept(self, dept: str, msg: dict) -> int:
        targets = [aid for aid, d in self.departments.items() if d.lower() == dept.lower()]
        count = 0
        for aid in targets:
            ws = self.connections.get(aid)
            if ws and await self._send(ws, msg, aid):
                count += 1
        return count

    async def broadcast(self, msg: dict):
        for aid, ws in list(self.connections.items()):
            await self._send(ws, msg, aid)

    @property
    def online(self):
        return list(self.connections.keys())


manager = _Manager()


# ── Agent presence WebSocket ───────────────────────────────────────────────────

@router.websocket("/ws/{agent_id}")
async def agent_ws(
    ws: WebSocket,
    agent_id: str,
    department: str = Query("General"),
):
    await manager.connect(ws, agent_id, department)
    try:
        while True:
            await ws.receive_text()   # keep-alive; agent sends nothing
    except WebSocketDisconnect:
        manager.disconnect(agent_id, ws)


# ── Token endpoint ─────────────────────────────────────────────────────────────

@router.get("/livekit/token")
async def livekit_token(
    room:     str = Query(...),
    identity: str = Query(...),
    name:     str = Query("Participant"),
):
    grant = VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True)
    token = (
        AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(name)
        .with_grants(grant)
        .to_jwt()
    )
    return {"token": token, "room": room, "livekit_url": LIVEKIT_URL}


# ── Call initiation ────────────────────────────────────────────────────────────

class InitiatePayload(BaseModel):
    caller_name: str
    call_type:   str = "browser"
    department:  str = "General"
    lang:        str = "en"
    user_email:  str = ""


@router.post("/calls/initiate")
async def initiate_call(payload: InitiatePayload):
    from backend.api.callcenter import business_hours
    if business_hours.should_reject_call():
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="outside_business_hours")

    room_name = f"room-{uuid.uuid4().hex[:8]}"
    call_id   = f"call-{uuid.uuid4().hex[:8]}"

    msg = {
        "type": "incoming_call",
        "data": {
            "call_id":     call_id,
            "room_name":   room_name,
            "caller_name": payload.caller_name,
            "call_type":   payload.call_type,
            "department":  payload.department,
        },
    }

    notified = await manager.broadcast_to_dept(payload.department, msg)
    if not notified:
        notified = await manager.broadcast_to_dept("General", msg)

    # ── Enqueue in callcenter queue so queue monitor shows live data ──────────
    email = payload.user_email or f"{payload.caller_name.replace(' ', '.')}@guest"
    session_id = f"wrtc-{uuid.uuid4().hex[:12]}"
    # Set map entry immediately so cancel_call can always find it even if DB ops fail
    _cc_session_map[call_id] = {"session_id": session_id, "email": email, "dept": payload.department}
    try:
        from backend.api.callcenter import db as ccdb, queue_engine
        user_id = await ccdb.upsert_user(email, payload.caller_name)
        call_log_id = await ccdb.create_call_log(
            user_id=user_id, session_id=session_id, room_id=room_name,
            department=payload.department, queue_position=1,
        )
        _cc_session_map[call_id]["call_log_id"] = call_log_id
        _cc_session_map[call_id]["user_id"] = user_id
        await queue_engine.enqueue_caller(
            session_id=session_id, room_id=room_name,
            caller_id=f"caller-{uuid.uuid4().hex[:8]}",
            user_email=email, department=payload.department,
            user_id=user_id, call_log_id=call_log_id,
            caller_name=payload.caller_name,
        )
    except Exception as exc:
        logger.warning("CC queue enqueue failed (non-fatal): %s", exc)

    return {
        "status":    "ringing" if notified else "no_agents",
        "room_name": room_name,
        "call_id":   call_id,
        "notified":  notified,
    }


@router.post("/calls/accept/{call_id}")
async def accept_call(call_id: str, agent_id: str = "", request: Request = None):
    # Prefer email from JWT over raw agent_id param (which may be numeric user id)
    identity = agent_id
    if request:
        try:
            import os, jwt as _jwt
            tok = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
            payload = _jwt.decode(tok, os.getenv("JWT_SECRET", "srcomsoft-change-me"), algorithms=["HS256"])
            identity = str(payload.get("email") or payload.get("user_id") or agent_id)
        except Exception:
            pass
    await manager.broadcast({"type": "call_accepted", "data": {"call_id": call_id, "agent_id": identity}})
    entry = _cc_session_map.pop(call_id, None)
    if entry:
        session_id = entry["session_id"]
        try:
            from backend.api.callcenter import db as ccdb, queue_engine
            await queue_engine.dequeue_caller(session_id, reason="connected")
            await ccdb.update_call_log_status(session_id, "connected", agent_id=identity)
            if identity:
                await ccdb.set_agent_busy(identity)
        except Exception as exc:
            logger.warning("CC accept update failed: %s", exc)
    return {"status": "accepted"}


@router.post("/calls/cancel/{call_id}")
async def cancel_call(call_id: str, user_email: str = "", department: str = "General"):
    await manager.broadcast({"type": "call_cancelled", "data": {"call_id": call_id}})

    # ── Dequeue from callcenter and add to outbound_queue for email ───────────
    entry = _cc_session_map.pop(call_id, None)
    if entry:
        session_id = entry["session_id"]
        email      = entry.get("email", "") or user_email
        dept       = entry.get("dept", department)
        try:
            from backend.api.callcenter import queue_engine, db as ccdb
            removed = await queue_engine.dequeue_caller(session_id, reason="abandoned")
            if not removed and email:
                # Session wasn't in Kafka queue (quick cancel) — handle outbound manually
                call_log_id = entry.get("call_log_id")
                user_id     = entry.get("user_id")
                if call_log_id and user_id:
                    await ccdb.add_to_outbound_queue(call_log_id, email, dept)
                    from backend.api.callcenter.email_service import send_abandoned_call_email
                    import asyncio
                    asyncio.create_task(send_abandoned_call_email(email, dept))
        except Exception as exc:
            logger.warning("CC dequeue/outbound failed: %s", exc)

    return {"status": "cancelled", "call_id": call_id}


@router.get("/agents/online")
async def agents_online():
    return {"agents": manager.online}
