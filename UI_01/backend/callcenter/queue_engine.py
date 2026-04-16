# Queue engine — Kafka-backed caller queue with in-memory fallback.
# Adapted from Routing/livekit/callcenter/queue_engine.py
# Key changes:
#   - kafka imports now come from local kafka_config.py and schemas.py
#   - _send_tts_data_message import is optional (try/except already present)

import asyncio
import json
import logging
import os
import time
from collections import deque
from typing import Optional

from . import db
from .email_service import send_abandoned_call_email
from .kafka_config import KAFKA_BROKERS, TOPIC_QUEUE_EVENTS
from .schemas import QueueCallEvent

logger = logging.getLogger("callcenter.queue_engine")

try:
    from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
    _AIOKAFKA_AVAILABLE = True
except ImportError:
    _AIOKAFKA_AVAILABLE = False
    logger.warning("[QueueEngine] aiokafka not installed — using in-memory queue only.")

# In-memory view (synchronized by Kafka when available)
_department_queues: dict[str, deque] = {}
_WAIT_PER_CALLER_SEC = 300  # fallback; overridden by admin_config

# Kafka singletons
_kafka_producer: Optional["AIOKafkaProducer"] = None
_kafka_consumer: Optional["AIOKafkaConsumer"] = None
_kafka_active:   bool                         = False
_consumer_task:  Optional[asyncio.Task]       = None
_started:        bool                         = False


async def start_kafka():
    """Connect Kafka producer/consumer on startup. Fails silently."""
    global _kafka_producer, _kafka_consumer, _kafka_active, _consumer_task, _started
    if _started or not _AIOKAFKA_AVAILABLE:
        return
    _started = True

    try:
        _kafka_producer = AIOKafkaProducer(
            bootstrap_servers    = KAFKA_BROKERS,
            value_serializer     = lambda v: json.dumps(v).encode("utf-8"),
            key_serializer       = lambda k: k.encode("utf-8") if isinstance(k, str) else k,
            acks                 = "all",
            enable_idempotence   = True,
        )
        await asyncio.wait_for(_kafka_producer.start(), timeout=10.0)

        _kafka_consumer = AIOKafkaConsumer(
            TOPIC_QUEUE_EVENTS,
            bootstrap_servers  = KAFKA_BROKERS,
            group_id           = "callcenter-queue-engine",
            auto_offset_reset  = "earliest",
            value_deserializer = lambda v: json.loads(v.decode("utf-8")),
        )
        await asyncio.wait_for(_kafka_consumer.start(), timeout=10.0)
        _kafka_active   = True
        _consumer_task  = asyncio.create_task(_kafka_consumer_loop())
        logger.info("[QueueEngine] Kafka connected")
    except Exception as exc:
        logger.warning("[QueueEngine] Kafka unavailable (%s) — in-memory fallback active", exc)
        _kafka_active = False


async def stop_kafka():
    global _kafka_producer, _kafka_consumer, _kafka_active, _consumer_task, _started
    _kafka_active = False
    _started      = False
    if _consumer_task:
        _consumer_task.cancel()
    if _kafka_consumer:
        await _kafka_consumer.stop()
    if _kafka_producer:
        await _kafka_producer.stop()


async def _kafka_consumer_loop():
    try:
        async for msg in _kafka_consumer:
            try:
                event = QueueCallEvent(**msg.value)
                if event.event_type == "enqueue":
                    _apply_enqueue_event(event)
                else:
                    _apply_dequeue_event(event.session_id)
            except Exception as exc:
                logger.error("[QueueEngine] Sync error: %s", exc)
    except Exception:
        pass


def _apply_enqueue_event(event: QueueCallEvent):
    _ensure_dept(event.department)
    queue = _department_queues[event.department]
    if any(e["session_id"] == event.session_id for e in queue):
        return

    queue.append({
        "session_id":    event.session_id,
        "room_id":       event.room_id,
        "caller_id":     event.caller_id,
        "user_email":    event.user_email,
        "department":    event.department,
        "joined_at":     event.joined_at,
        "countdown_task": None,
        "state":         "queued",
        "call_log_id":   event.call_log_id,
        "user_id":       event.user_id,
        "skip_outbound": event.skip_outbound,
    })


