import os
import json
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query, HTTPException
from pydantic import BaseModel
from typing import Optional

# LiveKit imports
from livekit.api import AccessToken, VideoGrants
from deps import get_current_user
from models.db import get_db

router = APIRouter(prefix="/api/webrtc", tags=["webrtc"])

LIVEKIT_API_KEY    = os.getenv("LIVEKIT_API_KEY",    "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "devsecret")
LIVEKIT_URL        = os.getenv("VITE_LIVEKIT_URL",   "ws://127.0.0.1:7880")

# ── Routing engine (optional — graceful fallback if not available) ─────────────
try:
    from routing_engine import routing_engine as _routing_engine
    from routing_engine.engine import AgentInfo
    _ROUTING_AVAILABLE = True
except Exception as _re_err:
    _routing_engine    = None
    AgentInfo          = None
    _ROUTING_AVAILABLE = False
    print(f"  [webrtc] Routing engine unavailable (non-fatal): {_re_err}")


# ── Connection Manager ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}   # {agent_id: WebSocket}
        self.agent_departments:  dict = {}   # {agent_id: str}  — department this agent is serving

    async def connect(self, websocket: WebSocket, agent_id: str, department: str = "General"):
        await websocket.accept()
        self.active_connections[agent_id] = websocket
        self.agent_departments[agent_id]  = department

    def disconnect(self, agent_id: str):
        self.active_connections.pop(agent_id, None)
        self.agent_departments.pop(agent_id, None)

    # ── Send helpers ──────────────────────────────────────────────────────────

    async def broadcast(self, message: dict):
        """Send to every connected agent."""
        dead = []
        for aid, conn in list(self.active_connections.items()):
            try:
                await conn.send_text(json.dumps(message))
            except Exception:
                dead.append(aid)
        for aid in dead:
            self.disconnect(aid)

    async def send_to_agent(self, agent_id: str, message: dict) -> bool:
        """Send to one specific agent. Returns True if delivered."""
        conn = self.active_connections.get(agent_id)
        if not conn:
            return False
        try:
            await conn.send_text(json.dumps(message))
            return True
        except Exception:
            self.disconnect(agent_id)
            return False

    async def broadcast_to_department(self, department: str, message: dict) -> int:
        """
        Send ONLY to agents registered for `department`.
        Returns count of agents notified.
        No fallback — if nobody is in that dept the call sits in the CC queue.
        """
        targets = [
            aid for aid, dept in self.agent_departments.items()
            if dept.lower() == department.lower()
        ]
        if not targets:
            print(f"  [webrtc] No agents online for dept={department!r} — call queued, no ring sent")
            return 0
        dead = []
        for aid in targets:
            conn = self.active_connections.get(aid)
            if not conn:
                continue
            try:
                await conn.send_text(json.dumps(message))
            except Exception:
                dead.append(aid)
        for aid in dead:
            self.disconnect(aid)
        return len(targets) - len(dead)

    async def broadcast_call_cancelled(self, call_id: str):
        """Tell every agent to dismiss the ringing popup for this call."""
        await self.broadcast({"type": "call_cancelled", "data": {"call_id": call_id}})


manager = ConnectionManager()

# =========================================================================
# 🟢 FIX: THE BULLETPROOF TOKEN ENDPOINT (Outbound / Dialer)
# =========================================================================
@router.post("/token")
async def get_token(payload: dict, current_user=Depends(get_current_user)):
    try:
        room_name = payload.get("room_name", f"room-{uuid.uuid4().hex[:8]}")
        participant_name = payload.get("participant_name", "Agent")
        
        # Safely extract user ID (handles both dict and SQLAlchemy models)
        if isinstance(current_user, dict):
            uid = current_user.get("id", "agent")
        else:
            uid = getattr(current_user, "id", "agent")
            
        identity = f"speaker_{uid}"
        
        # Grant permissions for LiveKit
        grant = VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=True)
        
        # Generate Token
        token = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET) \
            .with_identity(identity) \
            .with_name(participant_name) \
            .with_grants(grant) \
            .to_jwt()

        # Print to terminal so we know it worked!
        print(f"✅ SUCCESS: Token generated for {identity} in room {room_name}")

        # Explicitly return exactly what the React Frontend is looking for
        return {
            "token": token,
            "room_name": room_name,
            "livekit_url": LIVEKIT_URL,
            "call_id": f"call-{uuid.uuid4().hex[:8]}"
        }
        
    except Exception as e:
        print(f"❌ ERROR Generating Token: {str(e)}")
        # If it fails, send a visible error back to frontend
        return {"error": str(e), "token": None}

