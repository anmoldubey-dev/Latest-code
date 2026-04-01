# [ START ]
#     |
#     v
# +----------------------------------------------+
# | lifespan()                                   |
# | * init all models at startup                 |
# +----------------------------------------------+
#     |
#     |----> <StreamingTranscriber> -> __init__()
#     |        * load Whisper STT model
#     |
#     |----> <GeminiResponder> -> __init__()
#     |        * init Gemini Flash client
#     |
#     |----> load_greetings()
#     |        * load greetings from xlsx or txt
#     |
#     |----> <ConversationMemory> -> __init__()
#     |        * load or create FAISS index
#     |
#     |----> build_voice_registry()
#     |        * build static voice registry
#     |
#     |----> get_haup_client()
#     |        * init HAUP RAG async client
#     |
#     |----> get_diarization_client()
#     |        * init diarization async client
#     |
#     v
# +----------------------------------------------+
# | index()                                      |
# | * serve main frontend HTML                   |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | stt_test_page()                              |
# | * serve STT tester HTML page                 |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | api_voices()                                 |
# | * return voice registry dict                 |
# +----------------------------------------------+
#     |
#     v
# +----------------------------------------------+
# | ws_call()                                    |
# | * handle WebSocket call session              |
# +----------------------------------------------+
#     |
#     |----> extract_agent_name()
#     |        * parse name from voice stem
#     |
#     |----> load_greetings()
#     |        * fetch greeting for language
#     |
#     |----> generate_greeting()
#     |        * fallback greeting generation
#     |
#     |----> tts()
#     |        * synthesize greeting audio
#     |
#     |----> <HAUPRagClient> -> start_session()
#     |        * create per-call RAG session
#     |
#     |----> <AudioBuf> -> push()
#     |        * buffer incoming PCM audio
#     |
#     |----> <AudioBuf> -> ready()
#     |        * check utterance complete
#     |
#     |----> <AudioBuf> -> flush()
#     |        * drain buffer for processing
#     |
#     v
# +----------------------------------------------+
# | process_turn()                               |
# | * run one full STT -> LLM -> TTS turn        |
# +----------------------------------------------+
#     |
#     |----> stt_sync()
#     |        * transcribe PCM to text
#     |
#     |----> _collapse_repetitions()
#     |        * remove repeated phrases
#     |
#     |----> _is_hallucination()
#     |        * detect STT hallucination
#     |
#     |----> <HAUPRagClient> -> get_context()
#     |        * async RAG query for LLM context
#     |
#     |----> _gemini_sync()
#     |        * generate Gemini AI reply
#     |      OR
#     |----> _qwen_sync()
#     |        * generate Qwen AI reply
#     |
#     |----> _humanize_text()
#     |        * normalize text for TTS
#     |
#     |----> tts()
#     |        * HTTP synthesize reply to WAV
#     |
#     |----> <ConversationMemory> -> save_interaction()
#     |        * persist turn to FAISS index
#     |
#     v
# +----------------------------------------------+
# | _post_call_tasks()  [background task]        |
# | * save WAV, run diarization, save call record|
# +----------------------------------------------+
#     |
#     |----> wave.open() / write PCM chunks
#     |        * save per-session .wav file
#     |
#     |----> <DiarizationClient> -> diarize()
#     |        * speaker diarization (background)
#     |
#     |----> <LongTermMemory> -> save_call_record()
#     |        * persist full call record to SQLite
#     |
#     v
# +----------------------------------------------+
# | ws_stt_test()                                |
# | * stream PCM chunks and transcribe           |
# +----------------------------------------------+
#     |
#     |----> <StreamingTranscriber> -> transcribe_pcm()
#     |        * transcribe buffered PCM
#     |
#     v
# [ END ]

import asyncio
import base64
import json
import os
import random
import sys
import threading
import time
import uuid
import wave
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import httpx
import numpy as np
import requests as _req
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from backend.core.config import (
    BACKEND_ROOT, PROJECT_ROOT,
    LANGUAGE_CONFIG, SUPPORTED_STT_LANGS, OLLAMA_ENABLED, OLLAMA_URL, TTS_LANG_FALLBACK,
    SMART_RAG_ENABLED, RAG_TABLES,
)
from backend.core.state   import _m
from backend.core.persona import extract_agent_name, generate_greeting
from backend.speech.stt_core          import stt_sync
from backend.speech.stt.postprocessor import _collapse_repetitions, _is_hallucination
from backend.speech.tts_client     import tts, _humanize_text, build_voice_registry, _INDIC_TTS_URL, _GLOBAL_TTS_URL
from backend.language.llm_core     import _gemini_sync, _qwen_sync
from backend.core.greeting_loader import load_greetings

