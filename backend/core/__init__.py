# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# core * Shared AI model module namespace
#   |
#   |----> config * LANGUAGE_CONFIG BASE_PERSONA constants
#   |
#   |----> state * Shared _m model store dict
#   |
#   |----> stt * Whisper STT transcription wrapper
#   |
#   |----> llm * Gemini + Qwen LLM inference helpers
#   |
#   |----> tts * Piper TTS synthesis and humanizer
#   |
#   |----> vad * AudioBuf multi-gate VAD class
#   |
#   |----> persona * Agent name and system prompt
#
# ================================================================
