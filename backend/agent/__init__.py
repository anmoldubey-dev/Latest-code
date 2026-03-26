# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# livekit * LiveKit AI communication layer
#   |
#   |----> token_service * JWT room token issuer
#   |
#   |----> audio_source * TtsAudioSource outbound track
#   |
#   |----> livekit_session * Per-call session container
#   |
#   |----> session_manager * Thread-safe session registry
#   |
#   |----> ai_worker * LiveKit AI worker entry point
#           |
#           |----> livekit_router * FastAPI router /livekit/*
#
# ================================================================
"""
backend/livekit
──────────────────────────────────────────────────────────────────────────────
LiveKit-based communication layer — replaces the old aiortc WebRTC layer.

Integration (two-line addition to backend/app.py):
    from backend.agent import livekit_router
    app.include_router(livekit_router)

Endpoints:
    GET  /livekit/token   — issue JWT for browser + spawn AI worker task
    GET  /livekit/health  — confirm LiveKit server reachable

Call flow:
    Browser → GET /livekit/token?lang=hi&llm=gemini&voice=Angela
    Backend → spawn ai_worker_task(room_id) → return { token, url, room }
    Browser → LiveKit SDK room.connect(url, token)
    Worker  → LiveKit room.connect(url, worker_token) → subscribe mic track
    Worker  → VAD → STT → LLM → TTS → publish audio track back to room
    Browser ← receives audio track + data messages (transcript, response …)

Control channel (LiveKit DataChannel — no extra WebSocket needed):
    Browser → Worker : { type: "interrupt" } | { type: "hangup" }
    Worker  → Browser: { type: "greeting" }  | { type: "transcript" }
                     | { type: "response" }  | { type: "barge_in" }
                     | { type: "error" }     | { type: "hangup" }
"""

from .ai_worker import livekit_router

__all__ = ["livekit_router"]