sys.path.insert(0, str(PROJECT_ROOT))
load_dotenv(PROJECT_ROOT / ".env")

from backend.core.logger    import setup_logger
from backend.core.decorator import log_execution

logger = setup_logger("callcenter")

STATIC = BACKEND_ROOT / "static"
STATIC.mkdir(exist_ok=True)

# Directory for per-session call recordings (used by diarization)
_RECORDINGS_DIR = PROJECT_ROOT / "data" / "call_recordings"
_RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _t0 = time.perf_counter()
    logger.info("[START] lifespan  at=%s", datetime.now().strftime("%H:%M:%S"))

    from backend.speech.stt.transcriber import StreamingTranscriber
    _m["stt"] = StreamingTranscriber()

    logger.info("Initialising Gemini responder…")
    try:
        from backend.language.llm.gemini_responder import GeminiResponder
        _m["gemini"] = GeminiResponder()
        logger.info("Gemini ready.")
    except Exception as exc:
        logger.warning("Gemini unavailable: %s", exc)
        _m["gemini"] = None

    # ── Ollama (primary LLM) ──────────────────────────────────────────────
    if OLLAMA_ENABLED:
        logger.info("Initialising Ollama responder (primary LLM)…")
        try:
            from backend.language.llm.ollama_responder import OllamaResponder
            ollama_resp = OllamaResponder(model="qwen2.5:7b")
            if ollama_resp.health_check():
                _m["ollama"] = ollama_resp
                logger.info("Ollama ready  model=qwen2.5:7b")
            else:
                _m["ollama"] = None
                logger.warning("Ollama not reachable — LLM router will fall back to Gemini")
        except Exception as exc:
            logger.warning("Ollama init skipped: %s", exc)
            _m["ollama"] = None
    else:
        _m["ollama"] = None
        logger.info("Ollama disabled (OLLAMA=false) — using Gemini")

    _m["greetings"] = load_greetings()

    # pgvector conversation memory (Neon) — per-turn embeddings
    logger.info("Initialising pgvector conversation memory (Neon)…")
    try:
        from backend.memory import pg_memory as _pgm
        _pgm._get_embedder()   # warm up embedding model at startup
        _m["pg_memory"] = _pgm
        logger.info("pgvector memory ready.")
    except Exception as exc:
        logger.warning("pgvector memory unavailable: %s", exc)
        _m["pg_memory"] = None

    DOCUMENTS_DIR     = BACKEND_ROOT / "documents"
    MAX_CONTEXT_CHARS = 8000
    company_ctx       = ""
    if DOCUMENTS_DIR.exists():
        for doc in sorted(DOCUMENTS_DIR.glob("*.txt")):
            try:
                company_ctx += doc.read_text(encoding="utf-8") + "\n\n"
            except Exception as exc:
                logger.warning("Could not read %s: %s", doc.name, exc)
        company_ctx = company_ctx.strip()[:MAX_CONTEXT_CHARS]
        if company_ctx:
            logger.info("Company context: %d chars loaded.", len(company_ctx))
        else:
            logger.info("Documents folder empty — no context loaded.")
    else:
        logger.info("No documents/ folder — running without company context.")
    _m["company_context"] = company_ctx

    # Build voice registry from both TTS microservices (Global + Indic).
    # Static — does not require the TTS services to be running at startup.
    voice_registry = build_voice_registry()
    _m["voice_registry"] = voice_registry
    logger.info("Voice registry: %s", {k: len(v) for k, v in voice_registry.items()})

    # ── HAUP RAG (replaces FAISS RAG pipeline) ────────────────────────
    logger.info("Initialising HAUP RAG client…")
    try:
        from backend.memory.haup_rag_client import get_haup_client
        haup = get_haup_client()
        haup_ok = await haup.health_check()
        _m["haup_rag"] = haup
        if haup_ok:
            logger.info("HAUP RAG service reachable on :8088 — RAG enabled.")
        else:
            logger.warning(
                "HAUP RAG service not reachable on :8088 — "
                "calls will proceed without RAG context."
            )
    except Exception as exc:
        logger.warning("HAUP RAG client init failed: %s", exc)
        _m["haup_rag"] = None

    # ── Diarization client ────────────────────────────────────────────
    logger.info("Initialising diarization client…")
    try:
        from backend.services.diarization_client import get_diarization_client
        diar = get_diarization_client()
        diar_ok = await diar.health_check()
        _m["diarization"] = diar
        if diar_ok:
            logger.info("Diarization service reachable on :8001 — post-call diarization enabled.")
        else:
            logger.warning(
                "Diarization service not reachable on :8001 — "
                "post-call diarization will be skipped."
            )
        _m["diarization_available"] = diar_ok
    except Exception as exc:
        logger.warning("Diarization client init failed: %s", exc)
        _m["diarization"] = None
        _m["diarization_available"] = False

    # pg_memory also handles call records — no SQLite needed
    _m["long_term_memory"] = _m.get("pg_memory")

    logger.info(
        "[END]   lifespan  elapsed=%.3fs  — all models ready, server is up.",
        time.perf_counter() - _t0,
    )
    yield
    logger.info("Shutdown complete.")


