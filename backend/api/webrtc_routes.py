"""
webrtc_routes.py — Human-agent WebRTC call routing.

Endpoints:
  WebSocket GET /api/webrtc/ws/{agent_id}?department=  — agent presence channel
  POST /api/webrtc/calls/initiate                       — user starts call, rings agents + enqueues
  POST /api/webrtc/calls/accept/{call_id}               — agent accepts
  POST /api/webrtc/calls/cancel/{call_id}               — user cancels + triggers outbound/email
  POST /api/webrtc/token                                 — agent browser call: create DB session + issue LiveKit JWT
  GET  /api/webrtc/livekit/token                        — issue LiveKit JWT for room (no DB session)
  GET  /api/webrtc/agents/online                        — list connected agents
"""
import asyncio  # [Sentiment] added for run_in_executor in save_transcript_turn
import json
import logging
import os
import uuid
import time

import pathlib
from fastapi import APIRouter, Query, Request, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from livekit.api import AccessToken, VideoGrants
from pydantic import BaseModel
from typing import Optional

LIVEKIT_API_KEY    = os.getenv("LIVEKIT_API_KEY",    "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "devsecret")
LIVEKIT_URL        = os.getenv("LIVEKIT_URL",         "ws://localhost:7880")

VAPID_PUBLIC_KEY  = os.getenv("VAPID_PUBLIC_KEY",  "BAhi7lxf-xB8hoCQ9xwQ5ibbs2obpcd1WWwWMIAZfrcr6am5lz5rd1Hsezy2-l7zE9H-9i4ztfXX4A4OSvI-LWk")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "l2fdVtmBFF_B1LyR3uFKOA4pDV04S6aJdfiMN-N1Qp4")
VAPID_CLAIMS      = {"sub": "mailto:admin@srcomsoft.com"}

# In-memory push subscription store: email -> subscription dict
# (replace with DB for persistence across restarts)
_push_subscriptions: dict[str, dict] = {}

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


class AgentTokenPayload(BaseModel):
    participant_name: str
    room_name:        str
    department:       str = "General"
    user_email:       str = ""


@router.post("/token")
async def agent_browser_token(payload: AgentTokenPayload):
    """Issue a LiveKit token for an agent-initiated browser call and create a DB session so CRM can look up caller data."""
    session_id = f"wrtc-{uuid.uuid4().hex[:12]}"
    email = payload.user_email or f"{payload.participant_name.replace(' ', '.').lower()}@guest"

    # Create DB session so caller-profile CRM lookup works
    try:
        from backend.api.callcenter import db as ccdb
        user_id = await ccdb.upsert_user(email, payload.participant_name)
        await ccdb.create_call_log(
            user_id=user_id, session_id=session_id,
            room_id=payload.room_name, department=payload.department,
            queue_position=0,
        )
    except Exception as exc:
        logger.warning("DB session creation failed (non-fatal): %s", exc)

    grant = VideoGrants(room_join=True, room=payload.room_name, can_publish=True, can_subscribe=True)
    token = (
        AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(f"agent-{uuid.uuid4().hex[:6]}")
        .with_name(payload.participant_name)
        .with_grants(grant)
        .to_jwt()
    )
    return {
        "token":       token,
        "room_name":   payload.room_name,
        "call_id":     session_id,
        "livekit_url": LIVEKIT_URL,
    }


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


# ── Transcript Save ────────────────────────────────────────────────────────────

# [Sentiment] Removed keyword-based _simple_sentiment — now using SentimentEngine (ML model)

class TranscriptTurnPayload(BaseModel):
    session_id: str
    speaker:    str          # "caller" | "agent" | "system"
    text:       str
    sentiment:  Optional[str] = None   # if None, computed server-side

