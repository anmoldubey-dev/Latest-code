# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# stt * Streaming speech-to-text module namespace
#   |
#   |----> StreamingTranscriber * Real-time Whisper STT
#           |
#           |----> Exports: StreamingTranscriber
#
# ================================================================
from .transcriber import StreamingTranscriber

__all__ = ["StreamingTranscriber"]
