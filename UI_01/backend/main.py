# ======================== Main ========================
# Main -> FastAPI app entry point. Registers CORS middleware and mounts all route modules under /api.
# Phase 1/2 additions:
#   - asynccontextmanager lifespan starts/stops all Call Center background services
#   - cc_router  (/api/cc/*)     - Call Center v3.0 endpoints
#   - ws_router  (/api/ws/*)     - Real-time event WebSocket + SSE
#   - ivr_router (/api/ivr/*)    - AI IVR (optional, graceful fallback if Piper/Gemini absent)
# ======================================================================

# ---------------------------------------------------------------
# SECTION: IMPORTS
# ---------------------------------------------------------------
import sys, os
import json
from contextlib import asynccontextmanager
from groq import Groq
from pydantic import BaseModel
from socket_manager import manager
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, admin, superuser, home, analytics, user, webrtc, email
from routes.agent import router as agent_router

# ── Call Center v3.0 ──────────────────────────────────────────────────────────
from callcenter.api      import cc_router
from callcenter.ws_router import ws_router
from callcenter          import db as callcenter_db
from callcenter.outbound_engine  import start_outbound_monitor, stop_outbound_monitor
from callcenter.email_scheduler  import start_email_scheduler, stop_email_scheduler
from callcenter.queue_engine     import start_kafka as start_queue_kafka, stop_kafka as stop_queue_kafka
from callcenter.business_hours   import load_config_from_db
from callcenter.email_service    import load_email_config_from_db

# ── Scheduling service ───────────────────────────────────────────────────────
try:
    from scheduling.api import scheduling_router, scheduling_service
    _SCHEDULING_AVAILABLE = True
except ImportError as _sched_err:
    _SCHEDULING_AVAILABLE = False
    scheduling_router    = None
    scheduling_service   = None
    print(f"  Scheduling module not loaded: {_sched_err}")

# ── Routing engine ────────────────────────────────────────────────────────────
try:
    from routing_engine.api import routing_router
    _ROUTING_AVAILABLE = True
except ImportError as _route_err:
    _ROUTING_AVAILABLE = False
    routing_router = None
    print(f"  Routing engine not loaded: {_route_err}")

# ── Integration service ───────────────────────────────────────────────────────
try:
    from integration.router  import integration_router
    from integration.service import integration_service
    _INTEGRATION_AVAILABLE = True
except ImportError as _intg_err:
    _INTEGRATION_AVAILABLE = False
    integration_router  = None
    integration_service = None
    print(f"  Integration module not loaded: {_intg_err}")

# ── AI Assist ─────────────────────────────────────────────────────────────────
try:
    from ai_assist.controller import ai_assist_router
    _AI_ASSIST_AVAILABLE = True
except ImportError as _ai_err:
    _AI_ASSIST_AVAILABLE = False
    ai_assist_router = None
    print(f"  AI Assist module not loaded: {_ai_err}")

# ── IVR (optional - graceful fallback if Piper/Gemini not installed) ─────────
try:
    from routing_ivr.ivr_agent import ivr_router
    _IVR_AVAILABLE = True
except ImportError as _ivr_err:
    _IVR_AVAILABLE = False
    ivr_router     = None
    print(f"  IVR module not loaded (optional): {_ivr_err}")

# ---------------------------------------------------------------
# SECTION: GROQ AI SETUP
# ---------------------------------------------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
groq_client  = Groq(api_key=GROQ_API_KEY)