@router.post("/transcript/save")
async def save_transcript_turn(payload: TranscriptTurnPayload):
    """Save a single transcript turn with sentiment to the transcripts table."""
    if not payload.text.strip():
        return {"status": "skipped"}

    # [Sentiment] Replaced keyword matching with ML model via SentimentEngine
    if payload.sentiment:
        sentiment = payload.sentiment
    else:
        from backend.api.sentiment_engine import SentimentEngine
        result = await asyncio.get_event_loop().run_in_executor(
            None, SentimentEngine.get().analyze, payload.text
        )
        sentiment = result["label"]   # "positive" | "negative" | "neutral"

    DB_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://neondb_owner:npg_4U3AtckjizXN@ep-shiny-glitter-a1t4vbtj.ap-southeast-1.aws.neon.tech/Srcom-soft?sslmode=require"
    )
    try:
        import asyncpg
        conn = await asyncpg.connect(DB_URL)
        # Auto-create transcripts table if it doesn't exist yet
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
        # Resolve cc_sessions.id from session_id or room_id (best-effort)
        row = await conn.fetchrow(
            "SELECT id FROM cc_sessions WHERE session_id=$1 OR room_id=$1 ORDER BY created_at DESC LIMIT 1",
            payload.session_id
        )
        call_log_id = row["id"] if row else None
        await conn.execute(
            "INSERT INTO transcripts (call_id, session_id, speaker, text, sentiment) VALUES ($1,$2,$3,$4,$5)",
            call_log_id, payload.session_id, payload.speaker, payload.text.strip(), sentiment
        )
        await conn.close()
    except Exception as exc:
        logger.warning("Transcript save failed (non-fatal): %s", exc)

    return {"status": "saved", "sentiment": sentiment}


@router.get("/agents/online")
async def agents_online():
    return {"agents": manager.online}


# ── VAPID public key (frontend needs this to subscribe) ───────────────────────

@router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    return {"publicKey": VAPID_PUBLIC_KEY}


# ── Save push subscription ─────────────────────────────────────────────────────

class PushSubscriptionPayload(BaseModel):
    email:        str
    subscription: dict   # {endpoint, keys: {p256dh, auth}}


@router.post("/push/subscribe")
async def save_push_subscription(payload: PushSubscriptionPayload):
    _push_subscriptions[payload.email.lower().strip()] = payload.subscription
    logger.info("Push subscription saved for %s", payload.email)
    return {"status": "subscribed"}


# ── Conference / Add-to-Call ───────────────────────────────────────────────────

class ConferenceInvitePayload(BaseModel):
    room_name:    str
    invitee_id:   str           # agent email / identity to invite
    inviter_name: str = "Agent"
    call_id:      str = ""


@router.post("/conference/invite")
async def conference_invite(payload: ConferenceInvitePayload):
    """
    Invite any person (by email or name) into an active LiveKit room.
    - Generates a guest LiveKit token for the invitee
    - Returns a shareable join URL the agent can copy/send
    - Also notifies logged-in agents via event_hub (if invitee is an agent)
    """
    from backend.api.callcenter.event_hub import event_hub

    # Generate a LiveKit token for the invitee so they can join without logging in
    identity = payload.invitee_id.strip()
    display_name = identity.split("@")[0].replace(".", " ").title() if "@" in identity else identity

    grant = VideoGrants(room_join=True, room=payload.room_name, can_publish=True, can_subscribe=True)
    guest_token = (
        AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(f"guest-{identity[:20]}")
        .with_name(display_name)
        .with_grants(grant)
        .to_jwt()
    )

    # Notify any logged-in agent matching this identity via event_hub
    event = {
        "type": "conference_invite",
        "data": {
            "room_name":    payload.room_name,
            "inviter_name": payload.inviter_name,
            "call_id":      payload.call_id,
            "invitee_id":   identity,
            "guest_token":  guest_token,
            "livekit_url":  LIVEKIT_URL,
        },
        "assigned_agent": identity,
    }
    await event_hub.publish(event)

    # Send Web Push notification if the invitee has a saved subscription
    push_sent = False
    sub = _push_subscriptions.get(identity.lower())
    if sub:
        try:
            import asyncio
            from pywebpush import webpush, WebPushException
            join_url = f"{os.getenv('FRONTEND_URL', 'https://call-test-wine.vercel.app')}/conference/{payload.room_name}/join"
            notification_data = json.dumps({
                "title":    f"📞 {payload.inviter_name} is calling you",
                "body":     "Tap to join the conference call",
                "icon":     "/favicon.ico",
                "data":     {"url": join_url, "room": payload.room_name, "token": guest_token},
                "actions":  [
                    {"action": "accept", "title": "Join Call"},
                    {"action": "decline", "title": "Decline"},
                ],
            })
            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: webpush(
                    subscription_info=sub,
                    data=notification_data,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims=VAPID_CLAIMS,
                )
            )
            push_sent = True
            logger.info("Web push sent to %s", identity)
        except Exception as exc:
            logger.warning("Web push failed for %s: %s", identity, exc)

    return {
        "status":       "invite_sent",
        "room":         payload.room_name,
        "invitee":      identity,
        "guest_token":  guest_token,
        "livekit_url":  LIVEKIT_URL,
        "push_sent":    push_sent,
    }


