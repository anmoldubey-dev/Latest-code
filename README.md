# Voice AI Core

> Production-grade, multilingual Voice AI platform for intelligent call center automation — real-time STT → LLM → TTS pipeline with voice cloning, RAG memory, HAUP RAG system, and a 14-page admin console.

---

## Description

**Voice AI Core** is a full-stack voice intelligence system built for call center automation. It replaces traditional IVR trees with a conversational AI agent that speaks naturally, understands 21+ languages, remembers customers, and adapts its voice persona per call.

**The problem it solves:**
- Traditional IVR systems are rigid, frustrating, and language-limited
- Human agents are expensive for high-volume, repetitive queries
- Existing AI assistants lack multilingual support, real-time responsiveness, and voice personalization

**How it works:**
A caller connects via WebSocket. Their audio is VAD-buffered, transcribed by Whisper, understood by a local LLM (Ollama/Gemini fallback), translated if needed, and responded to with a natural synthesized voice — all in under 2 seconds.

---

## Features

- **Real-time STT** — faster-whisper (configurable: tiny → large-v3), Silero VAD, hallucination filtering, adaptive repetition collapsing
- **Dual LLM routing** — Ollama (qwen2.5:7b) primary, Google Gemini Flash automatic fallback
- **Multilingual TTS** — Parler TTS mini-v1.1 for global languages, ai4bharat Indic Parler TTS for Indian languages (21 voices)
- **Zero-shot Voice Cloning** — ResembleAI Chatterbox (standard / turbo / multilingual modes)
- **Offline Translation** — facebook/m2m100_418M, 100 languages, fully local, no API cost
- **Barge-in / Interruption Detection** — energy spike + keyword detection in 11 languages
- **HAUP RAG System** — dedicated RAG engine with session analytics, vector store, forward/reverse/graph cores, configurable table search (users, conversation_turns, agents)
- **Smart RAG (inline)** — optional live RAG injection into every LLM call during active calls
- **Multi-layer Memory** — session (in-call), long-term (SQLite customer history), semantic (FAISS + pgvector), HAUP vector store
- **Call Summarization** — LLM-powered JSON summaries with CRM tags, configurable AI backend (`AVATAR_SUMMARY_AI`)
- **Smart Reply Suggestions** — real-time 3-suggestion engine for human agents
- **Speaker Diarization** — pyannote/speaker-diarization-3.1 speaker segmentation
- **NER Extraction** — phones, emails, intents, amounts, locations — regex-based, zero ML dependency
- **Admin Console** — 14-page React dashboard: services monitor, voice lab, STT diagnostics, memory explorer, translator, analytics, RAG search, call sessions, avatar manager
- **Production Logging** — structured colorized logs, rotating JSON files, `@log_execution` timing decorator
- **Backend Modes** — `web` (FastAPI + WebSocket) or `cli` (direct mic → speaker, no HTTP)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend API** | Python 3.11, FastAPI, Uvicorn, asyncio |
| **STT** | faster-whisper (CTranslate2), Silero VAD |
| **LLM** | Ollama (qwen2.5:7b), Google Gemini Flash |
| **TTS** | Parler TTS mini-v1.1, ai4bharat/indic-parler-tts |
| **Voice Cloning** | ResembleAI Chatterbox |
| **Translation** | facebook/m2m100_418M (M2M-100, 100 languages) |
| **Diarization** | pyannote/speaker-diarization-3.1 |
| **HAUP RAG** | Custom RAG engine (forward/reverse/graph cores, session analytics) |
| **Memory / RAG** | FAISS, LangChain, HuggingFace all-MiniLM-L6-v2, pgvector |
| **Long-term Memory** | SQLite (WAL mode) |
| **NER** | Custom regex engine (zero ML dependency) |
| **Frontend** | React 18, Vite, Tailwind CSS, Recharts, Lucide |
| **Real-time** | WebSocket (native FastAPI), LiveKit WebRTC (optional) |
| **Infra** | Python venv (per-service isolation), Windows batch orchestration |