app = FastAPI(title="SR Comsoft Call Center AI", lifespan=lifespan)

from backend.agent import livekit_router          # noqa: E402
app.include_router(livekit_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/assets/call_centre_room.wav")
async def serve_room_audio():
    path = PROJECT_ROOT / "services" / "tts_service" / "indic_tts" / "assets" / "call_centre_room.wav"
    if not path.exists():
        from fastapi.responses import Response
        return Response(status_code=404)
    from fastapi.responses import FileResponse
    return FileResponse(str(path), media_type="audio/wav")


@app.get("/")
@log_execution
async def index():
    html = STATIC / "index.html"
    if not html.exists():
        return HTMLResponse("<h1>index.html not found in backend/static/</h1>", status_code=404)
    return HTMLResponse(html.read_text(encoding="utf-8"))


@app.get("/stt-test")
@log_execution
async def stt_test_page():
    html = BACKEND_ROOT / "stt" / "stt_test.html"
    if not html.exists():
        return HTMLResponse("<h1>stt_test.html not found in backend/stt/</h1>", status_code=404)
    return HTMLResponse(html.read_text(encoding="utf-8"))


@app.get("/api/voices")
@log_execution
async def api_voices():
    return _m.get("voice_registry", {})


@app.get("/api/sessions")
async def api_sessions(limit: int = 100):
    pgm = _m.get("pg_memory")
    if not pgm:
        return {"sessions": [], "total": 0}
    loop = asyncio.get_event_loop()
    records = await loop.run_in_executor(None, pgm.get_recent_sessions, limit)
    return {"sessions": records, "total": len(records)}


@app.post("/haup/sessions")
async def haup_create_session(request: Request):
    async with httpx.AsyncClient(timeout=5) as c:
        r = await c.post("http://localhost:8088/sessions", content=await request.body(), headers={"Content-Type": "application/json"})
    return JSONResponse(r.json(), status_code=r.status_code)

@app.post("/haup/sessions/{session_id}/ask")
async def haup_ask(session_id: str, request: Request):
    async with httpx.AsyncClient(timeout=600) as c:
        r = await c.post(f"http://localhost:8088/sessions/{session_id}/ask", content=await request.body(), headers={"Content-Type": "application/json"})
    return JSONResponse(r.json(), status_code=r.status_code)

@app.get("/haup/health")
async def haup_health():
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get("http://localhost:8088/health")
        return JSONResponse(r.json(), status_code=r.status_code)
    except Exception:
        return JSONResponse({"status": "offline"}, status_code=503)

@app.get("/api/turns")
async def api_turns(limit: int = 200):
    pgm = _m.get("pg_memory")
    if not pgm:
        return {"turns": [], "total": 0}
    loop = asyncio.get_event_loop()

    def _fetch():
        from backend.memory.pg_memory import _connect
        try:
            with _connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """SELECT session_id, role, text, lang, ts
                           FROM conversation_turns
                           ORDER BY ts DESC LIMIT %s""",
                        (limit,),
                    )
                    rows = cur.fetchall()
            return [
                {
                    "session_id": r[0],
                    "role":       r[1],
                    "text":       r[2],
                    "lang":       r[3],
                    "ts":         r[4].isoformat() if r[4] else None,
                }
                for r in rows
            ]
        except Exception:
            return []

    turns = await loop.run_in_executor(None, _fetch)
    return {"turns": turns, "total": len(turns)}


