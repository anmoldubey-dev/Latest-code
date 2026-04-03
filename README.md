# Voice AI Core

> Production-grade, multilingual Voice AI platform for intelligent call center automation — real-time STT → LLM → TTS pipeline with voice cloning, memory, RAG, and a full admin console.

---

## Description

**Voice AI Core** is a full-stack voice intelligence system built for call center automation. It replaces traditional IVR trees with a conversational AI agent that speaks naturally, understands 21+ languages, remembers customers, and adapts its persona per call.

**The problem it solves:**
- Traditional IVR systems are rigid, frustrating, and language-limited
- Human agents are expensive for high-volume, repetitive queries
- Existing AI assistants lack multilingual support, real-time responsiveness, and voice personalization

**How it works:**
A caller connects via WebSocket. Their audio is VAD-buffered, transcribed by Whisper, understood by a local LLM (Ollama/Gemini fallback), translated if needed, and responded to with a natural synthesized voice — all in under 2 seconds.

---

## Features

- **Real-time STT** — faster-whisper large-v3, adaptive VAD, hallucination filtering, per-language correction loop
- **Dual LLM routing** — Ollama (qwen2.5:7b) as primary, Google Gemini Flash as automatic fallback
- **Multilingual TTS** — Parler TTS for global languages, Indic Parler TTS for Indian languages (21 language voices)
- **Zero-shot Voice Cloning** — Chatterbox TTS (standard / turbo / multilingual modes)
- **Offline Translation** — facebook/m2m100_418M, 100 languages, fully local, no API cost
- **Barge-in / Interruption Detection** — energy spike + keyword detection, 11 languages
- **Multi-layer Memory** — session (in-call), long-term (SQLite customer history), semantic (FAISS RAG)
- **Call Summarization** — Ollama-powered JSON summaries with CRM tags after each call
- **Smart Reply Suggestions** — real-time 3-suggestion engine for human agents
- **Speaker Diarization** — pyannote speaker segmentation
- **NER Extraction** — phones, emails, intents, amounts, locations — regex-based, sub-ms
- **Admin Console** — 14-page React dashboard: monitoring, voice lab, STT diagnostics, memory explorer, translator, analytics
- **Production Logging** — structured colorized logs, rotating JSON files, `@log_execution` decorator with timing

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend API** | Python 3.11, FastAPI, Uvicorn, asyncio |
| **STT** | faster-whisper (CTranslate2), Silero VAD |
| **LLM** | Ollama (qwen2.5:7b), Google Gemini Flash |
| **TTS** | Parler TTS mini-v1.1, ai4bharat/indic-parler-tts |
| **Voice Cloning** | ResembleAI Chatterbox |
| **Translation** | facebook/m2m100_418M (M2M-100) |
| **Diarization** | pyannote/speaker-diarization-3.1 |
| **Memory / RAG** | FAISS, LangChain, HuggingFace all-MiniLM-L6-v2 |
| **Long-term Memory** | SQLite (WAL mode) |
| **NER** | Custom regex engine (zero ML dependency) |
| **Frontend** | React 18, Vite, Tailwind CSS, Recharts |
| **Real-time** | WebSocket (native FastAPI), LiveKit WebRTC |
| **Infra** | Python venv (per-service isolation), Windows batch orchestration |

---

## Architecture