---

## Architecture

```
                        ┌─────────────────────────────────────────┐
                        │           Admin Console :5173           │
                        │  React 18 + Vite — 14 pages             │
                        │  Dashboard / VoiceLab / Analytics /     │
                        │  MemoryExplorer / Translator / RAG      │
                        └────────────────┬────────────────────────┘
                                         │ HTTP REST
                        ┌────────────────▼────────────────────────┐
                        │        Backend (Monolith) :8000          │
                        │  FastAPI + WebSocket /ws/call            │
                        │                                          │
                        │  AudioBuf (VAD) → STT → LLM → TTS       │
                        │                                          │
                        │  ┌──────────────┐  ┌──────────────┐     │
                        │  │    Memory    │  │   Language   │     │
                        │  │  Session     │  │   Router     │     │
                        │  │  LT-SQLite   │  │   NER        │     │
                        │  │  FAISS/pg    │  │   Barge-in   │     │
                        │  │  Smart RAG   │  │  Translator  │     │
                        │  └──────────────┘  └──────────────┘     │
                        └───┬──────┬──────┬────────┬──────────────┘
                            │      │      │        │
              ┌─────────────┘      │      │        └───────────────────┐
              │                    │      │                             │
   ┌──────────▼────────┐  ┌────────▼──────────┐  ┌────────────────────▼──┐
   │   Diarization     │  │    Translator      │  │      Global TTS       │
   │   :8001           │  │    :8002           │  │      :8003            │
   │   pyannote 3.1    │  │   M2M-100 (100L)   │  │    Parler mini-v1.1   │
   └───────────────────┘  └────────────────────┘  └───────────────────────┘
                                                   ┌───────────────────────┐
                                                   │     Indic TTS :8004   │
                                                   │  ai4bharat Parler TTS │
                                                   └───────────────────────┘
                                                   ┌───────────────────────┐
                                                   │  Voice Cloner :8005   │
                                                   │  Chatterbox (Resemble)│
                                                   └───────────────────────┘

                        ┌─────────────────────────────────────────┐
                        │          HAUP RAG System                │
                        │  SahilRagSystem/haup/                   │
                        │  rag_core / forward_core / graph_core   │
                        │  reverse_core / rag_api / pgvector      │
                        │  Sessions DB + Analytics DB             │
                        └─────────────────────────────────────────┘
```

**Call Flow:**
```
Caller → WebSocket → AudioBuf (VAD) → stt_sync (Whisper)
      → _collapse_repetitions → interruption check
      → [Smart RAG inject] → llm_route_sync (Ollama → Gemini fallback)
      → _humanize_text → tts_client (Parler :8003 / :8004 / Chatterbox :8005)
      → base64 WAV → Caller
      → session_memory + FAISS + HAUP RAG persist (async)
      → call summarization (AVATAR_SUMMARY_AI=ollama|gemini)
```

---

## Project Structure

```
voice-ai-core/
│
├── backend/                        ← FastAPI monolith (root .venv)
│   ├── app.py                      ← Main server, WebSocket /ws/call
│   ├── main.py                     ← CLI mode (mic → speaker, no HTTP)
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
│   │   ├── rag_pipeline.py         ← FAISS-based RAG
│   │   ├── smart_rag.py            ← Inline RAG for live calls
│   │   ├── haup_rag_client.py      ← HAUP RAG HTTP client
│   │   ├── vector_store.py
│   │   ├── pg_memory.py            ← pgvector memory
│   │   └── summarization/          ← Call summarizer + smart suggestions
│   ├── agent/                      ← LiveKit session, ai_worker, IVR
│   └── documents/                  ← Knowledge base docs (for RAG)
│
├── SahilRagSystem/                 ← HAUP RAG System (standalone)
│   └── haup/
│       ├── rag_core/               ← Core RAG engine
│       ├── forward_core/           ← Forward retrieval pipeline
│       ├── reverse_core/           ← Reverse retrieval pipeline
│       ├── graph_core/             ← Graph-based RAG
│       ├── rag_api.py              ← FastAPI RAG endpoints
│       ├── rag_pipeline.py         ← Main pipeline orchestrator
│       ├── pgvector_client.py      ← pgvector integration
│       ├── rag_sessions.db         ← Session tracking
│       ├── rag_sessions_analytics.db ← Analytics DB
│       └── requirements.txt
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
├── admin-console/                  ← React 18 + Vite dashboard
│   └── src/
│       ├── pages/                  ← 14 pages
│       ├── components/             ← Layout + UI primitives
│       ├── hooks/                  ← usePolling, useServiceHealth
│       └── api/client.js           ← Axios clients for all services
│
├── models/                         ← Cached ML models (Whisper, Parler, etc.)
├── data/                           ← SQLite runtime databases
├── logs/                           ← Rotating log files
├── services.config                 ← Toggle services + model selection
├── start_all.bat                   ← Launch all enabled services
└── start_backend.bat               ← Launch backend only
```

