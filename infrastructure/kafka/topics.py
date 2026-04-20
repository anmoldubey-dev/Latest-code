"""Kafka topic constants for Voice AI Core."""

CALL_EVENTS   = "call_events"    # call start/end, routing decisions
TRANSCRIPTS   = "transcripts"    # STT output per turn
AI_RESPONSES  = "ai_responses"   # LLM output per turn
IVR_EVENTS    = "ivr_events"     # IVR classification results

BOOTSTRAP = "localhost:9092"