```
                        ┌─────────────────────────────────────────┐
                        │           Admin Console :5173           │
                        │  React 18 + Vite — 14 pages             │
                        │  Dashboard / VoiceLab / Analytics /     │
                        │  MemoryExplorer / Translator / STT Diag │
                        └────────────────┬────────────────────────┘
                                         │ HTTP REST
                        ┌────────────────▼────────────────────────┐
                        │        Backend (Monolith) :8000          │
                        │  FastAPI + WebSocket /ws/call            │
                        │                                          │
                        │  Audio Buffer (VAD) → STT → LLM → TTS   │
                        │                                          │
                        │  ┌──────────┐  ┌──────────┐             │
                        │  │  Memory  │  │ Language │             │
                        │  │ Session  │  │  Router  │             │
                        │  │ LT-SQLite│  │   NER    │             │
                        │  │   FAISS  │  │ Barge-in │             │
                        │  └──────────┘  └──────────┘             │
                        └───┬──────┬──────┬────────┬──────────────┘
                            │      │      │        │
              HTTP  ────────┘      │      │        └────────────────────┐
                                   │      │                              │
         ┌─────────────────────────┘      └──────────────────┐          │
         │                                                    │          │
┌────────▼────────┐  ┌──────────────────┐  ┌────────────────▼─┐  ┌────▼──────────────┐
│  Diarization    │  │   Translator     │  │   Global TTS     │  │  Voice Cloner     │
│  :8001          │  │   :8002          │  │   :8003          │  │  :8005            │
│  pyannote       │  │  M2M-100 (100L)  │  │  Parler mini     │  │  Chatterbox       │
└─────────────────┘  └──────────────────┘  └──────────────────┘  └───────────────────┘
                                                                   ┌───────────────────┐
                                                                   │   Indic TTS :8004 │
                                                                   │  ai4bharat Parler │
                                                                   └───────────────────┘
```

**Call Flow:**
```
Caller → WebSocket → AudioBuf (VAD) → stt_sync (Whisper)
      → _collapse_repetitions → interruption check
      → llm_route_sync (Ollama → Gemini fallback)
      → _humanize_text → tts (Parler :8003/:8004)
      → base64 WAV → Caller
      → session_memory + FAISS persist (async)
```

---

## Project Structure

```
voice-ai-core/
│
├── backend/                        ← FastAPI monolith (root .venv)
│   ├── app.py                      ← Main server, WebSocket routes
│   ├── core/                       ← Config, state, logging, decorators
│   ├── audio/                      ← VAD, buffer, preprocessor, merger
│   ├── speech/
│   │   ├── stt/                    ← Whisper transcriber + feedback loop
│   │   ├── tts_client.py           ← HTTP client → TTS services
│   │   └── voice_persona/          ← Pitch/speed DSP persona engine
│   ├── language/
│   │   ├── llm/                    ← Ollama + Gemini responders + router
│   │   ├── interruption_detector.py
│   │   ├── translator_client.py
│   │   └── ner_extractor.py
│   ├── memory/
│   │   ├── session_memory.py
│   │   ├── long_term_memory.py
│   │   ├── rag_pipeline.py
│   │   └── summarization/          ← Call summarizer + smart suggestions
│   └── agent/                      ← LiveKit session, ai_worker, IVR
│
├── services/                       ← Microservices (each has own .venv)
│   ├── log_utils.py                ← Shared logging for all services
│   ├── diarization_service/        ← pyannote  :8001  (.venv_diarization)
│   ├── translator_service/         ← M2M-100   :8002  (.venv)
│   ├── tts_service/
│   │   ├── global_tts/             ← Parler    :8003  (shared .venv)
│   │   └── indic_tts/              ← Indic     :8004  (shared .venv)
│   └── voice_cloner_service/       ← Chatterbox :8005 (.venv)
│
├── admin-console/                  ← React 18 + Vite dashboard (node_modules)
│   └── src/
│       ├── pages/                  ← 14 pages
│       ├── components/             ← Layout + UI primitives
│       ├── hooks/                  ← usePolling, useServiceHealth
│       └── api/client.js           ← Axios clients for all services
│
├── data/                           ← SQLite DBs (runtime)
├── logs/                           ← Rotating log files
├── services.config                 ← Toggle services on/off
├── start_all.bat                   ← Launch all services
└── start_backend.bat               ← Launch backend only
```

---

## Installation & Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Ollama](https://ollama.ai) running locally with `qwen2.5:7b` pulled
- HuggingFace token (for diarization model only)
- Google Gemini API key (optional fallback)

---

### Virtual Environment Structure

> Each service is isolated in its own venv. Do **not** mix them.

| Component | venv location | Used by |
|---|---|---|
| Backend | `.venv/` (root) | `backend/app.py` |
| Diarization | `services/diarization_service/.venv_diarization/` | server.py |
| Translator | `services/translator_service/.venv/` | app.py |
| Global TTS | `services/tts_service/.venv/` | global_tts/app.py |
| Indic TTS | `services/tts_service/.venv/` | indic_tts/app.py (shared with global) |
| Voice Cloner | `services/voice_cloner_service/.venv/` | server.py |

