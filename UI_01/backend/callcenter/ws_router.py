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

from .event_hub import event_hub

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
    queue                          = await event_hub.subscribe(replay_history=True)
    active_filter: Optional[Set[str]] = None
    logger.info("[WS] client connected  total=%d", event_hub.subscriber_count)

    async def _sender():
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
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
        nonlocal active_filter
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