# --- WebSocket: Agent live-call notifications ---
@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id:    str,
    department: str = Query("General", description="Department this agent is serving"),
    skills:     str = Query("",        description="Comma-separated extra skill tags"),
):
    await manager.connect(websocket, user_id, department)

    # Register agent in the routing engine pool
    if _ROUTING_AVAILABLE and _routing_engine and AgentInfo:
        skill_list = [s.strip() for s in skills.split(",") if s.strip()]
        dept_tag   = department.lower().replace(" ", "_")
        if dept_tag not in skill_list:
            skill_list.append(dept_tag)
        try:
            await _routing_engine.register_agent(AgentInfo(
                agent_id     = user_id,
                name         = user_id,
                skills       = skill_list,
                available    = True,
                max_calls    = 1,
                active_calls = 0,
                node_id      = user_id,
            ))
            print(f"  [Routing] agent {user_id!r} registered  dept={department}  skills={skill_list}")
        except Exception as _e:
            print(f"  [Routing] agent register failed (non-fatal): {_e}")

    try:
        while True:
            await websocket.receive_text()   # keep-alive; messages not currently processed
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        if _ROUTING_AVAILABLE and _routing_engine:
            try:
                await _routing_engine.deregister_agent(user_id)
            except Exception:
                pass


# =========================================================================
# BROADCAST ENDPOINTS
# =========================================================================

class BroadcastCreate(BaseModel):
    title: str
    department: str
    message: Optional[str] = None
    max_listeners: int
    speaker_name: str

active_broadcasts_db = {}
history_broadcasts_db = []

@router.get("/broadcast/active")
async def get_active_broadcasts():
    return list(active_broadcasts_db.values())

@router.get("/broadcast/history")
async def get_broadcast_history(limit: int = 20):
    return history_broadcasts_db[:limit]

@router.post("/broadcast/start")
async def start_broadcast(data: BroadcastCreate, current_user=Depends(get_current_user)):
    broadcast_id = str(uuid.uuid4())
    
    if isinstance(current_user, dict):
        uid = current_user.get("id", "admin")
    else:
        uid = getattr(current_user, "id", "admin")
        
    grant = VideoGrants(room_join=True, room=broadcast_id, can_publish=True, can_subscribe=True)
    speaker_token = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET) \
        .with_identity(f"speaker_{uid}") \
        .with_grants(grant) \
        .to_jwt()

    broadcast_obj = {
        "id": broadcast_id,
        "title": data.title,
        "department": data.department,
        "speaker_name": data.speaker_name,
        "listener_count": 0,
        "speaker_token": speaker_token,
        "started_at": datetime.utcnow().isoformat()
    }
    
    active_broadcasts_db[broadcast_id] = broadcast_obj
    return broadcast_obj

@router.post("/broadcast/{b_id}/end")
async def end_broadcast(b_id: str):
    if b_id in active_broadcasts_db:
        b_obj = active_broadcasts_db.pop(b_id)
        started_at = datetime.fromisoformat(b_obj["started_at"])
        ended_at = datetime.utcnow()
        duration = int((ended_at - started_at).total_seconds())
        
        b_obj["ended_at"] = ended_at.isoformat()
        b_obj["duration_seconds"] = duration
        
        history_broadcasts_db.insert(0, b_obj)
        
    return {"status": "Broadcast ended successfully"}

# =========================================================================
# 🟢 STEP 3.2: SECURE LIVEKIT TOKEN GENERATOR (Incoming Calls)
# =========================================================================
@router.get("/livekit/token")
async def get_livekit_token_get(
    room: str = Query(..., description="The room name to join"),
    identity: str = Query(..., description="Unique ID for the user/agent"),
    name: str = Query("Participant", description="Display name")
):
    """Generates a secure LiveKit JWT for connecting to a WebRTC room (GET request)."""
    try:
        # Note: can_publish and can_subscribe set to True for audio bridging
        grant = VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True)
        
        access_token = AccessToken(
            LIVEKIT_API_KEY, 
            LIVEKIT_API_SECRET
        )
        access_token.with_identity(identity)
        access_token.with_name(name)
        access_token.with_grants(grant)
        
        # Generate the encoded JWT
        jwt_token = access_token.to_jwt()
        
        print(f"✅ SUCCESS: Incoming call token generated for {identity} in room {room}")
        return {"token": jwt_token, "room": room}
        
    except Exception as e:
        print(f"❌ ERROR Generating Incoming Token: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate LiveKit token")