---

### Step 1 — Clone & set up backend

```bash
git clone https://github.com/your-org/voice-ai-core.git
cd voice-ai-core

# Create root venv for backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Step 2 — Set up each service venv

```bash
# Diarization
cd services/diarization_service
python -m venv .venv_diarization
.venv_diarization\Scripts\activate
pip install -r requirements.txt
deactivate
cd ../..

# Translator
cd services/translator_service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
deactivate
cd ../..

# TTS (shared for both global and indic)
cd services/tts_service
python -m venv .venv
.venv\Scripts\activate
pip install -r global_tts/requirements.txt
deactivate
cd ../..

# Voice Cloner
cd services/voice_cloner_service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
deactivate
cd ../..
```

### Step 3 — Set up Admin Console

```bash
cd admin-console
npm install
cd ..
```

### Step 4 — Configure environment

```bash
# Copy and fill in your keys
cp .env.example .env
```

```env
GEMINI_API_KEY=your_key_here        # optional, used as LLM fallback
HF_TOKEN=your_hf_token              # required for diarization model
OLLAMA_URL=http://localhost:11434/api/chat
LOG_LEVEL=INFO                      # DEBUG | INFO | WARNING | ERROR
LOG_JSON=false                      # true for structured JSON logs
```

### Step 5 — Configure which services to run

Edit `services.config` to enable/disable services:

```ini
LIVEKIT=false
DIARIZATION=true
TRANSLATOR=true
TTS_GLOBAL=true
TTS_INDIC=true
VOICE_CLONER=true
BACKEND=true
```

### Step 6 — Start everything

```bash
# Start all enabled services + backend
start_all.bat

# Or backend only
start_backend.bat

# Admin console (separate terminal)
cd admin-console
npm run dev
```

Services start on:
- Backend → `http://localhost:8000`
- Diarization → `http://localhost:8001`
- Translator → `http://localhost:8002`
- Global TTS → `http://localhost:8003`
- Indic TTS → `http://localhost:8004`
- Voice Cloner → `http://localhost:8005`
- Admin Console → `http://localhost:5173`

---

## Screenshots

Developer Forgot to add on the way

---

## Example Usage

### 1 — WebSocket Call (AI Agent)

Connect a browser or SIP client to `ws://localhost:8000/ws/call` with an init message:

```json
{
  "lang": "hi",
  "llm": "ollama",
  "voice": "Divya (Warm Female)"
}
```

The server responds with a greeting audio (base64 WAV), then enters the call loop — receiving PCM audio chunks and returning AI responses with synthesized speech.

---

### 2 — Translate text via API

```bash
curl -X POST http://localhost:8002/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, how can I help you?", "src_lang": "en", "tgt_lang": "hi"}'
```

```json
{
  "translated": "नमस्ते, मैं आपकी कैसे मदद कर सकता हूँ?",
  "src_lang": "en",
  "tgt_lang": "hi"
}
```

---

### 3 — Generate speech via TTS

```bash
curl -X POST http://localhost:8003/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your order has been confirmed.",
    "voice_name": "Emma (Warm Female)",
    "emotion": "friendly",
    "language": "English"
  }'
```

Returns JSON with filename, URL, duration, and generation time. Audio served at `http://localhost:8003/audio/{filename}`.

---

## Logging

All services use structured logging with timing:

```
[START] app.http_translate  trace=a3f9c1b2  at=10:15:32
[END]   app.http_translate  trace=a3f9c1b2  elapsed=0.230s
```

- Log level: set `LOG_LEVEL=DEBUG` in `.env`
- JSON output: set `LOG_JSON=true`
- Log files: `logs/voice_ai.log` (backend), `logs/services.log` (microservices) — 10 MB rotating, 5 backups
- Health endpoints throttled to log once per 60 seconds

---

## License

Apache 2.0 — see [LICENSE](LICENSE)