# ── Call Hold / Resume ─────────────────────────────────────────────────────────

class HoldPayload(BaseModel):
    session_id:     str
    agent_identity: str = ""
    action:         str = "hold"   # "hold" | "resume"


@router.post("/calls/hold")
async def call_hold(payload: HoldPayload):
    """
    Notifies backend of hold/resume state — primarily for logging and
    future hold-music support. Audio control happens client-side via LiveKit.
    """
    from backend.api.callcenter import db
    try:
        status = "on_hold" if payload.action == "hold" else "connected"
        await db.update_call_log_status(payload.session_id, status)
    except Exception:
        pass   # non-fatal — logging only
    return {"status": payload.action, "session_id": payload.session_id}


# ── Call Recording ─────────────────────────────────────────────────────────────
# [Recording] Directory where browser-recorded audio files are stored locally

_RECORDINGS_DIR = pathlib.Path(__file__).resolve().parent.parent / "recordings"
_RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/recording/upload")
async def upload_recording(
    session_id: str = Query(...),
    consent: str = Query("admitted"),
    file: UploadFile = File(...),
):
    """
    [Recording] Receives WebM/opus blob from browser after call ends.
    Saves to backend/recordings/<session_id>.webm and updates cc_sessions.
    """
    safe_id = session_id.replace("/", "_").replace("..", "")
    dest = _RECORDINGS_DIR / f"{safe_id}.webm"
    try:
        content = await file.read()
        dest.write_bytes(content)
        # Re-encode via PyAV to inject proper duration into WebM (MediaRecorder omits it)
        try:
            import av as _av
            tmp = dest.with_suffix('.tmp.webm')
            dest.rename(tmp)
            with _av.open(str(tmp)) as inp, _av.open(str(dest), 'w', format='webm') as out:
                in_audio = inp.streams.audio[0]
                out_stream = out.add_stream('libopus', rate=48000)
                out_stream.bit_rate = 96000
                for frame in inp.decode(in_audio):
                    frame.pts = None
                    for pkt in out_stream.encode(frame):
                        out.mux(pkt)
                for pkt in out_stream.encode(None):
                    out.mux(pkt)
            tmp.unlink(missing_ok=True)
        except Exception as av_exc:
            logger.warning("[Recording] re-encode failed (kept raw): %s", av_exc)
            if 'tmp' in locals() and tmp.exists():
                tmp.rename(dest)  # restore original if transcode crashed mid-way
    except Exception as exc:
        logger.warning("[Recording] file write failed session=%s err=%s", session_id, exc)
        return {"status": "error", "message": str(exc)}

    # Relative URL served via GET /api/webrtc/recording/<session_id>
    recording_url = f"/api/webrtc/recording/{safe_id}"
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE cc_sessions
                   SET recording_url=$1, recording_consent=$2
                   WHERE session_id=$3 OR room_id=$3""",
                recording_url, consent, session_id,
            )
    except Exception as exc:
        logger.warning("[Recording] DB update failed session=%s err=%s", session_id, exc)

    logger.info("[Recording] saved session=%s size=%dKB consent=%s", session_id, len(content) // 1024, consent)
    return {"status": "ok", "recording_url": recording_url}


@router.post("/recording/consent")
async def save_recording_consent(payload: dict):
    """
    [Recording] Called immediately when user clicks Deny — marks session as not recorded.
    """
    session_id = payload.get("session_id", "")
    consent = payload.get("consent", "denied")
    try:
        from backend.api.callcenter.db import get_pool
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE cc_sessions SET recording_consent=$1 WHERE session_id=$2 OR room_id=$2",
                consent, session_id,
            )
    except Exception as exc:
        logger.warning("[Recording] consent save failed session=%s err=%s", session_id, exc)
    return {"status": "ok", "consent": consent}


@router.get("/recording/{session_id}")
async def serve_recording(session_id: str):
    """[Recording] Streams the saved WebM audio file for playback in the dashboard."""
    safe_id = session_id.replace("/", "_").replace("..", "")
    dest = _RECORDINGS_DIR / f"{safe_id}.webm"
    if not dest.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Recording not found")
    return FileResponse(str(dest), media_type="audio/webm", filename=f"{safe_id}.webm")