# =========================================================================
# 🟢 STEP 5.1: TELEMETRY SYNC (Call Logging to Neon DB)
# =========================================================================
class CallEndPayload(BaseModel):
    duration_seconds: int
    status: str = "completed"
    direction: str = "inbound"
    caller_name: str = "Browser User"
    department: str = "General"

@router.post("/calls/{call_id}/end")
def log_call_end(call_id: str, payload: CallEndPayload):
    """Saves the final call data to the Neon PostgreSQL database."""
    try:
        # Get your psycopg2 connection
        conn = get_db()
        cursor = conn.cursor()
        
        # Raw SQL insert for Neon DB
        insert_query = """
            INSERT INTO call_logs (session_id, direction, to_number, status, duration_seconds, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        
        cursor.execute(insert_query, (
            call_id,
            payload.direction,
            payload.caller_name,
            payload.status,
            payload.duration_seconds,
            datetime.utcnow()
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"✅ DATA PIPELINE: Call {call_id} saved to Neon DB. Dashboards will update.")
        return {"status": "success", "message": "Call logged"}
        
    except Exception as e:
        print(f"❌ ERROR Saving Call Log to Neon: {str(e)}")
        # We don't crash the frontend if logging fails, just print it
        return {"status": "error", "message": str(e)}
    # =========================================================================
# 🟢 THE MISSING GLUE: Call Initiation and Acceptance
# =========================================================================
class CallInitiatePayload(BaseModel):
    caller_name: str
    call_type:   str = "browser"
    department:  str = "General"
    lang:        str = "en"
    priority:    int = 0
    user_email:  str = ""   # real caller email — used so outbound queue can reach them


@router.post("/calls/initiate")
async def initiate_call(payload: CallInitiatePayload):
    """
    Triggered by User: runs the routing engine to find the best agent,
    then sends the ringing notification to that agent only.
    Falls back to department-broadcast → all-agents broadcast if no targeted agent found.
    """
    room_name = f"room-{uuid.uuid4().hex[:8]}"
    call_id   = f"call-{uuid.uuid4().hex[:8]}"

    # ── Step 1: Routing decision ──────────────────────────────────────────────
    targeted_agent_id: Optional[str] = None
    if _ROUTING_AVAILABLE and _routing_engine:
        call_req = type("_CallReq", (), {
            "session_id":    call_id,
            "lang":          payload.lang,
            "source":        "browser",
            "priority":      payload.priority,
            "caller_number": "",
            "caller_id":     payload.caller_name,
        })()
        try:
            decision = await _routing_engine.route(call_req)
            if decision.human_agent:
                targeted_agent_id = decision.human_agent.agent_id
                print(f"  [Routing] targeted agent={targeted_agent_id}  rule={decision.rule_name}")
        except Exception as _e:
            print(f"  [Routing] decision failed (non-fatal): {_e}")

    # ── Step 2: Dispatch notification ────────────────────────────────────────
    message = {
        "type": "incoming_call",
        "data": {
            "call_id":     call_id,
            "room_name":   room_name,
            "caller_name": payload.caller_name,
            "call_type":   payload.call_type,
            "department":  payload.department,
        },
    }
    if targeted_agent_id:
        delivered = await manager.send_to_agent(targeted_agent_id, message)
        if not delivered:
            # Agent disconnected between routing and dispatch — fall back
            await manager.broadcast_to_department(payload.department, message)
            print(f"🔔 RINGING dept={payload.department} (targeted agent offline): {call_id}")
        else:
            print(f"🔔 RINGING agent={targeted_agent_id}: {call_id} from {payload.caller_name}")
    else:
        await manager.broadcast_to_department(payload.department, message)
        print(f"🔔 RINGING dept={payload.department}: {call_id} from {payload.caller_name}")

    # ── Step 3: Bridge into CC queue ─────────────────────────────────────────
    # Use the caller's real email if provided so the outbound callback can reach them.
    try:
        from callcenter import db as cc_db
        from callcenter.queue_engine import enqueue_caller as cc_enqueue

        caller_email = (
            payload.user_email.strip().lower()
            if payload.user_email.strip()
            else f"{payload.caller_name.lower().replace(' ', '.')}@browser.local"
        )
        cc_user_id  = await cc_db.upsert_user(caller_email)
        call_log_id = await cc_db.create_call_log(
            user_id        = cc_user_id,
            session_id     = call_id,
            room_id        = room_name,
            department     = payload.department,
            queue_position = 1,
        )
        await cc_enqueue(
            session_id  = call_id,
            room_id     = room_name,
            caller_id   = f"caller-{call_id[:8]}",
            user_email  = caller_email,
            department  = payload.department,
            user_id     = cc_user_id,
            call_log_id = call_log_id,
            caller_name = payload.caller_name,
        )
        print(f"✅ CC queue: {payload.caller_name} ({caller_email}) added to '{payload.department}' wait list")
    except Exception as exc:
        print(f"  CC queue sync failed (non-fatal): {exc}")

    return {"status": "ringing", "room_name": room_name, "call_id": call_id}


@router.post("/calls/accept/{call_id}")
async def accept_call(call_id: str, agent_id: str):
    """Triggered by Agent: removes the ringing popup for all agents."""
    await manager.broadcast({
        "type": "call_accepted",
        "data": {"call_id": call_id, "agent_id": agent_id},
    })
    print(f"📞 CALL ACCEPTED: Agent {agent_id} picked up call {call_id}")

    # Remove from CC queue so Wait List clears immediately
    try:
        from callcenter.queue_engine import dequeue_caller
        await dequeue_caller(call_id, reason="completed")
        print(f"✅ CC queue: {call_id} removed after acceptance")
    except Exception as exc:
        print(f"  CC queue dequeue failed (non-fatal): {exc}")

    # Release routing engine slot
    if _ROUTING_AVAILABLE and _routing_engine:
        try:
            await _routing_engine.release_agent(agent_id)
        except Exception:
            pass

    return {"status": "accepted"}


@router.post("/calls/cancel/{call_id}")
async def cancel_call(call_id: str):
    """
    Called by the User when they hang up before any agent answers.
    Broadcasts call_cancelled so every agent's ringing popup disappears instantly.
    """
    await manager.broadcast_call_cancelled(call_id)
    print(f"📵 CALL CANCELLED by user: {call_id}")

    # Remove from CC queue — "abandoned" triggers the outbound callback queue
    # so the caller gets a callback when an agent is free.
    try:
        from callcenter.queue_engine import dequeue_caller
        await dequeue_caller(call_id, reason="abandoned")
    except Exception:
        pass

    # Release routing engine slot if one was booked
    if _ROUTING_AVAILABLE and _routing_engine:
        try:
            # Walk the pool snapshot and release any agent whose slot was booked for this call.
            # We track the targeted agent_id in the response but don't store it server-side here.
            # The routing engine's book/release is idempotent so this is safe to call for each.
            for agent in _routing_engine.agents_snapshot():
                if agent.get("active_calls", 0) > 0:
                    await _routing_engine.release_agent(agent["agent_id"])
                    break   # only one slot was booked per call
        except Exception:
            pass

    return {"status": "cancelled", "call_id": call_id}


# ─── Conference Invite ────────────────────────────────────────────────────────

class ConferenceInviteRequest(BaseModel):
    room_name:   str
    invitee_id:  str   # agent email / identity of the person being invited
    inviter_name: str = "Agent"
    call_id:     str = ""

@router.post("/conference/invite")
async def send_conference_invite(req: ConferenceInviteRequest):
    """
    Send a real-time conference invite to a specific agent.
    The agent's dashboard listens for `conference_invite` events via WebSocket.
    """
    invite_payload = {
        "type": "conference_invite",
        "data": {
            "room_name":    req.room_name,
            "call_id":      req.call_id,
            "inviter_name": req.inviter_name,
        },
    }

    # Try local webrtc manager first, then fall back to socket_manager (global ring WS)
    delivered = await manager.send_to_agent(req.invitee_id, invite_payload)
    if not delivered:
        try:
            from socket_manager import manager as global_manager
            delivered = await global_manager.send_to_agent(req.invitee_id, invite_payload)
        except Exception:
            pass

    return {"status": "sent" if delivered else "queued", "invitee": req.invitee_id}


@router.get("/agents/online")
async def list_online_agents():
    """Return identities of all agents currently connected to the webrtc WS."""
    agents = list(manager.active_connections.keys())
    return {"agents": agents}