# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# backend * Core AI pipeline package
#   |
#   |----> core/ * Config, STT, LLM, TTS, VAD modules
#   |
#   |----> livekit/ * LiveKit WebRTC communication layer
#   |
#   |----> llm/ * Gemini and Ollama responders
#   |
#   |----> memory/ * FAISS vector store
#   |
#   |----> services/ * Greeting loader and merger
#   |
#   |----> stt/ * Whisper audio transcriber
#   |
#   |----> tts/ * Piper TTS engine and manager
#   |
#   |----> webrtc/ * DEPRECATED aiortc utilities
#
# ================================================================