def _apply_dequeue_event(session_id: str):
    for dept, queue in _department_queues.items():
        _department_queues[dept] = deque(
            [e for e in queue if e["session_id"] != session_id]
        )
        for e in queue:
            if e["session_id"] == session_id and e.get("countdown_task"):
                e["countdown_task"].cancel()


async def _publish_event(event_type: str, data: dict):
    if not _kafka_active:
        return
    try:
        evt = QueueCallEvent(event_type=event_type, **data)
        await _kafka_producer.send_and_wait(
            TOPIC_QUEUE_EVENTS,
            value=evt.model_dump(),
            key=evt.session_id,
        )
    except Exception as exc:
        logger.error("[QueueEngine] Publish error: %s", exc)


def _ensure_dept(department: str):
    if department not in _department_queues:
        _department_queues[department] = deque()


async def _dynamic_wait_sec(_department: str, position: int) -> int:
    """Wait time = position × base_wait_per_slot (set by superuser via avg_resolution_seconds)."""
    try:
        base = int(await db.get_config("avg_resolution_seconds") or _WAIT_PER_CALLER_SEC)
        return position * base
    except Exception:
        return position * _WAIT_PER_CALLER_SEC


async def enqueue_caller(session_id: str, room_id: str, caller_id: str,
                          user_email: str, department: str,
                          user_id: int, call_log_id: int,
                          skip_outbound: bool = False,
                          caller_name: str = "") -> dict:
    _ensure_dept(department)
    queue     = _department_queues[department]
    pos       = len(queue) + 1
    joined_at = time.time()

    await _publish_event("enqueue", {
        "session_id":    session_id,
        "room_id":       room_id,
        "caller_id":     caller_id,
        "user_email":    user_email,
        "department":    department,
        "joined_at":     joined_at,
        "call_log_id":   call_log_id,
        "user_id":       user_id,
        "skip_outbound": skip_outbound,
    })

    # Local enqueue (also applied via Kafka consumer loop when Kafka is active)
    _ensure_dept(department)
    if not any(e["session_id"] == session_id for e in _department_queues[department]):
        _department_queues[department].append({
            "session_id":    session_id,
            "room_id":       room_id,
            "caller_id":     caller_id,
            "user_email":    user_email,
            "caller_name":   caller_name or user_email.split("@")[0],
            "department":    department,
            "joined_at":     joined_at,
            "countdown_task": None,
            "state":         "queued",
            "call_log_id":   call_log_id,
            "user_id":       user_id,
            "skip_outbound": skip_outbound,
        })

    asyncio.create_task(_countdown_loop(session_id, room_id, department))

    wait_secs = await _dynamic_wait_sec(department, pos)
    mins      = max(1, wait_secs // 60)
    return {
        "position":     pos,
        "wait_seconds": wait_secs,
        "wait_message": (
            f"Your waiting position is {pos}. "
            f"Estimated wait time is {mins} minute{'s' if mins != 1 else ''}."
        ),
    }


async def dequeue_caller(session_id: str,
                          reason: str = "completed") -> Optional[dict]:
    removed = find_caller(session_id)
    if not removed:
        return None

    await _publish_event("dequeue", {"session_id": session_id, "reason": reason})
    wait_sec = int(time.time() - removed["joined_at"])

    if reason == "abandoned":
        await db.update_call_log_status(
            session_id, "abandoned", wait_seconds=wait_sec
        )
        if not removed.get("skip_outbound"):
            await db.add_to_outbound_queue(
                removed["call_log_id"],
                removed["user_email"],
                removed["department"],
            )
            asyncio.create_task(
                send_abandoned_call_email(
                    removed["user_email"], removed["department"]
                )
            )
    else:
        await db.update_call_log_status(
            session_id, "completed", wait_seconds=wait_sec
        )
    return removed


async def pop_caller(session_id: str) -> Optional[dict]:
    removed = find_caller(session_id)
    if removed:
        await _publish_event("pop", {"session_id": session_id})
        # Remove from local queue immediately
        _apply_dequeue_event(session_id)
    return removed


async def get_queue_for_department(department: str) -> list[dict]:
    _ensure_dept(department)
    return [
        {
            "session_id":  e["session_id"],
            "room_id":     e["room_id"],
            "position":    i + 1,
            "user_email":  e.get("user_email", ""),
            "caller_name": e.get("caller_name") or e.get("user_email", "").split("@")[0],
            "department":  e.get("department", department),
        }
        for i, e in enumerate(_department_queues[department])
    ]


async def get_all_queues() -> dict:
    return {
        dept: await get_queue_for_department(dept)
        for dept in _department_queues
    }


def get_caller_position(session_id: str) -> tuple[int, int]:
    for dept, q in _department_queues.items():
        for i, e in enumerate(q):
            if e["session_id"] == session_id:
                return i + 1, (i + 1) * _WAIT_PER_CALLER_SEC
    return 0, 0


def find_caller(session_id: str) -> Optional[dict]:
    for q in _department_queues.values():
        for e in q:
            if e["session_id"] == session_id:
                return e
    return None


async def _deliver_tts_to_room(room_name: str, text: str):
    """
    Synthesise text with Piper → WAV bytes, then push it to every participant
    in the LiveKit room via the server-side SendData API.
    Falls back to sending raw text (topic: tts_queue_text) if Piper fails so
    the browser can speak it with window.speechSynthesis.
    """
    wav_bytes: Optional[bytes] = None
    try:
        from routing_ivr.tts_engine import synthesize
        wav_bytes = await synthesize(text)
    except Exception as exc:
        logger.warning("[TTS] Piper synthesis failed: %s", exc)

    api_key    = os.getenv("LIVEKIT_API_KEY",    "devkey")
    api_secret = os.getenv("LIVEKIT_API_SECRET", "devsecret")
    lk_url     = os.getenv("LIVEKIT_URL", "ws://localhost:7880")
    http_url   = lk_url.replace("wss://", "https://").replace("ws://", "http://")

    # livekit-api 0.7.1 has no __aenter__/__aexit__ — use try/finally + aclose()
    from livekit.api import LiveKitAPI
    from livekit.protocol.room import SendDataRequest

    lk = LiveKitAPI(http_url, api_key, api_secret)
    try:
        if wav_bytes:
            # Send synthesised audio — browser plays it as audio/wav
            await lk.room.send_data(
                SendDataRequest(room=room_name, data=wav_bytes, topic="tts_queue_audio")
            )
            logger.info("[TTS] sent WAV (%d bytes) to room %s", len(wav_bytes), room_name)
        else:
            # Fallback: send text — browser speaks it with Web Speech API
            await lk.room.send_data(
                SendDataRequest(
                    room=room_name,
                    data=json.dumps({"text": text}).encode(),
                    topic="tts_queue_text",
                )
            )
            logger.info("[TTS] sent text fallback to room %s", room_name)
    except Exception as exc:
        logger.warning("[TTS] LiveKit send_data failed for room %s: %s", room_name, exc)
    finally:
        await lk.aclose()


async def _countdown_loop(session_id: str, room_name: str, department: str):
    """
    Periodically announce queue position + wait time to the caller.
    Uses Piper TTS → WAV bytes sent via LiveKit SendData API.
    Falls back to text message for browser Web Speech API if Piper is unavailable.
    """
    await asyncio.sleep(3)  # give the caller time to fully connect

    while find_caller(session_id):
        pos, _ = get_caller_position(session_id)
        if pos == 0:
            break

        entry     = find_caller(session_id)
        dept      = entry["department"] if entry else ""
        wait      = await _dynamic_wait_sec(dept, pos) if dept else pos * _WAIT_PER_CALLER_SEC
        wait_mins = max(1, wait // 60)

        try:
            template = (
                await db.get_config("tts_queue_message")
                or "Your waiting position is {pos}. Estimated wait time is {wait} minutes."
            )
            msg = template.replace("{pos}", str(pos)).replace("{wait}", str(wait_mins))
        except Exception:
            msg = (
                f"Your waiting position is {pos}. "
                f"Estimated wait time is {wait_mins} minute{'s' if wait_mins != 1 else ''}."
            )

        await _deliver_tts_to_room(room_name, msg)

        try:
            interval = int(await db.get_config("tts_interval_seconds") or 60)
        except Exception:
            interval = 60
        await asyncio.sleep(max(10, interval))


def is_kafka_queue_active() -> bool:
    return _kafka_active
