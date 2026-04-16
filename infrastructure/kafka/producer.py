"""
Async Kafka producer for Voice AI Core.
Usage:
    from infrastructure.kafka.producer import publish
    await publish("call_events", {"session_id": "...", "event": "call_start", ...})
"""
import json
import logging
from aiokafka import AIOKafkaProducer
from .topics import BOOTSTRAP

logger = logging.getLogger("callcenter.kafka")
_producer: AIOKafkaProducer | None = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=BOOTSTRAP,
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        await _producer.start()
    return _producer


async def publish(topic: str, payload: dict) -> None:
    try:
        producer = await get_producer()
        await producer.send_and_wait(topic, payload)
    except Exception as exc:
        logger.warning("[Kafka] publish failed topic=%s: %s", topic, exc)


async def close() -> None:
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None