# ---------------------------------------------------------------
# SECTION: LIFESPAN  (Call Center background services)
# ---------------------------------------------------------------
@asynccontextmanager
async def app_lifespan(_app: FastAPI):
    """
    Start all Call Center background services on startup.
    Each service is wrapped in try/except so a single failure never
    brings down the main Dashboard API.
    """
    # 1. Call Center DB - create tables + seed admin_config defaults
    try:
        await callcenter_db.init_db()
        await load_config_from_db()
        await load_email_config_from_db()
        print("[+] Call Center DB initialized (cc_callers, cc_sessions, agent_states, outbound_queue, admin_config)")
    except Exception as exc:
        print(f"  Call Center DB init failed (non-fatal): {exc}")

    # 2. Outbound monitor (polls every 5s for pending callbacks)
    try:
        await start_outbound_monitor()
        print("[+] Outbound monitor started")
    except Exception as exc:
        print(f"  Outbound monitor failed to start (non-fatal): {exc}")

    # 3. Email scheduler (hourly 4-hour missed-call follow-ups)
    try:
        await start_email_scheduler()
        print("[+] Email scheduler started")
    except Exception as exc:
        print(f"  Email scheduler failed to start (non-fatal): {exc}")

    # 4. Queue Kafka (in-memory fallback auto-activates if Kafka is down)
    try:
        await start_queue_kafka()
        print("[+] Queue Engine Kafka started")
    except Exception as exc:
        print(f"  Queue Engine Kafka failed (in-memory fallback active): {exc}")

    # 6. Scheduling service (SQLite-backed call scheduler)
    if _SCHEDULING_AVAILABLE and scheduling_service:
        try:
            await scheduling_service.start()
            print("[+] Scheduling service started")
        except Exception as exc:
            print(f"  Scheduling service failed to start (non-fatal): {exc}")

    # 7. Integration service (webhook delivery + TTL cleanup)
    if _INTEGRATION_AVAILABLE and integration_service:
        try:
            await integration_service.start()
            print("[+] Integration service started")
        except Exception as exc:
            print(f"  Integration service failed to start (non-fatal): {exc}")

    yield   # ── application is running ────────────────────────────────────────

    # ── Shutdown (reverse order) ──────────────────────────────────────────────
    if _INTEGRATION_AVAILABLE and integration_service:
        try:
            await integration_service.stop()
        except Exception:
            pass
    if _SCHEDULING_AVAILABLE and scheduling_service:
        try:
            await scheduling_service.stop()
        except Exception:
            pass
    await stop_queue_kafka()
    await stop_outbound_monitor()
    await stop_email_scheduler()
    await callcenter_db.close_db()
    print("  All Call Center services stopped")


# ---------------------------------------------------------------
# SECTION: APP INIT
# ---------------------------------------------------------------
app = FastAPI(
    title    = "SR Comsoft AI API",
    version  = "2.0.0",
    lifespan = app_lifespan,
)

# ---------------------------------------------------------------
# SECTION: MIDDLEWARE
# ---------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------
# SECTION: ROUTERS  (existing - untouched)
# ---------------------------------------------------------------
app.include_router(auth.router,       prefix="/api")
app.include_router(admin.router,      prefix="/api")
app.include_router(superuser.router,  prefix="/api")
app.include_router(home.router,       prefix="/api")
app.include_router(analytics.router,  prefix="/api")
app.include_router(user.router,       prefix="/api")
app.include_router(agent_router)
app.include_router(webrtc.router)
app.include_router(email.router,      prefix="/api")

# ---------------------------------------------------------------
# SECTION: ROUTERS  (new - Call Center v3.0)
# ---------------------------------------------------------------
app.include_router(cc_router,  prefix="/api")   # /api/cc/*
app.include_router(ws_router,  prefix="/api")   # /api/ws/events  /api/ws/stream

if _IVR_AVAILABLE and ivr_router:
    app.include_router(ivr_router, prefix="/api")  # /api/ivr/*
    print("[+] IVR routing module enabled - /api/ivr/process is live")

# ---------------------------------------------------------------
# SECTION: ROUTERS  (Phase 2 - Scheduling / Routing / Integration / AI)
# ---------------------------------------------------------------
if _SCHEDULING_AVAILABLE and scheduling_router:
    app.include_router(scheduling_router, prefix="/api")   # /api/scheduling/*
    print("[+] Scheduling router mounted - /api/scheduling/jobs")

if _ROUTING_AVAILABLE and routing_router:
    app.include_router(routing_router, prefix="/api")      # /api/routing/*
    print("[+] Routing engine router mounted - /api/routing/rules")

if _INTEGRATION_AVAILABLE and integration_router:
    app.include_router(integration_router, prefix="/api")  # /api/call/*, /api/webhook/*
    print("[+] Integration router mounted - /api/call/start")

if _AI_ASSIST_AVAILABLE and ai_assist_router:
    app.include_router(ai_assist_router, prefix="/api")    # /api/ai/*
    print("[+] AI Assist router mounted - /api/ai/join")

# ---------------------------------------------------------------
# SECTION: FEATURE 1 - LIVE CALL AI SUGGESTIONS
# ---------------------------------------------------------------
class TranscriptLine(BaseModel):
    text: str

