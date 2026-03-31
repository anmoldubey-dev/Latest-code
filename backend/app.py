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
import random
import sys
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional

import numpy as np
import requests as _req
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from backend.core.config import (
    BACKEND_ROOT, PROJECT_ROOT,
    LANGUAGE_CONFIG, SUPPORTED_STT_LANGS, OLLAMA_ENABLED, OLLAMA_URL, TTS_LANG_FALLBACK,
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

    logger.info("Loading FAISS conversation memory…")
    try:
        from backend.memory.vector_store import ConversationMemory
        _m["memory"] = ConversationMemory(
            index_path=str(BACKEND_ROOT / "faiss_index")
        )
        logger.info("FAISS memory ready.")
    except Exception as exc:
        logger.warning("FAISS memory unavailable: %s", exc)
        _m["memory"] = None

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

    # ── RAG pipeline ──────────────────────────────────────────────────────
    logger.info("Initialising RAG pipeline…")
    try:
        from backend.memory.rag_pipeline import get_rag_pipeline
        _m["rag"] = get_rag_pipeline()
        logger.info("RAG pipeline ready.")
    except Exception as exc:
        logger.warning("RAG pipeline unavailable: %s", exc)
        _m["rag"] = None

    # ── Long-term memory ──────────────────────────────────────────────────
    logger.info("Initialising long-term customer memory…")
    try:
        from backend.memory.long_term_memory import get_long_term_memory
        _m["long_term_memory"] = get_long_term_memory()
        logger.info("Long-term memory ready.")
    except Exception as exc:
        logger.warning("Long-term memory unavailable: %s", exc)
        _m["long_term_memory"] = None

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

    logger.info("📞 Call start | lang=%s llm=%s voice=%s agent=%s",
                lang, llm_key, voice_stem, agent_name)

    _greetings    = load_greetings()
    _raw_greeting = _greetings.get(lang) or generate_greeting(lang, agent_name)
    greeting_text = _raw_greeting.format(name=agent_name)
    logger.info("Greeting [%s] agent=%s: %r",
                "file" if lang in _greetings else "generated", agent_name, greeting_text)

    history: List[dict] = []

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

            if _m.get("memory"):
                async def _persist():
                    try:
                        await loop.run_in_executor(
                            None, _m["memory"].save_interaction,
                            user_text, ai_text, lang,
                        )
                    except Exception as exc:
                        logger.debug("FAISS persist error: %s", exc)
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
        logger.info("📵 Call ended | lang=%s llm=%s", lang, llm_key)