---

## Installation & Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Ollama](https://ollama.ai) running locally with `qwen2.5:7b` pulled
- HuggingFace token (for diarization model)
- Google Gemini API key (optional fallback)

### Virtual Environment Structure

> Each service is isolated in its own venv. Do **not** mix them.

| Component | venv location |
|---|---|
| Backend | `.venv/` (root) |
| Diarization | `services/diarization_service/.venv_diarization/` |
| Translator | `services/translator_service/.venv/` |
| Global TTS | `services/tts_service/.venv/` |
| Indic TTS | `services/tts_service/.venv/` (shared with global) |
| Voice Cloner | `services/voice_cloner_service/.venv/` |
| HAUP RAG | `SahilRagSystem/haup/` (uses root .venv or own) |

### Step 1 — Clone & set up backend

```bash
git clone https://github.com/your-org/voice-ai-core.git
cd voice-ai-core

python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Step 2 — Set up each service venv

```bash
# Diarization
cd services/diarization_service
python -m venv .venv_diarization
.venv_diarization\Scripts\activate && pip install -r requirements.txt
deactivate && cd ../..

# Translator
cd services/translator_service
python -m venv .venv
.venv\Scripts\activate && pip install -r requirements.txt
deactivate && cd ../..

# TTS (shared — global + indic)
cd services/tts_service
python -m venv .venv
.venv\Scripts\activate && pip install -r global_tts/requirements.txt
deactivate && cd ../..

# Voice Cloner
cd services/voice_cloner_service
python -m venv .venv
.venv\Scripts\activate && pip install -r requirements.txt
deactivate && cd ../..
```

### Step 3 — Admin Console

```bash
cd admin-console && npm install && cd ..
```

### Step 4 — Configure environment

```env
GEMINI_API_KEY=your_key_here        # optional, LLM fallback
HF_TOKEN=your_hf_token              # required for diarization
OLLAMA_URL=http://localhost:11434/api/chat
LOG_LEVEL=INFO                      # DEBUG | INFO | WARNING | ERROR
LOG_JSON=false                      # true = structured JSON logs
```

### Step 5 — Configure services

Edit `services.config`:

```ini
WHISPER_MODEL=small         # tiny | base | small | medium | large-v2 | large-v3 | turbo

LIVEKIT=false
DIARIZATION=false
HAUP_RAG=true
RAG_TABLES=users,conversation_turns   # tables to search
SMART_RAG=false                       # inline RAG during calls
SMART_RAG_TABLES=conversation_turns

TRANSLATOR=false
TTS_GLOBAL=false
TTS_INDIC=true
VOICE_CLONER=false
OLLAMA=false
AVATAR_SUMMARY_AI=ollama              # ollama | gemini

BACKEND=false
BACKEND_MODE=web                      # web | cli
ADMIN_CONSOLE=true
```

### Step 6 — Start everything

```bash
start_all.bat          # all enabled services
# or
start_backend.bat      # backend only

