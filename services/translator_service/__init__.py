# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# translator * Real-time bidirectional translation microservice
#   |
#   |----> app * FastAPI app on port 9000
#   |
#   |----> stt/ * StreamingTranscriber real-time STT
#   |
#   |----> translation/ * TranslatorEngine M2M-100 NMT
#   |
#   |----> tts/ * PiperTTSEngine async speech output
#   |
#   |----> streaming/ * StreamController STT-NMT-TTS pipeline
#
# Run: uvicorn translator.app:app --port 9000
#
# ================================================================