@app.get("/api/sessions/{session_id}")
async def api_session_detail(session_id: str):
    pgm = _m.get("pg_memory")
    if not pgm:
        return {"error": "pg_memory unavailable"}
    loop = asyncio.get_event_loop()
    record = await loop.run_in_executor(None, pgm.get_session_by_id, session_id)
    if record is None:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "not found"}, status_code=404)
    return record


@app.websocket("/ws/stt-test")
@log_execution
async def ws_stt_test(ws: WebSocket, lang: str = "en", gap: int = 1000):
    """
    STT diagnostic endpoint.
    Receives raw PCM float32 chunks (~100 ms each) from the browser AudioWorklet,
    buffers speech frames, then transcribes after `gap` ms of post-speech silence.
    Returns JSON: {type, text, rms, elapsed_ms}
    """
    await ws.accept()

    SILENCE_GAP = gap / 1000.0   # seconds
    loop        = asyncio.get_event_loop()

    pcm_buf:         list          = []
    last_speech_time: float | None = None   # set when voice energy detected
    processing:      bool          = False  # True while Whisper is running

    async def _transcribe(pcm: np.ndarray) -> None:
        nonlocal processing
        processing = True
        raw_rms = float(np.sqrt(np.mean(pcm ** 2)))
        await ws.send_json({"type": "processing"})
        t0 = loop.time()
        try:
            stt_prompt = LANGUAGE_CONFIG.get(lang, {}).get("stt_prompt")
            text = await loop.run_in_executor(
                None,
                lambda: _m["stt"].transcribe_pcm(
                    pcm, language=lang, initial_prompt=stt_prompt
                )
            )
        except Exception:
            logger.exception("[STT-test] transcription error")
            text = ""
        elapsed_ms = int((loop.time() - t0) * 1000)
        processing  = False
        if text:
            text = _collapse_repetitions(text)
            await ws.send_json({
                "type":       "transcript",
                "text":       text,
                "rms":        raw_rms,
                "elapsed_ms": elapsed_ms,
            })
        else:
            await ws.send_json({"type": "skipped", "rms": raw_rms, "reason": "whisper"})

    try:
        while True:
            msg = await ws.receive()

            if "bytes" in msg and msg["bytes"]:
                chunk = np.frombuffer(msg["bytes"], dtype=np.float32)
                rms   = float(np.sqrt(np.mean(chunk ** 2)))

                if rms > 0.015:
                    # Active speech — buffer and update timer
                    pcm_buf.append(chunk)
                    last_speech_time = loop.time()
                elif last_speech_time is not None:
                    # Post-speech silence — keep buffering so Whisper sees natural end
                    pcm_buf.append(chunk)
                    now = loop.time()
                    if not processing and (now - last_speech_time) >= SILENCE_GAP:
                        # Silence gap elapsed — transcribe
                        pcm           = np.concatenate(pcm_buf)
                        pcm_buf       = []
                        last_speech_time = None
                        asyncio.ensure_future(_transcribe(pcm))

            elif "text" in msg and msg["text"]:
                evt = json.loads(msg["text"])
                if evt.get("type") == "end":
                    break

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("[STT-test] WS error")