@app.post("/api/ai-suggest")
async def get_ai_suggestion(payload: TranscriptLine):
    system_prompt = """
    You are an expert customer service AI assistant for SR Comsoft.
    Analyze the customer's text.
    1. Determine the sentiment (Must be exactly one of: ANGRY, NEUTRAL, HAPPY).
    2. Provide a short, 1-sentence suggestion for the agent to reply.
    You MUST respond ONLY in valid JSON format exactly like this:
    {"sentiment": "ANGRY", "suggestion": "Your suggestion here."}
    """
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": payload.text},
            ],
            model           = "llama-3.1-8b-instant",
            response_format = {"type": "json_object"},
            temperature     = 0.3,
        )
        return json.loads(chat_completion.choices[0].message.content)
    except Exception as exc:
        print(f"[X] Groq Suggest Error: {exc}")
        return {"sentiment": "NEUTRAL", "suggestion": "Processing conversation..."}


# ---------------------------------------------------------------
# SECTION: FEATURE 2 - SMART CRM ASSISTANT (GROQ POWERED)
# ---------------------------------------------------------------
class AiChatRequest(BaseModel):
    phone:    str
    question: str

@app.post("/api/ai-chat")
async def ai_chat_endpoint(request: AiChatRequest):
    print(f"[AI] [AI-CHAT] Query for {request.phone}: {request.question}")
    context = f"""
    Customer Phone: {request.phone}
    Business Value: ₹14,500
    History: Resolved Service Request, Pending Billing Issue.
    """
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role":    "system",
                    "content": f"You are a helpful CRM assistant. Answer using this context: {context}. Keep it short and professional.",
                },
                {"role": "user", "content": request.question},
            ],
            model       = "llama-3.1-8b-instant",
            temperature = 0.2,
        )
        return {"answer": chat_completion.choices[0].message.content}
    except Exception as exc:
        print(f"[X] Groq Chat Error: {exc}")
        return {"answer": "AI engine is busy. Please try in a moment."}


# ---------------------------------------------------------------
# SECTION: BASE ROUTES
# ---------------------------------------------------------------
@app.get("/")
def root():
    return {"status": "SR Comsoft AI API running [+]"}

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "SR Comsoft AI API"}


class CallInitiationRequest(BaseModel):
    caller_name:  str
    phone_number: str  = ""
    department:   str  = "General"
    call_type:    str  = "browser"

@app.websocket("/ws/agents/{agent_id}")
async def websocket_agent_endpoint(websocket: WebSocket, agent_id: str):
    """Allows agent dashboards to connect and listen for incoming calls."""
    await manager.connect(agent_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(agent_id)

@app.post("/api/calls/initiate")
async def initiate_call(req: CallInitiationRequest):
    """Triggered by the User Dashboard to start the global ring."""
    import uuid
    call_id   = str(uuid.uuid4())
    room_name = f"room-{call_id}"
    call_data = {
        "call_id":      call_id,
        "caller_name":  req.caller_name,
        "phone_number": req.phone_number,
        "department":   req.department,
        "call_type":    req.call_type,
        "room_name":    room_name,
    }
    await manager.broadcast_to_department(req.department, {"type": "incoming_call", "data": call_data})

    # Bridge into CC queue so QueueMonitor shows this caller
    try:
        synthetic_email = f"{req.caller_name.lower().replace(' ', '.')}@browser.local"
        user_id = await callcenter_db.upsert_user(synthetic_email)
        call_log_id = await callcenter_db.create_call_log(
            user_id        = user_id,
            session_id     = call_id,
            room_id        = room_name,
            department     = req.department,
            queue_position = 1,
        )
        from callcenter.queue_engine import enqueue_caller
        await enqueue_caller(
            session_id  = call_id,
            room_id     = room_name,
            caller_id   = f"caller-{call_id[:8]}",
            user_email  = synthetic_email,
            department  = req.department,
            user_id     = user_id,
            call_log_id = call_log_id,
            caller_name = req.caller_name,
        )
    except Exception as exc:
        print(f"  CC queue sync failed (non-fatal): {exc}")

    return {"status": "ringing", "call_id": call_id, "room_name": room_name}

@app.post("/api/calls/accept/{call_id}")
async def accept_call(call_id: str, agent_id: str):
    """Triggered when the first agent clicks Accept."""
    await manager.broadcast_call_accepted(call_id, agent_id)
    # Remove from CC queue so Wait List clears immediately
    try:
        from callcenter.queue_engine import dequeue_caller
        await dequeue_caller(call_id, reason="accepted")
    except Exception:
        pass
    return {"status": "accepted", "room_name": f"room-{call_id}"}
