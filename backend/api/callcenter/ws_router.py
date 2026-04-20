# WebSocket / SSE router for call-center real-time event stream.
# Adapted from Routing/livekit/websocket/api.py
# Mounted at /api/ws/* in main.py

import asyncio
import json
import logging
import time
from typing import Any, Dict, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from .event_hub import event_hub, register_user_online, unregister_user_online

logger    = logging.getLogger("callcenter.ws_router")
ws_router = APIRouter(prefix="/ws", tags=["websocket"])


@ws_router.websocket("/events")
async def ws_events(websocket: WebSocket):
    """
    Full-duplex WebSocket stream of call-center events.
    Replays last 100 events to new connections so the agent
    dashboard catches up immediately on load.
    """
    await websocket.accept()
    queue                             = await event_hub.subscribe(replay_history=True)
    active_filter: Optional[Set[str]] = None
    # [Direct Call] Track which user email this WS connection belongs to (set via user_register msg)
    conn_user_email: Optional[str]    = None
    logger.info("[WS] client connected  total=%d", event_hub.subscriber_count)

    async def _sender():
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
                # [Direct Call] Skip events that are targeted to a specific user that isn't us.
                # Events without target_email are broadcast to everyone as before.
                target = event.get("target_email")
                if target and target != conn_user_email:
                    continue
                if active_filter and event.get("type") not in active_filter:
                    continue
                await websocket.send_text(json.dumps(event))
            except asyncio.TimeoutError:
                try:
                    await websocket.send_text(
                        json.dumps({"type": "ping", "ts": time.time()})
                    )
                except Exception:
                    return
            except Exception:
                return

    async def _receiver():
        nonlocal active_filter, conn_user_email
        while True:
            try:
                data  = await websocket.receive_text()
                msg   = json.loads(data)
                mtype = msg.get("type", "")
                if mtype == "ping":
                    await websocket.send_text(
                        json.dumps({"type": "pong", "ts": time.time()})
                    )
                elif mtype == "subscribe":
                    filters = msg.get("filter", [])
                    active_filter = set(filters) if filters else None
                elif mtype == "unsubscribe":
                    active_filter = None
                elif mtype == "user_register":
                    # [Direct Call] User dashboard registers its email so we can:
                    # 1. Mark the user as online in the presence dict
                    # 2. Route incoming_direct_call events only to their connection
                    email = msg.get("email", "").strip().lower()
                    if email:
                        # Unregister old email if reconnecting with different one
                        if conn_user_email and conn_user_email != email:
                            unregister_user_online(conn_user_email)
                        conn_user_email = email
                        register_user_online(email)
                        logger.info("[WS] [Direct Call] user registered online: %s", email)
            except WebSocketDisconnect:
                return
            except Exception:
                return

    try:
        sender_task   = asyncio.create_task(_sender())
        receiver_task = asyncio.create_task(_receiver())
        done, pending = await asyncio.wait(
            [sender_task, receiver_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("[WS] connection error: %s", exc)
    finally:
        await event_hub.unsubscribe(queue)
        # [Direct Call] Remove user from online presence when their WS disconnects
        if conn_user_email:
            unregister_user_online(conn_user_email)
            logger.info("[WS] [Direct Call] user went offline: %s", conn_user_email)
        logger.info("[WS] client disconnected  total=%d", event_hub.subscriber_count)


@ws_router.get("/stream")
async def sse_stream():
    """SSE fallback for clients that cannot use WebSocket."""
    async def _generator():
        q = await event_hub.subscribe(replay_history=False)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type':'ping','ts':time.time()})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await event_hub.unsubscribe(q)

    return StreamingResponse(
        _generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@ws_router.get("/history")
async def get_history(n: int = 50):
    events = list(event_hub._history)
    return {
        "events":         events[-n:] if n < len(events) else events,
        "count":          min(n, len(events)),
        "total_history":  len(events),
        "timestamp":      time.time(),
    }


@ws_router.get("/stats")
async def hub_stats():
    return {**event_hub.stats(), "timestamp": time.time()}


@ws_router.post("/publish")
async def manual_publish(event: Dict[str, Any]):
    """Dev/testing only — manually inject an event into the hub."""
    if "type" not in event:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="event.type is required")
    await event_hub.publish(event)
    return {"status": "published", "event_type": event["type"]}