@app.websocket("/ws/call")
@log_execution
async def ws_call(ws: WebSocket):
    await ws.accept()

    try:
        raw  = await asyncio.wait_for(ws.receive_text(), timeout=10.0)
        init = json.loads(raw)
    except Exception:
        await ws.close(1002, "Expected JSON init message")
        return

    lang       = init.get("lang",  "en")
    llm_key    = init.get("llm",   "gemini")
    voice_name = init.get("voice", "")

    # Stable caller identifier: phone from init payload, else WS client address
    client_phone = (
        init.get("phone")
        or str(ws.client.host if ws.client else "unknown")
    )

    registry    = _m.get("voice_registry", {})
    lang_voices = registry.get(lang) or registry.get("en") or []
    selected    = (
        next((v for v in lang_voices if v["name"] == voice_name), None)
        or (lang_voices[0] if lang_voices else None)
    )
    if selected is None:
        for voices in registry.values():
            if voices:
                selected = voices[0]
                break
    # voice_stem: display name like "Divya (Warm Female)" used for agent name + LLM persona
    voice_stem = selected["name"] if selected else (voice_name or "Agent")
    agent_name = extract_agent_name(voice_stem)

    # ── Session identifiers ───────────────────────────────────────────
    session_id = str(uuid.uuid4())

    logger.info("📞 Call start | session=%s lang=%s llm=%s voice=%s agent=%s",
                session_id[:8], lang, llm_key, voice_stem, agent_name)

    # ── Returning-caller context (injected into first LLM prompt) ────
    customer_ctx = ""
    if _m.get("pg_memory"):
        try:
            customer_ctx = await asyncio.get_event_loop().run_in_executor(
                None, _m["pg_memory"].get_customer_context, client_phone
            )
            if customer_ctx:
                logger.info("[PGMem] returning caller context loaded (%d chars)", len(customer_ctx))
        except Exception as exc:
            logger.debug("[PGMem] get_customer_context failed: %s", exc)
    _m["customer_context"] = customer_ctx

    # ── HAUP RAG — create per-call session ───────────────────────────
    rag_session_id = ""
    if _m.get("haup_rag"):
        rag_session_id = await _m["haup_rag"].start_session(session_id)

    _greetings    = load_greetings()
    _raw_greeting = _greetings.get(lang) or generate_greeting(lang, agent_name)
    greeting_text = _raw_greeting.format(name=agent_name)
    logger.info("Greeting [%s] agent=%s: %r",
                "file" if lang in _greetings else "generated", agent_name, greeting_text)

    history: List[dict] = []

    # Per-session tracking for post-call persistence
    session_turns: List[dict] = []
    call_audio_chunks: List[np.ndarray] = []   # raw PCM float32 for WAV save

    # Simple VAD — identical to /ws/stt-test (proven reliable)
    pcm_buf:          list         = []
    last_speech_time: float | None = None
    SILENCE_GAP = 0.9   # seconds of post-speech silence before STT fires

    lock         = asyncio.Lock()
    loop         = asyncio.get_event_loop()
    interrupted  = False
    current_turn_task: Optional[asyncio.Task] = None

    # ── Generate greeting TTS while keeping WS alive with periodic pings ────
    async def _gen_greeting() -> str:
        try:
            wav = await tts(greeting_text, lang, voice_stem)
            return base64.b64encode(wav).decode()
        except Exception:
            logger.warning("Greeting TTS failed — sending text only")
            return ""

    greet_task = asyncio.create_task(_gen_greeting())

    # Keep WS alive: drain incoming frames + send pings every 10 s
    while not greet_task.done():
        try:
            msg = await asyncio.wait_for(ws.receive(), timeout=10.0)
            if "text" in msg and msg["text"]:
                if json.loads(msg["text"]).get("type") == "end":
                    greet_task.cancel()
                    return
            # PCM frames during greeting generation are silently dropped —
            # user will speak again after greeting plays
        except asyncio.TimeoutError:
            # Send a ping to keep the connection alive
            try:
                await ws.send_json({"type": "ping"})
            except Exception:
                greet_task.cancel()
                return
        except Exception:
            greet_task.cancel()
            return

    try:
        g_b64 = await greet_task
    except BaseException:
        g_b64 = ""

    await ws.send_json({"type": "greeting", "text": greeting_text,
                        "audio": g_b64, "agent_name": agent_name})
    history.append({"role": "assistant", "text": greeting_text})
    session_turns.append({"role": "assistant", "text": greeting_text, "ts": time.time()})

    async def process_turn(pcm: np.ndarray) -> None:
        nonlocal interrupted, current_turn_task
        logger.info("🎤 VAD fired — pcm=%.2fs  starting STT", len(pcm) / 16_000)

        async with lock:
            try:
                user_text = await loop.run_in_executor(None, stt_sync, pcm, lang)
            except Exception:
                logger.exception("STT error")
                return
            if not user_text:
                return

            user_text = _collapse_repetitions(user_text)
            if _is_hallucination(user_text):
                logger.warning("Hallucination dropped")
                return

            try:
                await ws.send_json({"type": "transcript", "text": user_text})
            except Exception:
                return

            history.append({"role": "user", "text": user_text})
            hist_snap = list(history)

            # ── HAUP RAG context (session-based) ─────────────────────
            rag_context = ""
            if _m.get("haup_rag") and rag_session_id:
                rag_context = await _m["haup_rag"].get_context(rag_session_id, user_text)

            # ── Smart RAG (direct pgvector, runs if SMART_RAG=true) ───
            if SMART_RAG_ENABLED and RAG_TABLES:
                try:
                    from backend.memory.smart_rag import search as _smart_rag_search
                    smart_ctx = await loop.run_in_executor(
                        None, _smart_rag_search, user_text, RAG_TABLES
                    )
                    if smart_ctx:
                        rag_context = (rag_context + "\n\n" + smart_ctx).strip() if rag_context else smart_ctx
                        logger.info("[SmartRAG] context injected (%d chars)", len(smart_ctx))
                except Exception as exc:
                    logger.warning("[SmartRAG] failed: %s", exc)

            # Inject RAG context + customer history into state for LLM functions
            _m["rag_context"]      = rag_context
            _m["customer_context"] = customer_ctx

            llm_fn  = _gemini_sync if llm_key == "gemini" else _qwen_sync
            llm_fut = loop.run_in_executor(None, llm_fn, hist_snap, lang, voice_stem)

            try:
                ai_text = await llm_fut
            except Exception:
                logger.exception("LLM error")
                canned = LANGUAGE_CONFIG.get(lang, {}).get(
                    "canned_error",
                    "Sorry, I had a connection issue. Could you repeat that?",
                )
                try:
                    await ws.send_json({"type": "response", "text": canned, "audio": ""})
                except Exception:
                    pass
                return

            if not ai_text:
                return

            await asyncio.sleep(random.uniform(0.2, 0.5))

            if interrupted:
                interrupted = False
                barge_text  = random.choice(
                    LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG["en"])["barge_phrases"]
                )
                logger.info("🛑 Barge-in pivot: %r", barge_text)
                history.append({"role": "assistant", "text": barge_text})
                session_turns.append({"role": "assistant", "text": barge_text, "ts": time.time()})
                try:
                    b_wav = await tts(barge_text, lang, voice_stem)
                    b64   = base64.b64encode(b_wav).decode()
                except Exception:
                    b64 = ""
                try:
                    await ws.send_json({"type": "response", "text": barge_text,
                                        "audio": b64, "barge_in": True})
                except Exception:
                    pass
                return

            history.append({"role": "assistant", "text": ai_text})
            session_turns.append({"role": "user",      "text": user_text, "ts": time.time()})
            session_turns.append({"role": "assistant",  "text": ai_text,  "ts": time.time()})

            tts_text = _humanize_text(ai_text, lang)
            try:
                wav = await tts(tts_text, lang, voice_stem)
                a64 = base64.b64encode(wav).decode()
            except Exception:
                logger.exception("TTS error")
                a64 = ""
            try:
                await ws.send_json({"type": "response", "text": ai_text, "audio": a64})
            except Exception:
                logger.debug("WS send failed — client disconnected?")

            if _m.get("pg_memory"):
                async def _persist():
                    try:
                        pgm = _m["pg_memory"]
                        await loop.run_in_executor(None, pgm.save_turn, session_id, "user",      user_text, lang)
                        await loop.run_in_executor(None, pgm.save_turn, session_id, "assistant", ai_text,   lang)
                    except Exception as exc:
                        logger.debug("pgvector turn persist error: %s", exc)
                asyncio.create_task(_persist())

    try:
        while True:
            msg = await ws.receive()

            if "bytes" in msg and msg["bytes"]:
                chunk = np.frombuffer(msg["bytes"], dtype=np.float32)
                rms   = float(np.sqrt(np.mean(chunk ** 2)))
                logger.debug("[RX] RMS=%.6f  speech_frames=%d  last_speech=%.3fs",
                             rms, len(pcm_buf),
                             loop.time() - last_speech_time if last_speech_time else -1.0)

                # Accumulate ALL audio for post-call WAV recording
                call_audio_chunks.append(chunk)

                if rms > 0.015:
                    logger.info("[RX] VAD triggered  RMS=%.6f", rms)
                    pcm_buf.append(chunk)
                    last_speech_time = loop.time()
                elif last_speech_time is not None:
                    # Post-speech silence — keep buffering so Whisper sees natural end
                    pcm_buf.append(chunk)
                    now = loop.time()
                    if not lock.locked() and (now - last_speech_time) >= SILENCE_GAP:
                        logger.info("[RX] STT start  buf=%.2fs", len(pcm_buf) * 1600 / 16_000)
                        pcm = np.concatenate(pcm_buf)
                        pcm_buf.clear()
                        last_speech_time = None
                        current_turn_task = asyncio.create_task(process_turn(pcm))

            elif "text" in msg and msg["text"]:
                evt      = json.loads(msg["text"])
                evt_type = evt.get("type")

                if evt_type == "end":
                    logger.info("Client sent end-of-call")
                    break

                elif evt_type == "interrupt":
                    interrupted = True
                    logger.info("🛑 Barge-in received")
                    # Cancel the in-flight turn so LLM/TTS stops immediately
                    if current_turn_task and not current_turn_task.done():
                        current_turn_task.cancel()
                    # Signal both TTS services to stop
                    for _tts_url in (_INDIC_TTS_URL, _GLOBAL_TTS_URL):
                        def _cancel_tts(u=_tts_url):
                            try: _req.post(f"{u}/cancel", timeout=1)
                            except Exception: pass
                        threading.Thread(target=_cancel_tts, daemon=True).start()
                    # Do NOT clear pcm_buf — user is already speaking, keep buffering
                    # interrupted flag stays True until process_turn checks it

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception:
        logger.exception("WS loop error")
    finally:
        logger.info("📵 Call ended | session=%s lang=%s llm=%s", session_id[:8], lang, llm_key)

        # ── HAUP RAG — clean up per-call session ─────────────────────
        if _m.get("haup_rag") and rag_session_id:
            asyncio.create_task(_m["haup_rag"].end_session(rag_session_id))

        # ── Post-call background tasks (WAV save + diarization + LTM) ─
        asyncio.create_task(
            _post_call_tasks(
                session_id=session_id,
                lang=lang,
                client_phone=client_phone,
                session_turns=list(session_turns),
                audio_chunks=list(call_audio_chunks),
            )
        )


