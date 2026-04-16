# Minimal Kafka configuration for the call center queue engine.
# Full Kafka config lives in Routing/livekit/kafka/config.py — this is a
# scoped extract containing only what queue_engine.py needs.

import os

KAFKA_BROKERS: list[str] = os.getenv("KAFKA_BROKERS", "localhost:9092").split(",")

# Topic used by queue_engine to persist caller queue events
TOPIC_QUEUE_EVENTS: str = "callcenter_queue_events"

# Consumer group for analytics / general consumers
CG_ANALYTICS: str = "analytics-group"