cd admin-console && npm run dev   # admin console (separate terminal)
```

| Service | URL |
|---|---|
| Backend | http://localhost:8000 |
| Diarization | http://localhost:8001 |
| Translator | http://localhost:8002 |
| Global TTS | http://localhost:8003 |
| Indic TTS | http://localhost:8004 |
| Voice Cloner | http://localhost:8005 |
| Admin Console | http://localhost:5173 |

---

## Screenshots

Admin Console 

Dashboard 
<img width="1919" height="877" alt="image" src="https://github.com/user-attachments/assets/9ca6e3dd-c895-4269-ace4-485845cfea69" />

Services Monitor
<img width="1919" height="875" alt="image" src="https://github.com/user-attachments/assets/e906fd6f-6e2a-47d7-92d2-e8a6bd9fc49b" />

<img width="1919" height="878" alt="image" src="https://github.com/user-attachments/assets/302d1432-0cd6-456a-86d5-5b69669b82e1" />

Voice Labs
<img width="1919" height="874" alt="image" src="https://github.com/user-attachments/assets/62a5fff1-8afb-464d-9801-bb3b65a5c86e" />
Stt  Diagnostic
<img width="1919" height="855" alt="image" src="https://github.com/user-attachments/assets/0a1d30ae-f82a-4484-859d-1327d056d026" />
Translator
<img width="1919" height="880" alt="image" src="https://github.com/user-attachments/assets/0708b27f-9fd1-452b-8aaf-b81ddaac1f9e" />
Language Config
<img width="1919" height="873" alt="image" src="https://github.com/user-attachments/assets/db3b1d49-9062-4041-a8c9-c02775c1279b" />
Call Session
<img width="1919" height="864" alt="image" src="https://github.com/user-attachments/assets/40706201-3bc1-4c23-a195-e647ea18a82d" />
<img width="1919" height="865" alt="image" src="https://github.com/user-attachments/assets/dce98223-1c12-44c3-be93-a523e8f7b799" />
<img width="1919" height="882" alt="image" src="https://github.com/user-attachments/assets/e36b4061-a2fb-4e9b-bfd9-651680ea2da5" />

Rag Search
<img width="1919" height="874" alt="image" src="https://github.com/user-attachments/assets/9917753a-c416-4eff-b155-3ef6292e1577" />

<img width="1918" height="357" alt="image" src="https://github.com/user-attachments/assets/7f9fb45d-598a-4bb9-9b7e-2d2d35f28dce" />

Memory Exlorer 
<img width="1919" height="876" alt="image" src="https://github.com/user-attachments/assets/fe997b27-e140-4a77-8686-63053268dd2d" />

Avtar Manager 
<img width="1919" height="868" alt="image" src="https://github.com/user-attachments/assets/a0cbf62a-746c-49e4-93dc-89aa0ef9676f" />

<img width="1919" height="860" alt="image" src="https://github.com/user-attachments/assets/7d0fd024-d984-42a7-9afc-d8df1bbd4657" />







---

## Example Usage

### 1 — WebSocket Call (AI Agent)

Connect to `ws://localhost:8000/ws/call` with an init message:

```json
{
  "lang": "hi",
  "llm": "ollama",
  "voice": "Divya (Warm Female)"
}
```

The server responds with a greeting audio (base64 WAV), then enters the call loop — receiving PCM audio chunks and returning AI voice responses.

### 2 — Translate text

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

## Logging

All services use structured logging with execution timing:

```
[START] app.http_translate  trace=a3f9c1b2  at=10:15:32
[END]   app.http_translate  trace=a3f9c1b2  elapsed=0.230s
```

- `LOG_LEVEL=DEBUG` — verbose output
- `LOG_JSON=true` — structured JSON logs
- Files: `logs/voice_ai.log` (backend), `logs/services.log` (microservices) — 10 MB rotating, 5 backups
- Health check endpoints throttled to log once per 60 seconds

---

## License

Apache 2.0 — see [LICENSE](LICENSE)