async def _post_call_tasks(
    session_id: str,
    lang: str,
    client_phone: str,
    session_turns: List[dict],
    audio_chunks: List[np.ndarray],
) -> None:
    """
    Background task that runs after the WebSocket closes:
      1. Save accumulated PCM as a .wav file (16-bit, 16 kHz, mono).
      2. Run speaker diarization on the saved file (if service is up).
      3. Persist the full call record to SQLite long-term memory.
    """
    loop = asyncio.get_event_loop()

    # ── 1. Save WAV ───────────────────────────────────────────────────
    wav_path: Optional[Path] = None
    if audio_chunks:
        try:
            pcm_full = np.concatenate(audio_chunks)
            # Convert float32 [-1, 1] → int16
            pcm_int16 = (np.clip(pcm_full, -1.0, 1.0) * 32767).astype(np.int16)
            wav_path = _RECORDINGS_DIR / f"{session_id}.wav"

            def _write_wav():
                with wave.open(str(wav_path), "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)      # 16-bit
                    wf.setframerate(16000)  # 16 kHz — matches STT pipeline
                    wf.writeframes(pcm_int16.tobytes())

            await loop.run_in_executor(None, _write_wav)
            logger.info("[Post-call] WAV saved  session=%s  path=%s", session_id[:8], wav_path)
        except Exception as exc:
            logger.warning("[Post-call] WAV save failed (session=%s): %s", session_id[:8], exc)
            wav_path = None

    # ── 2. Diarization ────────────────────────────────────────────────
    diarization_segments: List[dict] = []
    if wav_path and _m.get("diarization") and _m.get("diarization_available"):
        try:
            hf_token = os.getenv("HF_TOKEN", "")
            diarization_segments = await _m["diarization"].diarize(
                file_path=str(wav_path),
                hf_token=hf_token,
            )
            logger.info(
                "[Post-call] diarization complete  session=%s  speakers=%d  segments=%d",
                session_id[:8],
                len({s.get("speaker") for s in diarization_segments}),
                len(diarization_segments),
            )
        except Exception as exc:
            logger.warning("[Post-call] diarization error (session=%s): %s", session_id[:8], exc)

    # ── 3. Save call record to Neon (pgvector) ────────────────────────
    if _m.get("pg_memory") and session_turns:
        try:
            await loop.run_in_executor(
                None,
                _m["pg_memory"].save_call_record,
                session_id, client_phone, lang,
                session_turns, diarization_segments,
            )
        except Exception as exc:
            logger.warning("[Post-call] pg save failed (session=%s): %s", session_id[:8], exc)
